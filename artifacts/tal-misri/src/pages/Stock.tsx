import { useState } from "react";
import { useGetStock, useListStockTransactions, useCreateStockTransaction, getGetStockQueryKey, getListStockTransactionsQueryKey } from "@workspace/api-client-react";
import type { CreateStockTransactionBodyItemType, StockSummary } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import DateRangePicker, { firstOfMonth, todayStr } from "@/components/DateRangePicker";

const ITEM_LABELS: Record<string, { label: string; unit: string; color: string }> = {
  sugar: { label: "চিনি", unit: "কেজি", color: "bg-amber-100 border-amber-300 text-amber-800" },
  grade1: { label: "বড় দানা (গ্রেড ১)", unit: "কেজি", color: "bg-yellow-100 border-yellow-300 text-yellow-800" },
  grade2: { label: "ছোট দানা (গ্রেড ২)", unit: "কেজি", color: "bg-orange-100 border-orange-300 text-orange-800" },
  byproduct: { label: "নিচু / উপজাত", unit: "কেজি", color: "bg-stone-100 border-stone-300 text-stone-700" },
  sala: { label: "সালা (সুতা)", unit: "কেজি", color: "bg-sky-100 border-sky-300 text-sky-800" },
  gas: { label: "গ্যাস / জ্বালানি", unit: "কেজি", color: "bg-indigo-100 border-indigo-300 text-indigo-800" },
};

export default function Stock() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filterItem, setFilterItem] = useState<string>("all");
  const [fromDate, setFromDate] = useState(firstOfMonth());
  const [toDate, setToDate] = useState(todayStr());
  const [form, setForm] = useState({ itemType: "sugar" as keyof typeof ITEM_LABELS, txType: "in" as "in" | "out", quantityKg: "", date: new Date().toISOString().split("T")[0], note: "" });
  const [submitting, setSubmitting] = useState(false);

  const { data: stock, isLoading: stockLoading } = useGetStock({ query: { queryKey: getGetStockQueryKey() } });
  const { data: transactions = [], isLoading: txLoading } = useListStockTransactions(
    filterItem !== "all" ? { itemType: filterItem } : undefined,
    { query: { queryKey: getListStockTransactionsQueryKey(filterItem !== "all" ? { itemType: filterItem } : undefined) } }
  );

  const createTx = useCreateStockTransaction({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetStockQueryKey() });
        qc.invalidateQueries({ queryKey: getListStockTransactionsQueryKey() });
        setShowForm(false);
        setForm({ itemType: "sugar", txType: "in", quantityKg: "", date: new Date().toISOString().split("T")[0], note: "" });
      },
    },
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.quantityKg) return;
    setSubmitting(true);
    try {
      await createTx.mutateAsync({
        data: {
          itemType: form.itemType as CreateStockTransactionBodyItemType,
          txType: form.txType,
          quantityKg: parseFloat(form.quantityKg),
          date: form.date,
          note: form.note || undefined,
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
          <h1 className="text-2xl font-bold text-foreground">মজুদ ব্যবস্থাপনা</h1>
          <p className="text-muted-foreground text-sm mt-1">কাঁচামাল ও তৈরি পণ্যের হিসাব</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="bg-primary text-primary-foreground px-4 py-3 rounded-lg text-sm font-medium min-h-[48px] hover:opacity-90">
          + মজুদ যোগ/কমান
        </button>
      </div>

      {/* Stock Summary Cards */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">বর্তমান মজুদ</h2>
        {stockLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(ITEM_LABELS).map(([key, info]) => {
              const qty = stock ? stock[key as keyof StockSummary] ?? 0 : 0;
              const isLow = qty < 10;
              return (
                <div key={key} className={cn("rounded-xl border p-4 shadow-sm", info.color, isLow && qty <= 0 ? "ring-2 ring-red-300" : "")}>
                  <p className="text-xs font-medium mb-1 opacity-80">{info.label}</p>
                  <p className="text-2xl font-bold">{Number(qty).toFixed(1)}</p>
                  <p className="text-xs opacity-70">{info.unit}</p>
                  {isLow && qty > 0 && <p className="text-[10px] text-red-700 mt-1 font-medium">কম মজুদ</p>}
                  {qty <= 0 && <p className="text-[10px] text-red-700 mt-1 font-medium">মজুদ শেষ</p>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Add Transaction Form */}
      {showForm && (
        <div className="bg-card border border-card-border rounded-xl p-5 mb-6 shadow-sm">
          <h3 className="text-base font-semibold mb-4">মজুদ পরিবর্তন</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">পণ্যের ধরন</label>
                <select value={form.itemType} onChange={(e) => setForm({ ...form, itemType: e.target.value as keyof typeof ITEM_LABELS })}
                  className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring">
                  {Object.entries(ITEM_LABELS).map(([key, info]) => (
                    <option key={key} value={key}>{info.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">ধরন</label>
                <div className="flex gap-2 h-[42px]">
                  <button type="button" onClick={() => setForm({ ...form, txType: "in" })}
                    className={cn("flex-1 rounded-lg text-sm font-medium border min-h-[42px]", form.txType === "in" ? "bg-emerald-500 text-white border-emerald-500" : "bg-card border-input")}>
                    ঢোকা
                  </button>
                  <button type="button" onClick={() => setForm({ ...form, txType: "out" })}
                    className={cn("flex-1 rounded-lg text-sm font-medium border min-h-[42px]", form.txType === "out" ? "bg-red-500 text-white border-red-500" : "bg-card border-input")}>
                    বের হওয়া
                  </button>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">পরিমাণ (কেজি)</label>
                <input type="number" step="0.1" placeholder="0" value={form.quantityKg} onChange={(e) => setForm({ ...form, quantityKg: e.target.value })}
                  className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">তারিখ</label>
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">নোট</label>
              <input type="text" placeholder="নোট লিখুন..." value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
                className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={submitting || !form.quantityKg}
                className="flex-1 bg-primary text-primary-foreground py-3 rounded-lg text-sm font-medium min-h-[48px] disabled:opacity-50">
                {submitting ? "সংরক্ষণ হচ্ছে..." : "সংরক্ষণ করুন"}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-6 py-3 rounded-lg text-sm font-medium border border-input min-h-[48px]">বাতিল</button>
            </div>
          </form>
        </div>
      )}

      {/* Transactions List */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">লেনদেনের ইতিহাস</h2>
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker from={fromDate} to={toDate} onFromChange={setFromDate} onToChange={setToDate} />
            <select value={filterItem} onChange={(e) => setFilterItem(e.target.value)}
              className="border border-input rounded-lg px-2 py-2 text-xs bg-card focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="all">সব পণ্য</option>
              {Object.entries(ITEM_LABELS).map(([key, info]) => (
                <option key={key} value={key}>{info.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="bg-card rounded-xl border border-card-border shadow-sm overflow-hidden">
          {txLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-4 border-b border-border last:border-0 animate-pulse">
                <div className="space-y-1.5"><div className="h-3 bg-muted rounded w-28" /><div className="h-2.5 bg-muted rounded w-20" /></div>
                <div className="h-4 bg-muted rounded w-20" />
              </div>
            ))
          ) : !transactions.length ? (
            <div className="px-4 py-12 text-center text-muted-foreground text-sm">কোনো লেনদেন নেই</div>
          ) : (
            transactions.filter(tx => tx.date >= fromDate && tx.date <= toDate).map((tx) => {
              const item = ITEM_LABELS[tx.itemType];
              return (
                <div key={tx.id} className="flex items-center justify-between px-4 py-4 border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={cn("inline-block w-2 h-2 rounded-full flex-shrink-0", tx.txType === "in" ? "bg-emerald-500" : "bg-red-400")} />
                      <p className="text-sm font-medium text-foreground">{item?.label || tx.itemType}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 pl-4">{tx.date}{tx.note ? ` · ${tx.note}` : ""}</p>
                  </div>
                  <span className={cn("text-sm font-semibold", tx.txType === "in" ? "text-emerald-600" : "text-red-500")}>
                    {tx.txType === "in" ? "+" : "-"}{Number(tx.quantityKg).toFixed(1)} {item?.unit}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
