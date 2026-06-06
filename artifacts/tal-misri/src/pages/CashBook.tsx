import { useState } from "react";
import { Link } from "wouter";
import {
  useListCashEntries,
  useCreateCashEntry,
  useUpdateCashEntry,
  useDeleteCashEntry,
  useGetDailyCashSummary,
  getListCashEntriesQueryKey,
  getGetDailyCashSummaryQueryKey,
} from "@workspace/api-client-react";
import type { CashEntry } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { buildMeta, exportGLPDF, exportGLExcel, type GLRow } from "@/lib/exportUtils";
import DateRangePicker, { firstOfMonth, todayStr } from "@/components/DateRangePicker";

type SaleItem = { product: string; price: string; qty: string };

type FormState = {
  date: string;
  type: "income" | "expense";
  category: string;
  customCategory: string;
  buyerName: string;
  saleItems: SaleItem[];
  manualAmount: string;
  note: string;
};

const EXPENSE_CATEGORIES = [
  "তাল মিসরি বিক্রয়", "চিনি কেনা", "আখ কেনা", "শ্রমিক মজুরি", "জ্বালানি", "কাঠ কেনা",
  "পরিবহন", "বিদ্যুৎ", "প্যাকেজিং", "মেরামত", "মালিক উত্তোলন", "বিবিধ",
];
const INCOME_CATEGORIES = ["নগদ জমা", "অন্যান্য আয়"];

function today() {
  return new Date().toISOString().split("T")[0];
}

function formatBDT(amount: number) {
  return `৳${Number(amount).toLocaleString("en-IN")}`;
}

function emptyForm(): FormState {
  return {
    date: today(),
    type: "expense",
    category: "তাল মিসরি বিক্রয়",
    customCategory: "",
    buyerName: "",
    saleItems: [{ product: "", price: "", qty: "" }],
    manualAmount: "",
    note: "",
  };
}

function calcItemTotal(item: SaleItem) {
  const p = parseFloat(item.price) || 0;
  const q = parseFloat(item.qty) || 0;
  return p * q;
}

function calcSaleTotal(items: SaleItem[]) {
  return items.reduce((s, it) => s + calcItemTotal(it), 0);
}

function parseSaleItems(json: string | null | undefined): SaleItem[] {
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

function entryToForm(entry: CashEntry): FormState {
  const items = parseSaleItems(entry.saleItems);
  const cats = entry.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const isCustom = entry.category && !cats.includes(entry.category);
  return {
    date: entry.date,
    type: entry.type as "income" | "expense",
    category: isCustom ? "__custom__" : (entry.category || ""),
    customCategory: isCustom ? entry.category : "",
    buyerName: entry.buyerName ?? "",
    saleItems: items.length > 0 ? items : [{ product: "", price: "", qty: "" }],
    manualAmount: items.length > 0 ? "" : String(entry.amount),
    note: entry.note ?? "",
  };
}

export default function CashBook() {
  const qc = useQueryClient();
  const [fromDate, setFromDate] = useState(firstOfMonth());
  const [toDate, setToDate] = useState(todayStr());
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState<CashEntry | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [submitting, setSubmitting] = useState(false);

  const { data: entries = [], isLoading } = useListCashEntries({ startDate: fromDate, endDate: toDate });
  const { data: summary } = useGetDailyCashSummary({ date: toDate });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListCashEntriesQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDailyCashSummaryQueryKey() });
  };

  const createEntry = useCreateCashEntry({ mutation: { onSuccess: invalidate } });
  const updateEntry = useUpdateCashEntry({ mutation: { onSuccess: invalidate } });
  const deleteEntry = useDeleteCashEntry({ mutation: { onSuccess: invalidate } });

  function handleExport(format: "pdf" | "xlsx") {
    if (!Array.isArray(entries) || entries.length === 0) return;
    const meta = buildMeta("সাধারণ খতিয়ান (General Ledger)", undefined, fromDate, toDate);

    // Build running balance
    let running = 0;
    const glRows: GLRow[] = [...(entries as CashEntry[])].reverse().map((e, idx) => {
      const amt = Number(e.amount);
      const isIncome = e.type === "income";
      running = isIncome ? running + amt : running - amt;
      const narration = [e.buyerName, e.note].filter(Boolean).join(" — ");
      const voucherType = e.type === "income" ? "জমা" : (() => {
        if (e.category === "তাল মিসরি বিক্রয়") return "বিক্রয়";
        if (["চিনি কেনা", "আখ কেনা", "কাঠ কেনা"].includes(e.category)) return "ক্রয়";
        return "খরচ";
      })();
      return {
        date: e.date,
        voucherNo: `#${String(idx + 1).padStart(3, "0")}`,
        voucherType,
        account: e.category,
        narration: narration || "—",
        debit: isIncome ? 0 : amt,
        credit: isIncome ? amt : 0,
        runningBalance: running,
      };
    });

    const filename = `general_ledger_${fromDate}_to_${toDate}.${format}`;
    if (format === "pdf") exportGLPDF(meta, glRows, filename);
    else exportGLExcel(meta, glRows, filename);
  }

  const cats = form.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const resolvedCategory = form.category === "__custom__" ? form.customCategory : form.category;
  const isSaleEntry = form.type === "expense" && (form.category === "তাল মিসরি বিক্রয়" || resolvedCategory === "তাল মিসরি বিক্রয়");
  const saleTotal = calcSaleTotal(form.saleItems);
  const hasItems = isSaleEntry && form.saleItems.some(it => it.product || it.price || it.qty);
  const finalAmount = hasItems ? saleTotal : parseFloat(form.manualAmount) || 0;

  function openNew() {
    setEditEntry(null);
    setForm(emptyForm());
    setShowForm(true);
  }

  function openEdit(entry: CashEntry) {
    setEditEntry(entry);
    setForm(entryToForm(entry));
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditEntry(null);
  }

  function setItem(idx: number, field: keyof SaleItem, val: string) {
    setForm(f => ({
      ...f,
      saleItems: f.saleItems.map((it, i) => i === idx ? { ...it, [field]: val } : it),
    }));
  }

  function addItem() {
    setForm(f => ({ ...f, saleItems: [...f.saleItems, { product: "", price: "", qty: "" }] }));
  }

  function removeItem(idx: number) {
    setForm(f => ({ ...f, saleItems: f.saleItems.filter((_, i) => i !== idx) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!resolvedCategory || finalAmount <= 0) return;
    setSubmitting(true);

    const itemsToSave = isSaleEntry
      ? form.saleItems.filter(it => it.product && (parseFloat(it.price) > 0) && (parseFloat(it.qty) > 0))
      : [];

    const payload = {
      date: form.date,
      amount: finalAmount,
      type: form.type,
      category: resolvedCategory,
      buyerName: form.buyerName.trim() || null,
      saleItems: itemsToSave.length > 0 ? JSON.stringify(itemsToSave) : null,
      note: form.note.trim() || null,
    };

    try {
      if (editEntry) {
        await updateEntry.mutateAsync({ id: editEntry.id, data: payload });
      } else {
        await createEntry.mutateAsync({ data: payload });
      }
      closeForm();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="px-4 md:px-8 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">লেন-দেন খাতা</h1>
          <p className="text-muted-foreground text-sm mt-1">দৈনিক নগদ জমা-খরচ</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/image-upload"
            className="border border-border px-4 py-3 rounded-lg text-sm font-medium min-h-[48px] hover:bg-muted transition-colors flex items-center gap-1"
          >
            📷 ছবি আপলোড
          </Link>
          <button
            onClick={openNew}
            className="bg-primary text-primary-foreground px-4 py-3 rounded-lg text-sm font-medium min-h-[48px] hover:opacity-90 transition-opacity"
          >
            + নতুন এন্ট্রি
          </button>
        </div>
      </div>

      {/* Date Range + Export */}
      <div className="mb-5">
        <DateRangePicker
          from={fromDate}
          to={toDate}
          onFromChange={setFromDate}
          onToChange={setToDate}
          onExportPDF={() => handleExport("pdf")}
          onExportExcel={() => handleExport("xlsx")}
          exportDisabled={!Array.isArray(entries) || entries.length === 0}
        />
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-card rounded-xl border border-border p-3 shadow-sm">
            <p className="text-xs text-muted-foreground">উদ্বৃত্ত ব্যালেন্স</p>
            <p className="text-lg font-bold">{formatBDT(summary.openingBalance)}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-3 shadow-sm border-l-4 border-l-emerald-500">
            <p className="text-xs text-muted-foreground">মোট জমা</p>
            <p className="text-lg font-bold text-emerald-600">{formatBDT(summary.totalIncome)}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-3 shadow-sm border-l-4 border-l-red-400">
            <p className="text-xs text-muted-foreground">মোট খরচ</p>
            <p className="text-lg font-bold text-red-500">{formatBDT(summary.totalExpense)}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-3 shadow-sm border-l-4 border-l-primary">
            <p className="text-xs text-muted-foreground">সমাপনী ব্যালেন্স</p>
            <p className="text-lg font-bold text-primary">{formatBDT(summary.closingBalance)}</p>
          </div>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="bg-card border border-border rounded-xl p-5 mb-6 shadow-sm">
          <h3 className="text-base font-semibold mb-4">
            {editEntry ? "এন্ট্রি সম্পাদনা" : "নতুন লেন-দেন"}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Date */}
            <div>
              <label className="text-sm text-muted-foreground block mb-1">তারিখ</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Type */}
            <div>
              <label className="text-sm text-muted-foreground block mb-1">ধরন</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, type: "income", category: INCOME_CATEGORIES[0], saleItems: [{ product: "", price: "", qty: "" }] }))}
                  className={cn("flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors min-h-[44px]",
                    form.type === "income" ? "bg-emerald-500 text-white border-emerald-500" : "bg-card border-input text-foreground"
                  )}
                >
                  জমা
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, type: "expense", category: EXPENSE_CATEGORIES[0], saleItems: [{ product: "", price: "", qty: "" }] }))}
                  className={cn("flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors min-h-[44px]",
                    form.type === "expense" ? "bg-red-500 text-white border-red-500" : "bg-card border-input text-foreground"
                  )}
                >
                  খরচ
                </button>
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="text-sm text-muted-foreground block mb-1">বিভাগ</label>
              <select
                value={form.category}
                onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">বিভাগ বেছে নিন</option>
                {cats.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="__custom__">অন্যান্য (নিজে লিখুন)</option>
              </select>
              {form.category === "__custom__" && (
                <input
                  type="text"
                  placeholder="বিভাগের নাম লিখুন..."
                  value={form.customCategory}
                  onChange={(e) => setForm(f => ({ ...f, customCategory: e.target.value }))}
                  className="mt-2 w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              )}
            </div>

            {/* Party name — for জমা (who paid you) */}
            {form.type === "income" && (
              <div>
                <label className="text-sm text-muted-foreground block mb-1">পার্টির নাম (কে দিয়েছেন)</label>
                <input
                  type="text"
                  placeholder="যেমন: শ্রীমা ভান্ডার"
                  value={form.buyerName}
                  onChange={(e) => setForm(f => ({ ...f, buyerName: e.target.value }))}
                  className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}

            {/* Sale items — only for খরচ + তাল মিসরি বিক্রয় */}
            {isSaleEntry ? (
              <div>
                <label className="text-sm text-muted-foreground block mb-2">বিক্রয় বিবরণ</label>

                {/* Buyer name */}
                <input
                  type="text"
                  placeholder="ক্রেতার নাম (যেমন: শ্রীমা ভান্ডার)"
                  value={form.buyerName}
                  onChange={(e) => setForm(f => ({ ...f, buyerName: e.target.value }))}
                  className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring mb-3"
                />

                {/* Items table header */}
                <div className="grid grid-cols-[1fr_80px_80px_80px_32px] gap-2 mb-1 px-1">
                  <span className="text-xs text-muted-foreground">পণ্যের নাম</span>
                  <span className="text-xs text-muted-foreground text-center">দাম/কেজি</span>
                  <span className="text-xs text-muted-foreground text-center">পরিমাণ (কেজি)</span>
                  <span className="text-xs text-muted-foreground text-center">মোট</span>
                  <span />
                </div>

                {/* Item rows */}
                {form.saleItems.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_80px_80px_80px_32px] gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="পণ্য"
                      value={item.product}
                      onChange={(e) => setItem(idx, "product", e.target.value)}
                      className="border border-input rounded-lg px-2 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <input
                      type="number"
                      placeholder="০"
                      value={item.price}
                      onChange={(e) => setItem(idx, "price", e.target.value)}
                      className="border border-input rounded-lg px-2 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring text-center"
                    />
                    <input
                      type="number"
                      placeholder="০"
                      value={item.qty}
                      onChange={(e) => setItem(idx, "qty", e.target.value)}
                      className="border border-input rounded-lg px-2 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring text-center"
                    />
                    <div className="border border-border rounded-lg px-2 py-2 text-sm bg-muted/30 text-right font-medium">
                      {calcItemTotal(item) > 0 ? calcItemTotal(item).toLocaleString("en-IN") : "—"}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      disabled={form.saleItems.length === 1}
                      className="text-muted-foreground hover:text-destructive text-lg disabled:opacity-30"
                    >
                      ×
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addItem}
                  className="text-sm text-primary hover:underline mt-1"
                >
                  + পণ্য যোগ করুন
                </button>

                {/* Sale total */}
                {saleTotal > 0 && (
                  <div className="mt-3 flex justify-end">
                    <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2 text-sm font-semibold text-red-700 dark:text-red-300">
                      মোট: {formatBDT(saleTotal)}
                    </div>
                  </div>
                )}
              </div>
            ) : form.type === "expense" && (
              /* Party name for other খরচ entries */
              <div>
                <label className="text-sm text-muted-foreground block mb-1">পার্টির নাম (ঐচ্ছিক)</label>
                <input
                  type="text"
                  placeholder="যেমন: করিম ব্যাপারী"
                  value={form.buyerName}
                  onChange={(e) => setForm(f => ({ ...f, buyerName: e.target.value }))}
                  className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}

            {/* Manual amount — for non-sale entries or sale without items filled */}
            {!isSaleEntry && (
              <div>
                <label className="text-sm text-muted-foreground block mb-1">পরিমাণ (৳)</label>
                <input
                  type="number"
                  placeholder="০"
                  value={form.manualAmount}
                  onChange={(e) => setForm(f => ({ ...f, manualAmount: e.target.value }))}
                  className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}

            {/* Note */}
            <div>
              <label className="text-sm text-muted-foreground block mb-1">নোট (ঐচ্ছিক)</label>
              <input
                type="text"
                placeholder="বিবরণ লিখুন..."
                value={form.note}
                onChange={(e) => setForm(f => ({ ...f, note: e.target.value }))}
                className="w-full border border-input rounded-lg px-3 py-2.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={submitting || !resolvedCategory || finalAmount <= 0}
                className="flex-1 bg-primary text-primary-foreground py-3 rounded-lg text-sm font-medium min-h-[48px] disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {submitting ? "সংরক্ষণ হচ্ছে..." : editEntry ? "আপডেট করুন" : "সংরক্ষণ করুন"}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="px-6 py-3 rounded-lg text-sm font-medium border border-input bg-card min-h-[48px] hover:bg-muted transition-colors"
              >
                বাতিল
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Entries List */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <p className="text-sm font-medium text-muted-foreground">
            {Array.isArray(entries) ? entries.length : 0} টি এন্ট্রি
          </p>
        </div>

        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-4 border-b border-border last:border-0 animate-pulse">
              <div className="space-y-1.5 flex-1">
                <div className="h-3 bg-muted rounded w-32" />
                <div className="h-2.5 bg-muted rounded w-48" />
              </div>
              <div className="h-4 bg-muted rounded w-20 ml-4" />
            </div>
          ))
        ) : !Array.isArray(entries) || entries.length === 0 ? (
          <div className="px-4 py-12 text-center text-muted-foreground text-sm">
            <p className="text-2xl mb-2">📋</p>
            <p>এই তারিখে কোনো এন্ট্রি নেই</p>
            <button onClick={openNew} className="mt-3 text-primary text-sm underline">
              এন্ট্রি যোগ করুন
            </button>
          </div>
        ) : (
          entries.map((entry) => {
            const items = parseSaleItems(entry.saleItems);
            const displayName = entry.buyerName || entry.partyName;
            return (
              <div
                key={entry.id}
                className="px-4 py-4 border-b border-border last:border-0 hover:bg-muted/20 transition-colors group"
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Left side */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "inline-block w-2 h-2 rounded-full flex-shrink-0",
                        entry.type === "income" ? "bg-emerald-500" : "bg-red-400"
                      )} />
                      <p className="text-sm font-medium text-foreground truncate">{entry.category}</p>
                      {displayName && (
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full truncate">
                          {displayName}
                        </span>
                      )}
                    </div>

                    {/* Sale items summary */}
                    {items.length > 0 && (
                      <div className="mt-1.5 pl-4 space-y-0.5">
                        {items.map((it, i) => (
                          <p key={i} className="text-xs text-muted-foreground">
                            {it.product}
                            {it.price && it.qty && (
                              <span className="ml-1 text-foreground/60">
                                {parseFloat(it.price).toLocaleString("en-IN")} × {parseFloat(it.qty).toLocaleString("en-IN")}কেজি
                                = <span className="font-medium">৳{calcItemTotal(it).toLocaleString("en-IN")}</span>
                              </span>
                            )}
                          </p>
                        ))}
                      </div>
                    )}

                    {/* Date and note */}
                    <p className="text-xs text-muted-foreground mt-0.5 pl-4">
                      {entry.date}{entry.note ? ` · ${entry.note}` : ""}
                    </p>
                  </div>

                  {/* Right side: amount + actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={cn(
                      "text-sm font-semibold",
                      entry.type === "income" ? "text-emerald-600" : "text-red-500"
                    )}>
                      {entry.type === "income" ? "+" : "-"}{formatBDT(Number(entry.amount))}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(entry)}
                        className="text-muted-foreground hover:text-primary text-xs p-1.5 rounded hover:bg-muted transition-colors"
                        title="সম্পাদনা"
                      >
                        ✏
                      </button>
                      <button
                        onClick={() => { if (confirm("এই এন্ট্রি মুছে দেবেন?")) deleteEntry.mutate({ id: entry.id }); }}
                        className="text-muted-foreground hover:text-destructive text-xs p-1.5 rounded hover:bg-muted transition-colors"
                        title="মুছুন"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
