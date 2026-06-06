import { cn } from "@/lib/utils";

interface DateRangePickerProps {
  from: string;
  to: string;
  onFromChange: (date: string) => void;
  onToChange: (date: string) => void;
  onExportPDF?: () => void;
  onExportExcel?: () => void;
  exportDisabled?: boolean;
  className?: string;
}

export function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function todayStr() {
  return new Date().toISOString().split("T")[0];
}

const MONTHS = [
  "জানু", "ফেব্রু", "মার্চ", "এপ্রিল", "মে", "জুন",
  "জুলাই", "আগস্ট", "সেপ্টে", "অক্টো", "নভে", "ডিসে",
];

const SELECT_CLASS =
  "border border-input rounded-md bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring py-2 px-1.5";

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function parseParts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

function toIso(y: number, m: number, d: number) {
  const maxD = daysInMonth(y, m);
  return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(d, maxD)).padStart(2, "0")}`;
}

const YEARS = Array.from({ length: 11 }, (_, i) => 2020 + i);

function DateSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [y, m, d] = parseParts(value);
  const totalDays = daysInMonth(y, m);

  return (
    <div className="flex items-center gap-1">
      <select
        value={d}
        onChange={e => onChange(toIso(y, m, +e.target.value))}
        className={cn(SELECT_CLASS, "w-[52px]")}
      >
        {Array.from({ length: totalDays }, (_, i) => i + 1).map(dd => (
          <option key={dd} value={dd}>{String(dd).padStart(2, "0")}</option>
        ))}
      </select>
      <select
        value={m}
        onChange={e => onChange(toIso(y, +e.target.value, d))}
        className={cn(SELECT_CLASS, "w-[72px]")}
      >
        {MONTHS.map((name, i) => (
          <option key={i + 1} value={i + 1}>{name}</option>
        ))}
      </select>
      <select
        value={y}
        onChange={e => onChange(toIso(+e.target.value, m, d))}
        className={cn(SELECT_CLASS, "w-[74px]")}
      >
        {YEARS.map(yr => (
          <option key={yr} value={yr}>{yr}</option>
        ))}
      </select>
    </div>
  );
}

export default function DateRangePicker({
  from,
  to,
  onFromChange,
  onToChange,
  onExportPDF,
  onExportExcel,
  exportDisabled,
  className,
}: DateRangePickerProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-muted-foreground whitespace-nowrap">শুরু:</label>
        <DateSelect value={from} onChange={onFromChange} />
      </div>
      <span className="text-muted-foreground text-sm">—</span>
      <div className="flex items-center gap-1.5">
        <label className="text-xs text-muted-foreground whitespace-nowrap">শেষ:</label>
        <DateSelect value={to} onChange={onToChange} />
      </div>

      {(onExportPDF || onExportExcel) && (
        <div className="flex gap-1.5 ml-1">
          {onExportPDF && (
            <button
              onClick={onExportPDF}
              disabled={exportDisabled}
              className="flex items-center gap-1 px-2.5 py-2 text-xs border border-input rounded-lg bg-card hover:bg-muted transition-colors disabled:opacity-40"
            >
              📄 PDF
            </button>
          )}
          {onExportExcel && (
            <button
              onClick={onExportExcel}
              disabled={exportDisabled}
              className="flex items-center gap-1 px-2.5 py-2 text-xs border border-input rounded-lg bg-card hover:bg-muted transition-colors disabled:opacity-40"
            >
              📊 Excel
            </button>
          )}
        </div>
      )}
    </div>
  );
}