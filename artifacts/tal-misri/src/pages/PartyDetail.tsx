import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useGetParty, useCreateLedgerEntry, useDeleteLedgerEntry, getGetPartyQueryKey, getListPartiesQueryKey, getGetAgingReportQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import DateRangePicker, { firstOfMonth, todayStr } from "@/components/DateRangePicker";

function formatBDT(amount: number) {
  return `৳${Number(Math.abs(amount)).toLocaleString("en-IN")}`;
}

const ITEM_TYPES = [
  { value: "grade1", label: "বড় দানা (গ্রেড ১)" },
  { value: "grade2", label: "ছোট দানা (গ্রেড ২)" },
  { value: "byproduct", label: "নিচু" },
];

export default function PartyDetail() {
  const [, params] = useRoute("/parties/:id");
  const id = parseInt(params?.id || "0");
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    type: "debit" as "debit" | "credit",
    amount: "",
    description: "",
    itemType: "" as "" | "grade1" | "grade2" | "byproduct",
    itemQtyKg: "",
    pricePerKg: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [fromDate, setFromDate] = useState(firstOfMonth());
  const [toDate, setToDate] = useState(todayStr());

  const { data: party, isLoading } = useGetParty(id, { query: { queryKey: getGetPartyQueryKey(id) } });

  const createEntry = useCreateLedgerEntry({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetPartyQueryKey(id) });
        qc.invalidateQueries({ queryKey: getListPartiesQueryKey() });
        qc.invalidateQueries({ queryKey: getGetAgingReportQueryKey() });
        setShowForm(false);
        setForm({ date: new Date().toISOString().split("T")[0], type: "debit", amount: "", description: "", itemType: "", itemQtyKg: "", pricePerKg: "" });
      },
    },
  });

  const deleteEntry = useDeleteLedgerEntry({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetPartyQueryKey(id) });
        qc.invalidateQueries({ queryKey: getListPartiesQueryKey() });
      },
    },
  });

  function handleItemCalc(qty: string, price: string) {
    const q = parseFloat(qty);
    const p = parseFloat(price);
    if (!isNaN(q) && !isNaN(p)) {
      setForm((f) => ({ ...f, itemQtyKg: qty, pricePerKg: price, amount: String((q * p).toFixed(2)) }));
    } else {
      setForm((f) => ({ ...f, itemQtyKg: qty, pricePerKg: price }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.amount || !form.description) return;
    setSubmitting(true);
    try {
      await createEntry.mutateAsync({
        data: {
          partyId: id,
          date: form.date,
          type: form.type,
          amount: parseFloat(form.amount),
          description: form.description,
          itemType: (form.itemType || undefined) as "grade1" | "grade2" | "byproduct" | undefined,
          itemQtyKg: form.itemQtyKg ? parseFloat(form.itemQtyKg) : undefined,
          pricePerKg: form.pricePerKg ? parseFloat(form.pricePerKg) : undefined,
        },
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="px-4 md:px-8 py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-muted rounded w-40" />
          <div className="h-4 bg-muted rounded w-60" />
          <div className="h-32 bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  if (!party) return <div className="px-4 md:px-8 py-6 text-muted-foreground">পার্টি পাওয়া যায়নি</div>;

  const balance = Number(party.balance);

  return (
    <div className="px-4 md:px-8 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href="/parties" className="text-xs text-muted-foreground hover:text-primary mb-2 block">← পার্টি তালিকা</Link>
          <h1 className="text-2xl font-bold text-foreground">{party.nameBn || party.name}</h1>
          {party.phone && <p className="text-muted-foreground text-sm mt-1">{party.phone}</p>}
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="bg-primary text-primary-foreground px-4 py-3 rounded-lg text-sm font-medium min-h-[48px] hover:opacity-90">
          + এন্ট্রি
        </button>
      </div>

      {/* Balance Card */}
      <div className={cn("rounded-xl p-5 mb-6 text-center shadow-sm", balance > 0 ? "bg-amber-50 border border-amber-200" : balance < 0 ? "bg-emerald-50 border border-emerald-200" : "bg-card border border-card-border")}>
        <p className="text-sm text-muted-foreground mb-1">বর্তমান ব্যালেন্স</p>
        <p className={cn("text-3xl font-bold", balance > 0 ? "text-amber-700" : balance < 0 ? "text-emerald-700" : "text-foreground")}>
          {balance > 0 ? `${formatBDT(balance)} বাকি` : balance < 0 ? `${formatBDT(balance)} অগ্রিম` : "পরিষ্কার"}
        </p>
      </div>

      {/* New Entry Form */}
      {showForm && (
        <div className="bg-card border border-card-border rounded-xl p-5 mb-6 shadow-sm">
          <h3 className="text-base font-semibold mb-4">নতুন লেজার এন্ট্রি</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">তারিখ</label>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">ধরন</label>
                <div className="flex gap-2 h-[42px]">
                  <button type="button" onClick={() => setForm({ ...form, type: "debit" })}
                    className={cn("flex-1 rounded-lg text-sm font-medium border min-h-[42px]", form.type === "debit" ? "bg-amber-500 text-white border-amber-500" : "bg-card border-input")}>
                    দেওয়া (বাকি)
                  </button>
                  <button type="button" onClick={() => setForm({ ...form, type: "credit" })}
                    className={cn("flex-1 rounded-lg text-sm font-medium border min-h-[42px]", form.type === "credit" ? "bg-emerald-500 text-white border-emerald-500" : "bg-card border-input")}>
                    নেওয়া (পরিশোধ)
                  </button>
                </div>
              </div>
            </div>

            {form.type === "debit" && (
              <div>
                <label className="text-sm text-muted-foreground block mb-1">পণ্য (ঐচ্ছিক)</label>
                <select value={form.itemType} onChange={(e) => setForm({ ...form, itemType: e.target.value as "" | "grade1" | "grade2" | "byproduct" })}
                  className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">পণ্য নির্বাচন করুন</option>
                  {ITEM_TYPES.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
                </select>
              </div>
            )}

            {form.itemType && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground block mb-1">পরিমাণ (কেজি)</label>
                  <input type="number" step="0.1" placeholder="0" value={form.itemQtyKg}
                    onChange={(e) => handleItemCalc(e.target.value, form.pricePerKg)}
                    className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground block mb-1">দর (৳/কেজি)</label>
                  <input type="number" step="0.01" placeholder="0" value={form.pricePerKg}
                    onChange={(e) => handleItemCalc(form.itemQtyKg, e.target.value)}
                    className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </div>
            )}

            <div>
              <label className="text-sm text-muted-foreground block mb-1">মোট পরিমাণ (৳)</label>
              <input type="number" placeholder="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>

            <div>
              <label className="text-sm text-muted-foreground block mb-1">বিবরণ</label>
              <input type="text" placeholder="বিবরণ লিখুন..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>

            <div className="flex gap-3">
              <button type="submit" disabled={submitting || !form.amount || !form.description}
                className="flex-1 bg-primary text-primary-foreground py-3 rounded-lg text-sm font-medium min-h-[48px] disabled:opacity-50">
                {submitting ? "সংরক্ষণ হচ্ছে..." : "সংরক্ষণ করুন"}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-6 py-3 rounded-lg text-sm font-medium border border-input min-h-[48px]">বাতিল</button>
            </div>
          </form>
        </div>
      )}

      {/* Ledger Entries */}
      <div className="mb-3">
        <DateRangePicker from={fromDate} to={toDate} onFromChange={setFromDate} onToChange={setToDate} />
      </div>
      <div className="bg-card rounded-xl border border-card-border shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30 grid grid-cols-4 text-xs font-medium text-muted-foreground">
          <span>তারিখ</span>
          <span className="col-span-2">বিবরণ</span>
          <span className="text-right">ব্যালেন্স</span>
        </div>
        {!party.entries?.length ? (
          <div className="px-4 py-12 text-center text-muted-foreground text-sm">
            এখনো কোনো লেনদেন নেই
          </div>
        ) : (
          [...(party.entries || [])].reverse()
            .filter(e => e.date >= fromDate && e.date <= toDate)
            .map((entry) => (
            <div key={entry.id} className="grid grid-cols-4 items-start px-4 py-3 border-b border-border last:border-0 hover:bg-muted/20 transition-colors group text-sm">
              <span className="text-muted-foreground text-xs">{entry.date}</span>
              <div className="col-span-2">
                <p className="font-medium text-foreground">{entry.description}</p>
                <p className={cn("text-xs mt-0.5", entry.type === "debit" ? "text-amber-600" : "text-emerald-600")}>
                  {entry.type === "debit" ? `+${formatBDT(Number(entry.amount))} বাকি` : `-${formatBDT(Number(entry.amount))} পরিশোধ`}
                </p>
              </div>
              <div className="text-right">
                <p className={cn("font-semibold", Number(entry.runningBalance) > 0 ? "text-amber-600" : "text-emerald-600")}>
                  {formatBDT(Number(entry.runningBalance))}
                </p>
                <button onClick={() => deleteEntry.mutate({ id: entry.id })}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive text-xs mt-0.5 transition-all">
                  মুছুন
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
