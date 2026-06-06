import { Router } from "express";
import { db } from "@workspace/db";
import { cashEntriesTable, partiesTable, batchesTable, stockTransactionsTable } from "@workspace/db";
import { sql, eq, and } from "drizzle-orm";

const router = Router();

router.get("/summary", async (req, res) => {
  const today = new Date().toISOString().split("T")[0];

  // Today's cash
  const [cashToday] = await db
    .select({
      totalIncome: sql<string>`COALESCE(SUM(CASE WHEN type = 'income' THEN amount::numeric ELSE 0 END), 0)`,
      totalExpense: sql<string>`COALESCE(SUM(CASE WHEN type = 'expense' THEN amount::numeric ELSE 0 END), 0)`,
    })
    .from(cashEntriesTable)
    .where(eq(cashEntriesTable.date, today));

  // Total baki (positive balance parties = they owe us)
  const [bakiRow] = await db
    .select({
      totalBaki: sql<string>`COALESCE(SUM(CASE WHEN balance::numeric > 0 THEN balance::numeric ELSE 0 END), 0)`,
    })
    .from(partiesTable);

  // Active batches count
  const [activeRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(batchesTable)
    .where(sql`status IN ('boiling', 'curing')`);

  // Ready batches count
  const [readyRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(batchesTable)
    .where(eq(batchesTable.status, "ready"));

  // Stock levels
  const items = ["sugar", "grade1", "grade2"] as const;
  const stockLevels: Record<string, number> = {};
  for (const item of items) {
    const [row] = await db
      .select({
        net: sql<string>`COALESCE(SUM(CASE WHEN tx_type = 'in' THEN quantity_kg::numeric ELSE -quantity_kg::numeric END), 0)`,
      })
      .from(stockTransactionsTable)
      .where(eq(stockTransactionsTable.itemType, item));
    stockLevels[item] = parseFloat(row?.net || "0");
  }

  // Overdue parties (balance > 0 and last transaction > 30 days ago)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];
  const [overdueRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(partiesTable)
    .where(
      sql`balance::numeric > 0 AND (last_transaction_date IS NULL OR last_transaction_date < ${thirtyDaysAgoStr})`
    );

  // Recent transactions (last 5)
  const recentTransactions = await db
    .select({
      id: cashEntriesTable.id,
      date: cashEntriesTable.date,
      amount: cashEntriesTable.amount,
      type: cashEntriesTable.type,
      category: cashEntriesTable.category,
      partyId: cashEntriesTable.partyId,
      partyName: partiesTable.name,
      note: cashEntriesTable.note,
      createdAt: cashEntriesTable.createdAt,
    })
    .from(cashEntriesTable)
    .leftJoin(partiesTable, eq(cashEntriesTable.partyId, partiesTable.id))
    .orderBy(sql`${cashEntriesTable.date} DESC, ${cashEntriesTable.createdAt} DESC`)
    .limit(5);

  res.json({
    todayCashIn: parseFloat(cashToday?.totalIncome || "0"),
    todayCashOut: parseFloat(cashToday?.totalExpense || "0"),
    totalBaki: parseFloat(bakiRow?.totalBaki || "0"),
    activeBatches: Number(activeRow?.count || 0),
    readyBatches: Number(readyRow?.count || 0),
    sugarStock: stockLevels.sugar,
    grade1Stock: stockLevels.grade1,
    grade2Stock: stockLevels.grade2,
    overdueParties: Number(overdueRow?.count || 0),
    recentTransactions: recentTransactions.map((t) => ({
      ...t,
      amount: parseFloat(t.amount),
      createdAt: t.createdAt.toISOString(),
    })),
  });
});

export default router;
