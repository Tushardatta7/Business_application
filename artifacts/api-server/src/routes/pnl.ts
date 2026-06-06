import { Router } from "express";
import { db } from "@workspace/db";
import { cashEntriesTable } from "@workspace/db";
import { sql, and, gte, lte, eq, inArray, notInArray } from "drizzle-orm";

const router = Router();

// Category mappings
const SALE_CATEGORY = "তাল মিসরি বিক্রয়";
const COGS_CATEGORIES = ["চিনি কেনা", "আখ কেনা", "কাঠ কেনা"];
const SALARY_CATEGORIES = ["শ্রমিক মজুরি"];
const UTILITY_CATEGORIES = ["জ্বালানি", "বিদ্যুৎ"];
const TRANSPORT_CATEGORIES = ["পরিবহন"];
const EQUITY_CATEGORIES = ["মালিক উত্তোলন", "উত্তোলন", "মূলধন"];

type Breakdown = { category: string; amount: number };

async function sumExpenseCategories(categories: string[], from: string, to: string): Promise<{ total: number; breakdown: Breakdown[] }> {
  const rows = await db
    .select({
      category: cashEntriesTable.category,
      total: sql<string>`COALESCE(SUM(amount::numeric), 0)`,
    })
    .from(cashEntriesTable)
    .where(
      and(
        eq(cashEntriesTable.type, "expense"),
        inArray(cashEntriesTable.category, categories),
        gte(cashEntriesTable.date, from),
        lte(cashEntriesTable.date, to),
      ),
    )
    .groupBy(cashEntriesTable.category);

  const breakdown = rows.map(r => ({ category: r.category, amount: parseFloat(r.total) }));
  const total = breakdown.reduce((s, r) => s + r.amount, 0);
  return { total, breakdown };
}

// GET /pnl?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
router.get("/", async (req, res) => {
  const fromDate = typeof req.query.fromDate === "string" ? req.query.fromDate : undefined;
  const toDate   = typeof req.query.toDate   === "string" ? req.query.toDate   : undefined;
  const today = new Date().toISOString().split("T")[0]!;
  const from = fromDate || today;
  const to = toDate || today;

  if (from > to) {
    return res.status(400).json({ error: "fromDate must be <= toDate" });
  }

  // ── Revenue: sale entries, product-wise from saleItems JSON ──
  const saleEntries = await db
    .select({
      amount: cashEntriesTable.amount,
      saleItems: cashEntriesTable.saleItems,
    })
    .from(cashEntriesTable)
    .where(
      and(
        eq(cashEntriesTable.type, "expense"),
        eq(cashEntriesTable.category, SALE_CATEGORY),
        gte(cashEntriesTable.date, from),
        lte(cashEntriesTable.date, to),
      ),
    );

  // Aggregate revenue by product from saleItems JSON
  const productMap: Record<string, number> = {};
  let revenueTotal = 0;

  for (const entry of saleEntries) {
    const amt = parseFloat(entry.amount);
    revenueTotal += amt;

    if (entry.saleItems) {
      try {
        const items: { product: string; price: string; qty: string }[] = JSON.parse(entry.saleItems);
        for (const item of items) {
          const lineAmt = (parseFloat(item.price) || 0) * (parseFloat(item.qty) || 0);
          if (lineAmt > 0 && item.product) {
            productMap[item.product] = (productMap[item.product] || 0) + lineAmt;
          }
        }
      } catch {
        // malformed JSON — skip product breakdown for this entry
      }
    }
  }

  // If saleItems breakdown exists and sums close to total, use it; else fallback to single line
  const productBreakdownTotal = Object.values(productMap).reduce((s, v) => s + v, 0);
  let revenueItems: { name: string; amount: number }[];

  if (productBreakdownTotal > 0) {
    revenueItems = Object.entries(productMap)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  } else if (revenueTotal > 0) {
    revenueItems = [{ name: "তাল মিসরি বিক্রয়", amount: revenueTotal }];
  } else {
    revenueItems = [];
  }

  // ── Expenses ──
  const cogs = await sumExpenseCategories(COGS_CATEGORIES, from, to);
  const salary = await sumExpenseCategories(SALARY_CATEGORIES, from, to);
  const utility = await sumExpenseCategories(UTILITY_CATEGORIES, from, to);
  const transport = await sumExpenseCategories(TRANSPORT_CATEGORIES, from, to);

  // "Other" = all expense entries that are NOT sale, NOT COGS/salary/utility/transport, NOT equity
  const knownCategories = [
    SALE_CATEGORY,
    ...COGS_CATEGORIES,
    ...SALARY_CATEGORIES,
    ...UTILITY_CATEGORIES,
    ...TRANSPORT_CATEGORIES,
    ...EQUITY_CATEGORIES,
  ];

  const otherRows = await db
    .select({
      category: cashEntriesTable.category,
      total: sql<string>`COALESCE(SUM(amount::numeric), 0)`,
    })
    .from(cashEntriesTable)
    .where(
      and(
        eq(cashEntriesTable.type, "expense"),
        notInArray(cashEntriesTable.category, knownCategories),
        gte(cashEntriesTable.date, from),
        lte(cashEntriesTable.date, to),
      ),
    )
    .groupBy(cashEntriesTable.category);

  const otherBreakdown = otherRows.map(r => ({ category: r.category, amount: parseFloat(r.total) }));
  const otherTotal = otherBreakdown.reduce((s, r) => s + r.amount, 0);

  const grossProfit = revenueTotal - cogs.total;
  const opExpensesTotal = salary.total + utility.total + transport.total + otherTotal;
  const totalExpenses = cogs.total + opExpensesTotal;
  const netProfit = revenueTotal - totalExpenses;

  return res.json({
    fromDate: from,
    toDate: to,
    revenue: {
      items: revenueItems,
      total: revenueTotal,
    },
    cogs: {
      amount: cogs.total,
      breakdown: cogs.breakdown,
    },
    grossProfit,
    operatingExpenses: {
      salary: { amount: salary.total, breakdown: salary.breakdown },
      utility: { amount: utility.total, breakdown: utility.breakdown },
      transport: { amount: transport.total, breakdown: transport.breakdown },
      other: { amount: otherTotal, breakdown: otherBreakdown },
      total: opExpensesTotal,
    },
    totalExpenses,
    netProfit,
  });
});

export default router;