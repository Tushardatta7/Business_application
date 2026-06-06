import { useGetDashboardSummary, useDeleteCashEntry, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

function formatBDT(amount: number) {
  return `৳${amount.toLocaleString("en-IN")}`;
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className={cn("bg-card rounded-xl border border-card-border p-4 shadow-sm", color)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-card rounded-xl border border-card-border p-4 shadow-sm animate-pulse">
      <div className="h-3 bg-muted rounded w-24 mb-2" />
      <div className="h-7 bg-muted rounded w-32" />
    </div>
  );
}

export default function Dashboard() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useGetDashboardSummary();
  const deleteEntry = useDeleteCashEntry({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }) },
  });

  return (
    <div className="px-4 md:px-8 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">ড্যাশবোর্ড</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {new Date().toLocaleDateString("bn-BD", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive rounded-lg p-4 mb-6 text-sm">
          ডেটা লোড করতে সমস্যা হয়েছে। পুনরায় চেষ্টা করুন।
        </div>
      )}

      {/* Today's Cash Summary */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">আজকের লেন-দেন</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <StatCard label="আজকের আয়" value={formatBDT(data?.todayCashIn ?? 0)} color="border-l-4 border-l-emerald-500" />
              <StatCard label="আজকের খরচ" value={formatBDT(data?.todayCashOut ?? 0)} color="border-l-4 border-l-red-400" />
              <StatCard label="মোট বাকি" value={formatBDT(data?.totalBaki ?? 0)} color={cn("border-l-4", (data?.totalBaki ?? 0) > 0 ? "border-l-amber-500" : "border-l-muted")} />
              <StatCard
                label="মেয়াদোত্তীর্ণ পার্টি"
                value={String(data?.overdueParties ?? 0)}
                sub="৩০ দিনের বেশি বাকি"
                color={cn("border-l-4", (data?.overdueParties ?? 0) > 0 ? "border-l-red-500" : "border-l-muted")}
              />
            </>
          )}
        </div>
      </section>

      {/* Production Status */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">উৎপাদন অবস্থা</h2>
          <Link href="/production" className="text-xs text-primary hover:underline">সব দেখুন</Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <StatCard label="চলমান ব্যাচ" value={String(data?.activeBatches ?? 0)} sub="জ্বাল / কিউরিং" color="border-l-4 border-l-blue-500" />
              <StatCard
                label="প্রস্তুত ব্যাচ"
                value={String(data?.readyBatches ?? 0)}
                sub="সংগ্রহের জন্য"
                color={cn("border-l-4", (data?.readyBatches ?? 0) > 0 ? "border-l-green-500" : "border-l-muted")}
              />
              <StatCard label="চিনি মজুদ" value={`${(data?.sugarStock ?? 0).toFixed(1)} কেজি`} color="border-l-4 border-l-primary" />
            </>
          )}
        </div>
      </section>

      {/* Finished Goods Stock */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">তৈরি মিসরি মজুদ</h2>
          <Link href="/stock" className="text-xs text-primary hover:underline">সব দেখুন</Link>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {isLoading ? (
            Array.from({ length: 2 }).map((_, i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <StatCard label="বড় দানা (গ্রেড ১)" value={`${(data?.grade1Stock ?? 0).toFixed(1)} কেজি`} color="border-l-4 border-l-amber-400" />
              <StatCard label="ছোট দানা (গ্রেড ২)" value={`${(data?.grade2Stock ?? 0).toFixed(1)} কেজি`} color="border-l-4 border-l-amber-300" />
            </>
          )}
        </div>
      </section>

      {/* Recent Transactions */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">সাম্প্রতিক লেন-দেন</h2>
          <Link href="/cash" className="text-xs text-primary hover:underline">সব দেখুন</Link>
        </div>
        <div className="bg-card rounded-xl border border-card-border shadow-sm overflow-hidden">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0 animate-pulse">
                <div className="space-y-1.5">
                  <div className="h-3 bg-muted rounded w-28" />
                  <div className="h-2.5 bg-muted rounded w-20" />
                </div>
                <div className="h-4 bg-muted rounded w-20" />
              </div>
            ))
          ) : !data?.recentTransactions?.length ? (
            <div className="px-4 py-8 text-center text-muted-foreground text-sm">
              এখনো কোনো লেন-দেন নেই
            </div>
          ) : (
            data.recentTransactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{tx.category}</p>
                  <p className="text-xs text-muted-foreground">{tx.date} {tx.partyName ? `· ${tx.partyName}` : ""}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={cn("text-sm font-semibold", tx.type === "income" ? "text-emerald-600" : "text-red-500")}>
                    {tx.type === "income" ? "+" : "-"}{formatBDT(Number(tx.amount))}
                  </span>
                  <button
                    onClick={() => { if (confirm("এই এন্ট্রি মুছে দেবেন?")) deleteEntry.mutate({ id: tx.id }); }}
                    className="text-muted-foreground hover:text-destructive text-xs p-1.5 rounded hover:bg-muted transition-colors"
                    title="মুছুন"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
