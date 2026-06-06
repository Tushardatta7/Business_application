import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { buildMeta, exportPDF, exportExcel, type ExportSection } from "@/lib/exportUtils";
import DateRangePicker, { firstOfMonth, todayStr } from "@/components/DateRangePicker";

function formatBDT(n: number) {
  return `৳${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

interface PnLBreakdown { category: string; amount: number }
interface PnLResponse {
  fromDate: string;
  toDate: string;
  revenue: { items: { name: string; amount: number }[]; total: number };
  cogs: { amount: number; breakdown: PnLBreakdown[] };
  grossProfit: number;
  operatingExpenses: {
    salary: { amount: number; breakdown: PnLBreakdown[] };
    utility: { amount: number; breakdown: PnLBreakdown[] };
    transport: { amount: number; breakdown: PnLBreakdown[] };
    other: { amount: number; breakdown: PnLBreakdown[] };
    total: number;
  };
  totalExpenses: number;
  netProfit: number;
}

function StatRow({
  label, amount, indent, bold, subtotal, isProfit,
}: {
  label: string; amount: number; indent?: boolean; bold?: boolean; subtotal?: boolean; isProfit?: boolean;
}) {
  const isNeg = amount < 0;
  return (
    <div className={cn(
      "flex items-center justify-between py-2.5 px-4 border-b border-border/30 last:border-0",
      indent && "pl-10",
      subtotal && "bg-muted/20 font-semibold",
      bold && "font-bold",
    )}>
      <span className={cn("text-sm", bold || subtotal ? "text-foreground" : "text-muted-foreground")}>{label}</span>
      <span className={cn(
        "text-sm tabular-nums font-mono",
        isProfit && amount > 0 && "text-emerald-600 font-bold",
        isProfit && isNeg && "text-red-600 font-bold",
        !isProfit && (bold || subtotal) && "text-foreground font-semibold",
      )}>
        {isNeg ? `(${formatBDT(amount)})` : formatBDT(amount)}
      </span>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="bg-muted/50 px-4 py-2">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
    </div>
  );
}

function BreakdownRows({ items }: { items: PnLBreakdown[] }) {
  if (!items.length) return null;
  return (
    <>
      {items.map(item => (
        <StatRow key={item.category} label={item.category} amount={item.amount} indent />
      ))}
    </>
  );
}

function buildExportSections(data: PnLResponse): ExportSection[] {
  const fmt = (n: number) =>
    `৳${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 0 })}${n < 0 ? " (ক্ষতি)" : ""}`;

  return [
    {
      title: "রাজস্ব (Revenue)",
      rows: [
        ...data.revenue.items.map(i => ({ label: i.name, value: fmt(i.amount), indent: true })),
        { label: "মোট রাজস্ব", value: fmt(data.revenue.total), bold: true },
      ],
    },
    {
      title: "বিক্রিত পণ্যের খরচ (COGS)",
      rows: [
        ...data.cogs.breakdown.map(b => ({ label: b.category, value: fmt(b.amount), indent: true })),
        { label: "মোট COGS", value: fmt(data.cogs.amount), bold: true },
        { label: "স্থূল মুনাফা (Gross Profit)", value: fmt(data.grossProfit), bold: true },
      ],
    },
    {
      title: "পরিচালন ব্যয় (Operating Expenses)",
      rows: [
        { label: "বেতন / মজুরি", value: fmt(data.operatingExpenses.salary.amount) },
        ...data.operatingExpenses.salary.breakdown.map(b => ({ label: b.category, value: fmt(b.amount), indent: true })),
        { label: "ইউটিলিটি", value: fmt(data.operatingExpenses.utility.amount) },
        ...data.operatingExpenses.utility.breakdown.map(b => ({ label: b.category, value: fmt(b.amount), indent: true })),
        { label: "পরিবহন", value: fmt(data.operatingExpenses.transport.amount) },
        { label: "অন্যান্য", value: fmt(data.operatingExpenses.other.amount) },
        ...data.operatingExpenses.other.breakdown.map(b => ({ label: b.category, value: fmt(b.amount), indent: true })),
        { label: "মোট পরিচালন ব্যয়", value: fmt(data.operatingExpenses.total), bold: true },
      ],
    },
    {
      title: "ফলাফল",
      rows: [
        { label: "মোট ব্যয়", value: fmt(data.totalExpenses), bold: true },
        {
          label: data.netProfit >= 0 ? "নিট মুনাফা (Net Profit)" : "নিট ক্ষতি (Net Loss)",
          value: data.netProfit >= 0 ? fmt(data.netProfit) : `(${fmt(data.netProfit)})`,
          bold: true,
        },
      ],
    },
  ];
}

export default function PnL() {
  const [fromDate, setFromDate] = useState(firstOfMonth());
  const [toDate, setToDate] = useState(todayStr());
  const [applied, setApplied] = useState({ from: firstOfMonth(), to: todayStr() });

  const { data, isLoading, isError } = useQuery<PnLResponse>({
    queryKey: ["pnl", applied.from, applied.to],
    queryFn: async () => {
      const res = await fetch(`/api/pnl?fromDate=${applied.from}&toDate=${applied.to}`);
      if (!res.ok) throw new Error("API error");
      return res.json() as Promise<PnLResponse>;
    },
  });

  function handleExport(format: "pdf" | "xlsx") {
    if (!data) return;
    const meta = buildMeta("লাভ-ক্ষতি হিসাব (P&L)", undefined, applied.from, applied.to);
    const sections = buildExportSections(data);
    const filename = `pnl_${applied.from}_to_${applied.to}.${format}`;
    if (format === "pdf") exportPDF(meta, sections, filename);
    else exportExcel(meta, sections, filename);
  }

  const isEmpty = data && data.revenue.total === 0 && data.totalExpenses === 0;

  return (
    <div className="px-4 md:px-8 py-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">লাভ-ক্ষতি হিসাব</h1>
          <p className="text-muted-foreground text-sm mt-1">Profit &amp; Loss Statement</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <DateRangePicker
          from={fromDate}
          to={toDate}
          onFromChange={setFromDate}
          onToChange={setToDate}
          onExportPDF={data ? () => handleExport("pdf") : undefined}
          onExportExcel={data ? () => handleExport("xlsx") : undefined}
          exportDisabled={!data || isEmpty}
        />
        <button
          onClick={() => setApplied({ from: fromDate, to: toDate })}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium min-h-[40px] hover:opacity-90 transition-opacity"
        >
          প্রয়োগ করুন
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-4 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border border-border overflow-hidden">
              <div className="h-9 bg-muted" />
              {[...Array(3)].map((_, j) => <div key={j} className="h-10 border-b border-border bg-card" />)}
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="text-center py-16 text-red-500">ডেটা লোড করতে সমস্যা হয়েছে</div>
      ) : isEmpty ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-3xl mb-3">📊</p>
          <p>নির্বাচিত সময়কালে কোনো লেনদেন নেই</p>
        </div>
      ) : data ? (
        <div className="space-y-4">

          {/* Revenue */}
          <div className="rounded-xl border border-border overflow-hidden shadow-sm">
            <SectionHeader title="রাজস্ব (Revenue)" />
            {data.revenue.items.map(item => (
              <StatRow key={item.name} label={item.name} amount={item.amount} indent />
            ))}
            <StatRow label="মোট রাজস্ব" amount={data.revenue.total} bold subtotal />
          </div>

          {/* COGS → Gross Profit */}
          <div className="rounded-xl border border-border overflow-hidden shadow-sm">
            <SectionHeader title="বিক্রিত পণ্যের খরচ (COGS)" />
            <BreakdownRows items={data.cogs.breakdown} />
            <StatRow label="মোট COGS" amount={data.cogs.amount} bold subtotal />
            <div className={cn(
              "flex items-center justify-between px-4 py-3 border-t-2",
              data.grossProfit >= 0 ? "bg-emerald-50 border-emerald-300 dark:bg-emerald-950" : "bg-red-50 border-red-300 dark:bg-red-950",
            )}>
              <span className="text-sm font-bold text-foreground">স্থূল মুনাফা (Gross Profit)</span>
              <span className={cn("text-base font-bold tabular-nums font-mono", data.grossProfit >= 0 ? "text-emerald-700" : "text-red-700")}>
                {data.grossProfit < 0 ? `(${formatBDT(data.grossProfit)})` : formatBDT(data.grossProfit)}
              </span>
            </div>
          </div>

          {/* Operating Expenses */}
          <div className="rounded-xl border border-border overflow-hidden shadow-sm">
            <SectionHeader title="পরিচালন ব্যয় (Operating Expenses)" />
            {data.operatingExpenses.salary.amount > 0 && (
              <>
                <StatRow label="বেতন / মজুরি" amount={data.operatingExpenses.salary.amount} bold />
                <BreakdownRows items={data.operatingExpenses.salary.breakdown} />
              </>
            )}
            {data.operatingExpenses.utility.amount > 0 && (
              <>
                <StatRow label="ইউটিলিটি" amount={data.operatingExpenses.utility.amount} bold />
                <BreakdownRows items={data.operatingExpenses.utility.breakdown} />
              </>
            )}
            {data.operatingExpenses.transport.amount > 0 && (
              <StatRow label="পরিবহন" amount={data.operatingExpenses.transport.amount} bold />
            )}
            {data.operatingExpenses.other.amount > 0 && (
              <>
                <StatRow label="অন্যান্য ব্যয়" amount={data.operatingExpenses.other.amount} bold />
                <BreakdownRows items={data.operatingExpenses.other.breakdown} />
              </>
            )}
            <StatRow label="মোট পরিচালন ব্যয়" amount={data.operatingExpenses.total} bold subtotal />
          </div>

          {/* Net Profit */}
          <div className={cn(
            "rounded-xl border-2 overflow-hidden shadow-sm",
            data.netProfit >= 0 ? "border-emerald-400" : "border-red-400",
          )}>
            <StatRow label="মোট ব্যয়" amount={data.totalExpenses} bold />
            <div className={cn(
              "flex items-center justify-between px-4 py-4",
              data.netProfit >= 0 ? "bg-emerald-50 dark:bg-emerald-950" : "bg-red-50 dark:bg-red-950",
            )}>
              <span className="text-base font-bold text-foreground">
                {data.netProfit >= 0 ? "নিট মুনাফা (Net Profit)" : "নিট ক্ষতি (Net Loss)"}
              </span>
              <span className={cn("text-xl font-bold tabular-nums font-mono", data.netProfit >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300")}>
                {data.netProfit < 0 ? `(${formatBDT(data.netProfit)})` : formatBDT(data.netProfit)}
              </span>
            </div>
          </div>

        </div>
      ) : null}
    </div>
  );
}