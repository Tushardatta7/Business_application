import { useState } from "react";
import { useListParties, useCreateParty, useDeleteParty, useGetAgingReport, getListPartiesQueryKey, getGetAgingReportQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import DateRangePicker, { firstOfMonth, todayStr } from "@/components/DateRangePicker";

function formatBDT(amount: number) {
  return `৳${Number(Math.abs(amount)).toLocaleString("en-IN")}`;
}

const BUCKET_LABELS: Record<string, { label: string; color: string }> = {
  current: { label: "চলতি", color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  overdue_30: { label: "৩০+ দিন বাকি", color: "text-amber-600 bg-amber-50 border-amber-200" },
  overdue_60: { label: "৬০+ দিন বাকি", color: "text-orange-600 bg-orange-50 border-orange-200" },
  overdue_90plus: { label: "৯০+ দিন বাকি", color: "text-red-600 bg-red-50 border-red-200" },
};

export default function Parties() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", nameBn: "", phone: "", address: "", type: "customer" as "customer" | "supplier" | "both" });
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "aging">("all");
  const [fromDate, setFromDate] = useState(firstOfMonth());
  const [toDate, setToDate] = useState(todayStr());

  const { data: parties = [], isLoading } = useListParties({ query: { queryKey: getListPartiesQueryKey() } });
  const { data: aging = [] } = useGetAgingReport({ query: { queryKey: getGetAgingReportQueryKey() } });

  const createParty = useCreateParty({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListPartiesQueryKey() });
        qc.invalidateQueries({ queryKey: getGetAgingReportQueryKey() });
        setShowForm(false);
        setForm({ name: "", nameBn: "", phone: "", address: "", type: "customer" });
      },
    },
  });

  const deleteParty = useDeleteParty({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListPartiesQueryKey() });
        qc.invalidateQueries({ queryKey: getGetAgingReportQueryKey() });
      },
    },
  });

  const filtered = parties.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.nameBn || "").includes(search) ||
      (p.phone || "").includes(search);
    const lastTx = p.lastTransactionDate;
    const matchDate = !lastTx || (lastTx >= fromDate && lastTx <= toDate);
    return matchSearch && matchDate;
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name) return;
    setSubmitting(true);
    try {
      await createParty.mutateAsync({ data: { name: form.name, nameBn: form.nameBn || undefined, phone: form.phone || undefined, address: form.address || undefined, type: form.type } });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-4 md:px-8 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">নামে হিসাব</h1>
          <p className="text-muted-foreground text-sm mt-1">পার্টি লেজার</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="bg-primary text-primary-foreground px-4 py-3 rounded-lg text-sm font-medium min-h-[48px] hover:opacity-90 transition-opacity">
          + নতুন পার্টি
        </button>
      </div>

      {/* Date Range */}
      <div className="mb-4">
        <DateRangePicker from={fromDate} to={toDate} onFromChange={setFromDate} onToChange={setToDate} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg mb-5 w-fit">
        {[{ key: "all", label: "সব পার্টি" }, { key: "aging", label: "বাকির হিসাব" }].map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key as "all" | "aging")}
            className={cn("px-4 py-2 rounded-md text-sm font-medium transition-colors min-h-[40px]",
              activeTab === tab.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      {activeTab === "all" && (
        <div className="mb-4">
          <input type="search" placeholder="নাম, ফোন নম্বর দিয়ে খুঁজুন..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-input rounded-lg px-3 py-3 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
      )}

      {/* New Party Form */}
      {showForm && (
        <div className="bg-card border border-card-border rounded-xl p-5 mb-6 shadow-sm">
          <h3 className="text-base font-semibold mb-4">নতুন পার্টি যোগ করুন</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">নাম (ইংরেজি)</label>
                <input type="text" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">নাম (বাংলা)</label>
                <input type="text" placeholder="বাংলা নাম" value={form.nameBn} onChange={(e) => setForm({ ...form, nameBn: e.target.value })}
                  className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">ফোন নম্বর</label>
                <input type="tel" placeholder="01XXXXXXXXX" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">ধরন</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "customer" | "supplier" | "both" })}
                  className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="customer">ক্রেতা</option>
                  <option value="supplier">সাপ্লাইয়ার</option>
                  <option value="both">উভয়</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">ঠিকানা</label>
              <input type="text" placeholder="ঠিকানা লিখুন" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={submitting || !form.name}
                className="flex-1 bg-primary text-primary-foreground py-3 rounded-lg text-sm font-medium min-h-[48px] disabled:opacity-50">
                {submitting ? "সংরক্ষণ হচ্ছে..." : "সংরক্ষণ করুন"}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-6 py-3 rounded-lg text-sm font-medium border border-input bg-card min-h-[48px]">বাতিল</button>
            </div>
          </form>
        </div>
      )}

      {/* All Parties Tab */}
      {activeTab === "all" && (
        <div className="bg-card rounded-xl border border-card-border shadow-sm overflow-hidden">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-4 border-b border-border last:border-0 animate-pulse">
                <div className="space-y-1.5"><div className="h-3 bg-muted rounded w-28" /><div className="h-2.5 bg-muted rounded w-20" /></div>
                <div className="h-4 bg-muted rounded w-20" />
              </div>
            ))
          ) : !filtered.length ? (
            <div className="px-4 py-12 text-center text-muted-foreground text-sm">
              {search ? "কোনো ফলাফল পাওয়া যায়নি" : "এখনো কোনো পার্টি নেই"}
            </div>
          ) : (
            filtered.map((party) => {
              const balance = Number(party.balance);
              const agingInfo = aging.find((a) => a.partyId === party.id);
              const bucket = agingInfo?.bucket;
              return (
                <div key={party.id} className="group relative flex items-center border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <Link href={`/parties/${party.id}`}
                    className="flex flex-1 items-center justify-between px-4 py-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{party.nameBn || party.name}</p>
                        {bucket && bucket !== "current" && balance > 0 && (
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", BUCKET_LABELS[bucket]?.color)}>
                            {BUCKET_LABELS[bucket]?.label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{party.phone || party.address || party.type}</p>
                    </div>
                    <div className="text-right pr-8">
                      <p className={cn("text-sm font-semibold", balance > 0 ? "text-amber-600" : balance < 0 ? "text-emerald-600" : "text-muted-foreground")}>
                        {balance > 0 ? `${formatBDT(balance)} বাকি` : balance < 0 ? `${formatBDT(balance)} অগ্রিম` : "পরিষ্কার"}
                      </p>
                      <p className="text-xs text-muted-foreground">{party.lastTransactionDate || "—"}</p>
                    </div>
                  </Link>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`"${party.nameBn || party.name}" মুছে ফেলবেন?`))
                        deleteParty.mutate({ id: party.id });
                    }}
                    className="opacity-0 group-hover:opacity-100 absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all text-xs">
                    ✕
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Aging Tab */}
      {activeTab === "aging" && (
        <div className="space-y-3">
          {!aging.filter(a => Math.abs(a.balance) > 0).length ? (
            <div className="bg-card rounded-xl border border-card-border p-8 text-center text-muted-foreground text-sm">
              কোনো বকেয়া নেই
            </div>
          ) : (
            aging.filter(a => Math.abs(a.balance) > 0).map((entry) => {
              const info = BUCKET_LABELS[entry.bucket];
              return (
                <Link key={entry.partyId} href={`/parties/${entry.partyId}`}
                  className="flex items-center justify-between bg-card border border-card-border rounded-xl px-4 py-4 shadow-sm hover:shadow-md transition-shadow">
                  <div>
                    <p className="text-sm font-medium text-foreground">{entry.partyName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {entry.daysSinceLastPayment != null ? `${entry.daysSinceLastPayment} দিন আগে পেমেন্ট` : "পেমেন্ট হয়নি"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-foreground">{formatBDT(entry.balance)}</p>
                    {info && (
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", info.color)}>{info.label}</span>
                    )}
                  </div>
                </Link>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
