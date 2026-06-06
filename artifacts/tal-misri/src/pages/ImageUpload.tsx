import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type UploadStatus = "queued" | "processing" | "ready" | "failed";

interface UploadRecord {
  id: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  status: UploadStatus;
  failureReason?: string | null;
  pageSummary?: { detected_language: string; total_debit: number; total_credit: number; notes: string } | null;
  committedAt?: string | null;
  committedEntryIds?: number[] | null;
  createdAt: string;
}

interface ExtractedRow {
  date: string | null;
  particulars: string;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  debit: number | null;
  credit: number | null;
  confidence: "high" | "medium" | "low";
  raw_text?: string;
  // user-assigned
  category: string;
  _id: string; // client-side UUID for keying
}

interface UploadDetail extends UploadRecord {
  extractedRows: Omit<ExtractedRow, "_id" | "category">[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EXPENSE_CATEGORIES = [
  "তাল মিসরি বিক্রয়", "চিনি কেনা", "আখ কেনা", "শ্রমিক মজুরি", "জ্বালানি", "কাঠ কেনা",
  "পরিবহন", "বিদ্যুৎ", "প্যাকেজিং", "মেরামত", "মালিক উত্তোলন", "বিবিধ",
];
const INCOME_CATEGORIES = ["নগদ জমা", "অন্যান্য আয়", "মূলধন"];
const ALL_CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

function uid() { return Math.random().toString(36).slice(2); }

function toClientRow(r: Omit<ExtractedRow, "_id" | "category">): ExtractedRow {
  const isIncome = (r.credit ?? 0) > 0 && (r.debit ?? 0) === 0;
  return {
    quantity: null,
    unit: null,
    rate: null,
    ...r,
    category: isIncome ? "নগদ জমা" : "বিবিধ",
    _id: uid(),
  };
}

// ── Confidence badge ───────────────────────────────────────────────────────────

function ConfBadge({ level }: { level: "high" | "medium" | "low" }) {
  return (
    <span className={cn(
      "text-[10px] px-1.5 py-0.5 rounded font-semibold",
      level === "high" && "bg-emerald-100 text-emerald-700",
      level === "medium" && "bg-amber-100 text-amber-700",
      level === "low" && "bg-red-100 text-red-700",
    )}>
      {level === "high" ? "🟢" : level === "medium" ? "🟡" : "🔴"}
    </span>
  );
}

// ── Status chip ────────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: UploadStatus | "committed" }) {
  const map: Record<string, string> = {
    queued: "bg-muted text-muted-foreground",
    processing: "bg-blue-100 text-blue-700 animate-pulse",
    ready: "bg-emerald-100 text-emerald-700",
    failed: "bg-red-100 text-red-700",
    committed: "bg-violet-100 text-violet-700",
  };
  const labels: Record<string, string> = {
    queued: "অপেক্ষায়", processing: "প্রসেসিং...", ready: "পর্যালোচনা করুন",
    failed: "ব্যর্থ", committed: "সংরক্ষিত",
  };
  return (
    <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", map[status])}>
      {labels[status] ?? status}
    </span>
  );
}

// ── Review panel ───────────────────────────────────────────────────────────────

function ReviewPanel({
  uploadId, onClose, onCommitted,
}: { uploadId: number; onClose: () => void; onCommitted: () => void }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<ExtractedRow[]>([]);
  const [committing, setCommitting] = useState(false);
  const [commitDone, setCommitDone] = useState(false);

  const [manualMode, setManualMode] = useState(false);

  const { data, isLoading } = useQuery<UploadDetail>({
    queryKey: ["image-upload", uploadId],
    queryFn: () => fetch(`/api/image-upload/${uploadId}`).then(r => r.json()),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return (s === "queued" || s === "processing") ? 2000 : false;
    },
  });

  useEffect(() => {
    if (data?.status === "ready" && data.extractedRows?.length) {
      setRows(data.extractedRows.map(toClientRow));
    }
  }, [data?.status, data?.extractedRows]);

  const saveEdits = useMutation({
    mutationFn: (updatedRows: ExtractedRow[]) =>
      fetch(`/api/image-upload/${uploadId}/rows`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: updatedRows }),
      }).then(r => r.json()),
  });

  function updateRow(id: string, field: keyof ExtractedRow, value: unknown) {
    setRows(prev => prev.map(r => r._id === id ? { ...r, [field]: value } : r));
  }

  function deleteRow(id: string) {
    setRows(prev => prev.filter(r => r._id !== id));
  }

  function addRow() {
    setRows(prev => [...prev, {
      date: null, particulars: "", quantity: null, unit: null, rate: null,
      debit: null, credit: null, confidence: "medium", category: "বিবিধ", _id: uid(),
    }]);
  }

  async function handleCommit() {
    if (committing) return;
    setCommitting(true);
    try {
      await saveEdits.mutateAsync(rows);
      const res = await fetch(`/api/image-upload/${uploadId}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      if (!res.ok) throw new Error("Commit failed");
      setCommitDone(true);
      qc.invalidateQueries({ queryKey: ["image-uploads"] });
      onCommitted();
    } catch (e) {
      alert("সংরক্ষণ ব্যর্থ হয়েছে: " + String(e));
    } finally {
      setCommitting(false);
    }
  }

  const canCommit = rows.length > 0 &&
    rows.every(r => r.date && r.category && ((r.debit ?? 0) > 0 || (r.credit ?? 0) > 0));

  const highCount = rows.filter(r => r.confidence === "high").length;
  const midCount = rows.filter(r => r.confidence === "medium").length;
  const lowCount = rows.filter(r => r.confidence === "low").length;

  return (
    <div className="fixed inset-0 z-50 flex bg-black/40" onClick={onClose}>
      <div className="ml-auto w-full max-w-5xl h-full bg-background flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-foreground">পর্যালোচনা ও সম্পাদনা</h2>
            {data && <p className="text-xs text-muted-foreground mt-0.5">{data.originalFilename}</p>}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg px-2">✕</button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">লোড হচ্ছে...</div>
        ) : data?.status === "queued" || data?.status === "processing" ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p>AI বিশ্লেষণ করছে... অনুগ্রহ করে অপেক্ষা করুন</p>
          </div>
        ) : data?.status === "failed" && !manualMode ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-red-600 px-8 text-center">
            <p className="text-3xl">⚠️</p>
            <p className="font-semibold">বিশ্লেষণ ব্যর্থ হয়েছে</p>
            <p className="text-sm text-muted-foreground">{data.failureReason || "অজানা ত্রুটি"}</p>
            <p className="text-sm text-muted-foreground mt-2">ম্যানুয়ালি সারি যোগ করতে পারেন</p>
            <button
              onClick={() => { addRow(); setManualMode(true); }}
              className="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm cursor-pointer"
            >+ সারি যোগ করুন</button>
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* Left: image */}
            <div className="w-2/5 border-r border-border bg-muted/10 flex items-center justify-center overflow-hidden">
              <img
                src={`/api/image-upload/${uploadId}/image`}
                alt="uploaded"
                className="max-w-full max-h-full object-contain"
              />
            </div>

            {/* Right: review table */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Summary bar */}
              <div className="px-4 py-2.5 border-b border-border bg-muted/20 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-muted-foreground">
                  {rows.length} সারি — 🟢 {highCount} 🟡 {midCount} 🔴 {lowCount}
                </p>
                <div className="flex gap-2">
                  <button onClick={addRow} className="text-xs px-3 py-1.5 border border-input rounded-lg bg-card hover:bg-muted">+ সারি</button>
                  {commitDone ? (
                    <span className="text-xs px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg font-medium">✓ সংরক্ষিত</span>
                  ) : (
                    <button
                      onClick={handleCommit}
                      disabled={!canCommit || committing}
                      className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg disabled:opacity-40 font-medium"
                    >
                      {committing ? "সংরক্ষণ হচ্ছে..." : "লেন-দেনে সংরক্ষণ করুন"}
                    </button>
                  )}
                </div>
              </div>

              {rows.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground text-sm px-4 overflow-auto py-4">
                  <p className="font-medium">কোনো লেনদেন শনাক্ত হয়নি</p>
                  {data?.pageSummary?.notes && (
                    <pre className="text-xs bg-muted rounded-lg p-3 w-full whitespace-pre-wrap text-foreground max-h-60 overflow-auto border border-border">
                      {data.pageSummary.notes}
                    </pre>
                  )}
                  <button onClick={addRow} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm">+ ম্যানুয়ালি যোগ করুন</button>
                </div>
              ) : (
                <div className="flex-1 overflow-auto">
                  <datalist id="unit-options">
                    <option value="জন" />
                    <option value="কেজি" />
                    <option value="মণ" />
                    <option value="টিন" />
                    <option value="লিটার" />
                    <option value="বস্তা" />
                    <option value="পিস" />
                  </datalist>
                  <table className="w-full text-xs border-collapse">
                    <thead className="sticky top-0 bg-muted/50">
                      <tr>
                        <th className="px-2 py-2 text-left font-medium text-muted-foreground border-b border-border">তারিখ</th>
                        <th className="px-2 py-2 text-left font-medium text-muted-foreground border-b border-border">বিবরণ / নাম</th>
                        <th className="px-2 py-2 text-right font-medium text-muted-foreground border-b border-border">পরিমাণ</th>
                        <th className="px-2 py-2 text-left font-medium text-muted-foreground border-b border-border">একক</th>
                        <th className="px-2 py-2 text-right font-medium text-muted-foreground border-b border-border">হার/টাকা</th>
                        <th className="px-2 py-2 text-left font-medium text-muted-foreground border-b border-border">বিভাগ</th>
                        <th className="px-2 py-2 text-right font-medium text-muted-foreground border-b border-border">ডেবিট</th>
                        <th className="px-2 py-2 text-right font-medium text-muted-foreground border-b border-border">ক্রেডিট</th>
                        <th className="px-2 py-2 text-center font-medium text-muted-foreground border-b border-border">✓</th>
                        <th className="px-2 py-2 border-b border-border" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(row => (
                        <tr key={row._id} className={cn(
                          "border-b border-border/50 hover:bg-muted/20",
                          row.confidence === "low" && "bg-red-50/40 dark:bg-red-950/20",
                        )}>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              value={row.date ?? ""}
                              onChange={e => updateRow(row._id, "date", e.target.value || null)}
                              placeholder="YYYY-MM-DD"
                              className="w-24 border border-input rounded px-1.5 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              value={row.particulars}
                              onChange={e => updateRow(row._id, "particulars", e.target.value)}
                              className="w-full min-w-[120px] border border-input rounded px-1.5 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              value={row.quantity ?? ""}
                              onChange={e => updateRow(row._id, "quantity", e.target.value ? parseFloat(e.target.value) : null)}
                              placeholder="পরিমাণ"
                              className="w-16 border border-input rounded px-1.5 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring text-right"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="text"
                              value={row.unit ?? ""}
                              onChange={e => updateRow(row._id, "unit", e.target.value || null)}
                              placeholder="একক"
                              list="unit-options"
                              className="w-16 border border-input rounded px-1.5 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              value={row.rate ?? ""}
                              onChange={e => updateRow(row._id, "rate", e.target.value ? parseFloat(e.target.value) : null)}
                              placeholder="হার"
                              className="w-16 border border-input rounded px-1.5 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring text-right"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              value={row.category}
                              onChange={e => updateRow(row._id, "category", e.target.value)}
                              className="w-full border border-input rounded px-1.5 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                            >
                              {ALL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              value={row.debit ?? ""}
                              onChange={e => updateRow(row._id, "debit", e.target.value ? parseFloat(e.target.value) : null)}
                              className="w-20 border border-input rounded px-1.5 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring text-right"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="number"
                              value={row.credit ?? ""}
                              onChange={e => updateRow(row._id, "credit", e.target.value ? parseFloat(e.target.value) : null)}
                              className="w-20 border border-input rounded px-1.5 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring text-right"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <ConfBadge level={row.confidence} />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <button
                              onClick={() => deleteRow(row._id)}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                            >✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ImageUpload() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reviewId, setReviewId] = useState<number | null>(null);

  const { data: uploads = [], isLoading } = useQuery<UploadRecord[]>({
    queryKey: ["image-uploads"],
    queryFn: () => fetch("/api/image-upload").then(r => r.json()),
    refetchInterval: (q) => {
      const list = q.state.data as UploadRecord[] | undefined;
      const hasPending = list?.some(u => u.status === "queued" || u.status === "processing");
      return hasPending ? 3000 : false;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => fetch(`/api/image-upload/${id}`, { method: "DELETE" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["image-uploads"] }),
  });

  async function uploadFile(file: File) {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
    if (!allowed.includes(file.type)) {
      alert(`অসমর্থিত ফরম্যাট: ${file.type}`);
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("ফাইল সাইজ ১০ MB-এর বেশি হওয়া যাবে না");
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/image-upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json() as { id: number };
      qc.invalidateQueries({ queryKey: ["image-uploads"] });
      setReviewId(data.id);
    } catch (e) {
      alert("আপলোড ব্যর্থ: " + String(e));
    } finally {
      setUploading(false);
    }
  }

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    uploadFile(files[0]);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  // Paste from clipboard
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = Array.from(e.clipboardData?.items ?? []);
      const img = items.find(i => i.type.startsWith("image/"));
      if (img) {
        const file = img.getAsFile();
        if (file) uploadFile(file);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  return (
    <div className="px-4 md:px-8 py-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">ছবি আপলোড</h1>
        <p className="text-muted-foreground text-sm mt-1">ক্যাশবুকের ছবি থেকে স্বয়ংক্রিয়ভাবে লেনদেন বের করুন</p>
      </div>

      {/* Upload zone */}
      <div
        className={cn(
          "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors mb-6",
          dragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/20",
          uploading && "pointer-events-none opacity-60",
        )}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">আপলোড হচ্ছে...</p>
          </div>
        ) : (
          <>
            <p className="text-4xl mb-3">📷</p>
            <p className="text-sm font-medium text-foreground">ছবি টেনে আনুন বা ক্লিক করুন</p>
            <p className="text-xs text-muted-foreground mt-1.5">JPG, PNG, WEBP, HEIC, PDF · সর্বোচ্চ ১০ MB</p>
            <p className="text-xs text-muted-foreground mt-0.5">ক্লিপবোর্ড থেকে পেস্ট (Ctrl+V) করুন বা মোবাইল ক্যামেরা ব্যবহার করুন</p>
          </>
        )}
      </div>

      {/* Uploaded list */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">আপলোড করা ছবিসমূহ</h2>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}
          </div>
        ) : uploads.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm bg-card rounded-xl border border-card-border">
            এখনো কোনো ছবি আপলোড হয়নি
          </div>
        ) : (
          <div className="space-y-2">
            {[...uploads].reverse().map(u => {
              const effectiveStatus = u.committedAt ? "committed" : u.status;
              return (
                <div key={u.id}
                  className="flex items-center gap-3 bg-card border border-card-border rounded-xl px-4 py-3 hover:shadow-sm transition-shadow">
                  <img
                    src={`/api/image-upload/${u.id}/image`}
                    alt=""
                    className="w-12 h-12 object-cover rounded-lg border border-border flex-shrink-0 bg-muted"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{u.originalFilename}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <StatusChip status={effectiveStatus as UploadStatus | "committed"} />
                      {u.committedAt && u.committedEntryIds && (
                        <span className="text-xs text-muted-foreground">{u.committedEntryIds.length} এন্ট্রি</span>
                      )}
                      {u.status === "failed" && u.failureReason && (
                        <span className="text-xs text-red-500 truncate">{u.failureReason}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {(u.status === "ready" && !u.committedAt) && (
                      <button
                        onClick={() => setReviewId(u.id)}
                        className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium"
                      >
                        পর্যালোচনা
                      </button>
                    )}
                    {(u.status === "queued" || u.status === "processing") && (
                      <button
                        onClick={() => setReviewId(u.id)}
                        className="px-3 py-1.5 border border-input rounded-lg text-xs text-muted-foreground"
                      >
                        দেখুন
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (window.confirm("এই ছবি মুছে ফেলবেন?"))
                          deleteMutation.mutate(u.id);
                      }}
                      className="px-2 py-1.5 border border-input rounded-lg text-xs text-muted-foreground hover:text-destructive"
                    >✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Review panel */}
      {reviewId != null && (
        <ReviewPanel
          uploadId={reviewId}
          onClose={() => setReviewId(null)}
          onCommitted={() => { setReviewId(null); qc.invalidateQueries({ queryKey: ["image-uploads"] }); }}
        />
      )}
    </div>
  );
}