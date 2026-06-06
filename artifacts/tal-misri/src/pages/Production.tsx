import { useState } from "react";
import { useListBatches, useCreateBatch, useUpdateBatch, useHarvestBatch, getListBatchesQueryKey, getGetStockQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import DateRangePicker, { firstOfMonth, todayStr } from "@/components/DateRangePicker";

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  boiling: { label: "জ্বাল দেওয়া", color: "text-orange-700", bg: "bg-orange-100 border-orange-200" },
  curing: { label: "জমা হচ্ছে", color: "text-blue-700", bg: "bg-blue-100 border-blue-200" },
  ready: { label: "প্রস্তুত", color: "text-green-700", bg: "bg-green-100 border-green-200" },
  harvested: { label: "সংগ্রহ হয়েছে", color: "text-muted-foreground", bg: "bg-muted border-border" },
};

export default function Production() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [harvestBatchId, setHarvestBatchId] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>("active");
  const [form, setForm] = useState({ startDate: new Date().toISOString().split("T")[0], sugarInputKg: "", traysCount: "", workerName: "", notes: "" });
  const [harvestForm, setHarvestForm] = useState({ grade1OutputKg: "", grade2OutputKg: "", byproductKg: "" });
  const [submitting, setSubmitting] = useState(false);

  const [fromDate, setFromDate] = useState(firstOfMonth());
  const [toDate, setToDate] = useState(todayStr());

  const statusParam = filter === "active" ? undefined : filter === "harvested" ? "harvested" : undefined;
  const { data: batches = [], isLoading } = useListBatches(statusParam ? { status: statusParam } : undefined, {
    query: { queryKey: getListBatchesQueryKey(statusParam ? { status: statusParam } : undefined) },
  });

  const filteredByStatus = filter === "active"
    ? batches.filter((b) => b.status !== "harvested")
    : filter === "harvested"
    ? batches.filter((b) => b.status === "harvested")
    : batches;

  const displayBatches = filteredByStatus.filter(
    (b) => b.startDate >= fromDate && b.startDate <= toDate
  );

  const createBatch = useCreateBatch({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListBatchesQueryKey() });
        qc.invalidateQueries({ queryKey: getGetStockQueryKey() });
        setShowForm(false);
        setForm({ startDate: new Date().toISOString().split("T")[0], sugarInputKg: "", traysCount: "", workerName: "", notes: "" });
      },
    },
  });

  const updateBatch = useUpdateBatch({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListBatchesQueryKey() }) },
  });

  const harvestBatch = useHarvestBatch({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListBatchesQueryKey() });
        qc.invalidateQueries({ queryKey: getGetStockQueryKey() });
        setHarvestBatchId(null);
        setHarvestForm({ grade1OutputKg: "", grade2OutputKg: "", byproductKg: "" });
      },
    },
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.sugarInputKg || !form.traysCount) return;
    setSubmitting(true);
    try {
      await createBatch.mutateAsync({
        data: {
          startDate: form.startDate,
          sugarInputKg: parseFloat(form.sugarInputKg),
          traysCount: parseInt(form.traysCount),
          workerName: form.workerName || undefined,
          notes: form.notes || undefined,
        },
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleHarvest(e: React.FormEvent) {
    e.preventDefault();
    if (!harvestBatchId) return;
    setSubmitting(true);
    try {
      await harvestBatch.mutateAsync({
        id: harvestBatchId,
        data: {
          grade1OutputKg: parseFloat(harvestForm.grade1OutputKg) || 0,
          grade2OutputKg: parseFloat(harvestForm.grade2OutputKg) || 0,
          byproductKg: parseFloat(harvestForm.byproductKg) || 0,
        },
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-4 md:px-8 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">উৎপাদন ব্যাচ</h1>
          <p className="text-muted-foreground text-sm mt-1">তাল মিসরি তৈরির হিসাব</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="bg-primary text-primary-foreground px-4 py-3 rounded-lg text-sm font-medium min-h-[48px] hover:opacity-90">
          + নতুন ব্যাচ
        </button>
      </div>

      {/* Date Range */}
      <div className="mb-4">
        <DateRangePicker from={fromDate} to={toDate} onFromChange={setFromDate} onToChange={setToDate} />
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg mb-5 w-fit">
        {[{ key: "active", label: "চলমান" }, { key: "all", label: "সব" }, { key: "harvested", label: "সম্পন্ন" }].map((tab) => (
          <button key={tab.key} onClick={() => setFilter(tab.key)}
            className={cn("px-4 py-2 rounded-md text-sm font-medium transition-colors min-h-[40px]",
              filter === tab.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* New Batch Form */}
      {showForm && (
        <div className="bg-card border border-card-border rounded-xl p-5 mb-6 shadow-sm">
          <h3 className="text-base font-semibold mb-4">নতুন উৎপাদন ব্যাচ</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">শুরুর তারিখ</label>
                <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">চিনি (কেজি)</label>
                <input type="number" step="0.1" placeholder="0" value={form.sugarInputKg} onChange={(e) => setForm({ ...form, sugarInputKg: e.target.value })}
                  className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">ট্রের সংখ্যা</label>
                <input type="number" placeholder="0" value={form.traysCount} onChange={(e) => setForm({ ...form, traysCount: e.target.value })}
                  className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">শ্রমিকের নাম</label>
                <input type="text" placeholder="নাম লিখুন" value={form.workerName} onChange={(e) => setForm({ ...form, workerName: e.target.value })}
                  className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">নোট</label>
              <input type="text" placeholder="নোট লিখুন" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <p className="text-xs text-muted-foreground">ব্যাচ শুরু হলে স্বয়ংক্রিয়ভাবে ৭ দিন পর সংগ্রহের তারিখ নির্ধারিত হবে</p>
            <div className="flex gap-3">
              <button type="submit" disabled={submitting || !form.sugarInputKg || !form.traysCount}
                className="flex-1 bg-primary text-primary-foreground py-3 rounded-lg text-sm font-medium min-h-[48px] disabled:opacity-50">
                {submitting ? "সংরক্ষণ হচ্ছে..." : "ব্যাচ শুরু করুন"}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-6 py-3 rounded-lg text-sm font-medium border border-input min-h-[48px]">বাতিল</button>
            </div>
          </form>
        </div>
      )}

      {/* Harvest Form Modal */}
      {harvestBatchId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
          <div className="bg-card rounded-xl border border-card-border p-5 w-full max-w-md shadow-xl">
            <h3 className="text-base font-semibold mb-4">ফসল সংগ্রহ</h3>
            <form onSubmit={handleHarvest} className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">বড় দানা - গ্রেড ১ (কেজি)</label>
                <input type="number" step="0.1" placeholder="0" value={harvestForm.grade1OutputKg} onChange={(e) => setHarvestForm({ ...harvestForm, grade1OutputKg: e.target.value })}
                  className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">ছোট দানা - গ্রেড ২ (কেজি)</label>
                <input type="number" step="0.1" placeholder="0" value={harvestForm.grade2OutputKg} onChange={(e) => setHarvestForm({ ...harvestForm, grade2OutputKg: e.target.value })}
                  className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">নিচু / উপজাত (কেজি)</label>
                <input type="number" step="0.1" placeholder="0" value={harvestForm.byproductKg} onChange={(e) => setHarvestForm({ ...harvestForm, byproductKg: e.target.value })}
                  className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="flex gap-3">
                <button type="submit" disabled={submitting}
                  className="flex-1 bg-primary text-primary-foreground py-3 rounded-lg text-sm font-medium min-h-[48px] disabled:opacity-50">
                  {submitting ? "সংরক্ষণ হচ্ছে..." : "সংগ্রহ রেকর্ড করুন"}
                </button>
                <button type="button" onClick={() => setHarvestBatchId(null)}
                  className="px-6 py-3 rounded-lg text-sm font-medium border border-input min-h-[48px]">বাতিল</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batches List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-card-border p-4 animate-pulse">
              <div className="h-4 bg-muted rounded w-32 mb-2" />
              <div className="h-3 bg-muted rounded w-48" />
            </div>
          ))}
        </div>
      ) : !displayBatches.length ? (
        <div className="bg-card rounded-xl border border-card-border p-8 text-center text-muted-foreground text-sm">
          <p className="text-2xl mb-2">🏭</p>
          <p>কোনো ব্যাচ নেই</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayBatches.map((batch) => {
            const status = STATUS_LABELS[batch.status] || STATUS_LABELS.boiling;
            const daysLeft = batch.daysRemaining;
            const isReady = batch.status === "ready";
            return (
              <div key={batch.id} className={cn("bg-card rounded-xl border p-4 shadow-sm", isReady ? "border-green-300 bg-green-50/50" : "border-card-border")}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm text-foreground">{batch.batchCode}</span>
                      <span className={cn("text-[11px] px-2 py-0.5 rounded-full border font-medium", status.bg, status.color)}>
                        {status.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">শুরু: {batch.startDate} · শেষ: {batch.expectedEndDate}</p>
                  </div>
                  {batch.status !== "harvested" && (
                    <div className="text-right">
                      {daysLeft !== null && daysLeft !== undefined && (
                        <div className={cn("text-sm font-bold", daysLeft <= 0 ? "text-green-600" : daysLeft <= 2 ? "text-orange-600" : "text-blue-600")}>
                          {daysLeft <= 0 ? "প্রস্তুত!" : `${daysLeft} দিন বাকি`}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3 mb-3 text-center">
                  <div className="bg-background rounded-lg p-2 border border-border">
                    <p className="text-xs text-muted-foreground">চিনি</p>
                    <p className="text-sm font-semibold">{batch.sugarInputKg} কেজি</p>
                  </div>
                  <div className="bg-background rounded-lg p-2 border border-border">
                    <p className="text-xs text-muted-foreground">ট্রে</p>
                    <p className="text-sm font-semibold">{batch.traysCount} টি</p>
                  </div>
                  <div className="bg-background rounded-lg p-2 border border-border">
                    <p className="text-xs text-muted-foreground">শ্রমিক</p>
                    <p className="text-sm font-semibold truncate">{batch.workerName || "—"}</p>
                  </div>
                </div>

                {batch.status === "harvested" && (
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="text-center bg-amber-50 border border-amber-200 rounded-lg p-2">
                      <p className="text-[10px] text-amber-600">বড় দানা</p>
                      <p className="text-sm font-bold text-amber-700">{batch.grade1OutputKg} কেজি</p>
                    </div>
                    <div className="text-center bg-amber-50 border border-amber-200 rounded-lg p-2">
                      <p className="text-[10px] text-amber-600">ছোট দানা</p>
                      <p className="text-sm font-bold text-amber-700">{batch.grade2OutputKg} কেজি</p>
                    </div>
                    <div className="text-center bg-muted border border-border rounded-lg p-2">
                      <p className="text-[10px] text-muted-foreground">ফলন %</p>
                      <p className="text-sm font-bold">{batch.yieldPercent ? `${Number(batch.yieldPercent).toFixed(1)}%` : "—"}</p>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                {batch.status !== "harvested" && (
                  <div className="flex gap-2">
                    {batch.status === "boiling" && (
                      <button onClick={() => updateBatch.mutate({ id: batch.id, data: { status: "curing" } })}
                        className="flex-1 bg-blue-500 text-white py-2.5 rounded-lg text-sm font-medium min-h-[44px] hover:bg-blue-600 transition-colors">
                        কিউরিং শুরু
                      </button>
                    )}
                    {batch.status === "curing" && (
                      <button onClick={() => updateBatch.mutate({ id: batch.id, data: { status: "ready" } })}
                        className="flex-1 bg-green-500 text-white py-2.5 rounded-lg text-sm font-medium min-h-[44px] hover:bg-green-600 transition-colors">
                        প্রস্তুত চিহ্নিত করুন
                      </button>
                    )}
                    {(batch.status === "ready" || batch.status === "curing") && (
                      <button onClick={() => setHarvestBatchId(batch.id)}
                        className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-lg text-sm font-medium min-h-[44px] hover:opacity-90 transition-opacity">
                        ফসল সংগ্রহ
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
