import { useState } from "react";
import { useGetBalanceSheet } from "@workspace/api-client-react";
import type { BalanceSheet } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { buildMeta, exportPDF, exportExcel, type ExportSection } from "@/lib/exportUtils";
import DateRangePicker, { firstOfMonth, todayStr } from "@/components/DateRangePicker";

function formatBDT(n: number) {
  return `৳${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatAmt(n: number) {
  return Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const ITEM_LABELS: Record<string, string> = {
  sugar: "চিনি",
  grade1: "মিসরি ১ম গ্রেড",
  grade2: "মিসরি ২য় গ্রেড",
  byproduct: "উপজাত",
  sala: "সালা",
  gas: "গ্যাস",
};

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="bg-muted/50 px-4 py-2 rounded-t-lg">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
    </div>
  );
}

function LineRow({
  label, value, bold, indent, subtotal,
}: {
  label: string; value: number; bold?: boolean; indent?: boolean; subtotal?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-center justify-between px-4 py-2.5 border-b border-border/40 last:border-0",
      subtotal && "bg-muted/30 font-semibold border-t border-border",
      indent && "pl-8",
    )}>
      <span className={cn("text-sm", bold || subtotal ? "text-foreground font-semibold" : "text-muted-foreground")}>
        {label}
      </span>
      <span className={cn("text-sm tabular-nums font-mono", bold || subtotal ? "text-foreground font-semibold" : "")}>
        {formatBDT(value)}
      </span>
    </div>
  );
}

function TotalRow({ label, value, accent }: { label: string; value: number; accent?: "green" | "red" | "blue" }) {
  return (
    <div className={cn(
      "flex items-center justify-between px-4 py-3 rounded-b-lg border-t-2",
      accent === "green" && "bg-emerald-50 dark:bg-emerald-950 border-emerald-300",
      accent === "red" && "bg-red-50 dark:bg-red-950 border-red-300",
      accent === "blue" && "bg-blue-50 dark:bg-blue-950 border-blue-300",
      !accent && "bg-muted/40 border-border",
    )}>
      <span className="text-sm font-bold text-foreground">{label}</span>
      <span className="text-base font-bold tabular-nums font-mono">{formatBDT(value)}</span>
    </div>
  );
}

function buildExportSections(data: BalanceSheet): ExportSection[] {
  const inventoryRows = data.assets.inventory
    .filter(i => i.value > 0)
    .map(i => ({
      label: ITEM_LABELS[i.itemType] ?? i.itemType,
      value: `${i.quantityKg.toLocaleString("en-IN")} কেজি × ৳${i.ratePerKg} = ৳${formatAmt(i.value)}`,
      indent: true,
    }));

  return [
    {
      title: "সম্পদ (Assets)",
      rows: [
        { label: "নগদ ও ব্যাংক", value: `৳${formatAmt(data.assets.cashAndBank)}` },
        { label: "মজুদ পণ্য", value: `৳${formatAmt(data.assets.inventoryTotal)}` },
        ...inventoryRows,
        { label: "ক্রেতার কাছে বাকি", value: `৳${formatAmt(data.assets.receivables)}` },
        { label: "অগ্রিম পরিশোধ", value: `৳${formatAmt(data.assets.advancesPaid)}` },
        { label: "ঋণ প্রদান", value: `৳${formatAmt(data.assets.loanGiven)}` },
        { label: "অন্যান্য পাওনা", value: `৳${formatAmt(data.assets.receivablesOther)}` },
        { label: "মোট সম্পদ", value: `৳${formatAmt(data.assets.total)}`, bold: true },
      ],
    },
    {
      title: "দায় (Liabilities)",
      rows: [
        { label: "সরবরাহকারীকে বকেয়া", value: `৳${formatAmt(data.liabilities.payablesSupplier)}` },
        { label: "অন্যান্য দেনা", value: `৳${formatAmt(data.liabilities.payablesOther)}` },
        { label: "অগ্রিম প্রাপ্তি", value: `৳${formatAmt(data.liabilities.advancesReceived)}` },
        { label: "ঋণ গ্রহণ", value: `৳${formatAmt(data.liabilities.loanTaken)}` },
        { label: "মোট দায়", value: `৳${formatAmt(data.liabilities.total)}`, bold: true },
      ],
    },
    {
      title: "ইক্যুইটি (Equity)",
      rows: [
        { label: "মূলধন", value: `৳${formatAmt(data.equity.capital)}` },
        { label: "সঞ্চিত আয়", value: `৳${formatAmt(data.equity.retainedEarnings)}` },
        { label: "মোট ইক্যুইটি", value: `৳${formatAmt(data.equity.total)}`, bold: true },
      ],
    },
    {
      title: "যাচাই",
      rows: [
        { label: "মোট দায় + ইক্যুইটি", value: `৳${formatAmt(data.liabilities.total + data.equity.total)}`, bold: true },
        {
          label: data.imbalance === 0 ? "✓ ব্যালেন্স সঠিক" : `⚠ পার্থক্য: ৳${formatAmt(Math.abs(data.imbalance))}`,
          value: "",
        },
      ],
    },
  ];
}

export default function BalanceSheetPage() {
  const [fromDate, setFromDate] = useState(firstOfMonth());
  const [toDate, setToDate] = useState(todayStr());

  const { data, isLoading } = useGetBalanceSheet({ asOf: toDate });

  const isBalanced = data ? Math.abs(data.imbalance) < 0.01 : true;

  function handleExport(format: "pdf" | "xlsx") {
    if (!data) return;
    const meta = buildMeta("ব্যালেন্স শিট", toDate);
    const sections = buildExportSections(data);
    const filename = `balance_sheet_${toDate}.${format}`;
    if (format === "pdf") exportPDF(meta, sections, filename);
    else exportExcel(meta, sections, filename);
  }

  return (
    <div className="px-4 md:px-8 py-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ব্যালেন্স শিট</h1>
          <p className="text-muted-foreground text-sm mt-1">ব্যবসার আর্থিক অবস্থান</p>
        </div>

      </div>

      {/* Date range + export + balance badge */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <DateRangePicker
          from={fromDate}
          to={toDate}
          onFromChange={setFromDate}
          onToChange={setToDate}
          onExportPDF={() => handleExport("pdf")}
          onExportExcel={() => handleExport("xlsx")}
          exportDisabled={!data}
        />
        {data && (
          <span className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold",
            isBalanced
              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
              : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
          )}>
            {isBalanced ? "✓ ব্যালেন্স সঠিক" : `⚠ ব্যালেন্স মেলেনি: ${formatBDT(Math.abs(data.imbalance))}`}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border border-border overflow-hidden animate-pulse">
              <div className="h-9 bg-muted" />
              {[...Array(4)].map((_, j) => <div key={j} className="h-10 border-b border-border bg-card" />)}
            </div>
          ))}
        </div>
      ) : !data ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-3xl mb-3">📊</p>
          <p>{toDate} তারিখের কোনো তথ্য নেই</p>
        </div>
      ) : (
        <div className="space-y-5">

          {/* Assets */}
          <div className="rounded-xl border border-border overflow-hidden shadow-sm">
            <SectionHeader title="সম্পদ (Assets)" />
            <LineRow label="নগদ ও ব্যাংক" value={data.assets.cashAndBank} />
            <div>
              <LineRow label="মজুদ পণ্য" value={data.assets.inventoryTotal} />
              {data.assets.inventory.filter(i => i.value > 0).map(item => (
                <div key={item.itemType} className="flex items-center justify-between px-8 py-1.5 border-b border-border/30 last:border-0 bg-muted/10">
                  <span className="text-xs text-muted-foreground">
                    {ITEM_LABELS[item.itemType] ?? item.itemType}
                    <span className="ml-2 opacity-60">
                      {item.quantityKg.toLocaleString("en-IN")} কেজি × ৳{item.ratePerKg}
                    </span>
                  </span>
                  <span className="text-xs tabular-nums font-mono text-muted-foreground">
                    {formatBDT(item.value)}
                  </span>
                </div>
              ))}
            </div>
            <LineRow label="ক্রেতার কাছে বাকি" value={data.assets.receivables} />
            <LineRow label="অগ্রিম পরিশোধ" value={data.assets.advancesPaid} />
            <LineRow label="ঋণ প্রদান" value={data.assets.loanGiven} />
            <LineRow label="অন্যান্য পাওনা" value={data.assets.receivablesOther} />
            <TotalRow label="মোট সম্পদ" value={data.assets.total} accent="green" />
          </div>

          {/* Liabilities */}
          <div className="rounded-xl border border-border overflow-hidden shadow-sm">
            <SectionHeader title="দায় (Liabilities)" />
            <LineRow label="সরবরাহকারীকে বকেয়া" value={data.liabilities.payablesSupplier} />
            <LineRow label="অন্যান্য দেনা" value={data.liabilities.payablesOther} />
            <LineRow label="অগ্রিম প্রাপ্তি" value={data.liabilities.advancesReceived} />
            <LineRow label="ঋণ গ্রহণ" value={data.liabilities.loanTaken} />
            <TotalRow label="মোট দায়" value={data.liabilities.total} accent="red" />
          </div>

          {/* Equity */}
          <div className="rounded-xl border border-border overflow-hidden shadow-sm">
            <SectionHeader title="ইক্যুইটি (Equity)" />
            <LineRow label="মূলধন" value={data.equity.capital} />
            <LineRow label="সঞ্চিত আয়" value={data.equity.retainedEarnings} />
            <TotalRow label="মোট ইক্যুইটি" value={data.equity.total} accent="blue" />
          </div>

          {/* Grand total check */}
          <div className="rounded-xl border-2 border-border overflow-hidden shadow-sm">
            <SectionHeader title="যাচাই (Verification)" />
            <LineRow label="মোট সম্পদ" value={data.assets.total} bold />
            <LineRow label="মোট দায় + ইক্যুইটি" value={data.liabilities.total + data.equity.total} bold />
            <div className={cn(
              "px-4 py-3 flex items-center justify-between rounded-b-xl",
              isBalanced ? "bg-emerald-50 dark:bg-emerald-950" : "bg-red-50 dark:bg-red-950"
            )}>
              <span className={cn("text-sm font-bold", isBalanced ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300")}>
                {isBalanced ? "✓ হিসাব মিলে গেছে" : `⚠ পার্থক্য: ${formatBDT(Math.abs(data.imbalance))}`}
              </span>
              <span className={cn("text-sm font-bold tabular-nums font-mono",
                isBalanced ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"
              )}>
                {formatBDT(data.imbalance)}
              </span>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}