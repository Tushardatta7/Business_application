import { Router } from "express";
import { db } from "@workspace/db";
import { stockTransactionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  ListStockTransactionsQueryParams,
  CreateStockTransactionBody,
} from "@workspace/api-zod";

const router = Router();

// GET /stock
router.get("/", async (req, res) => {
  const items = ["sugar", "grade1", "grade2", "byproduct", "sala", "gas"] as const;
  const result: Record<string, number> = {};

  for (const item of items) {
    const [row] = await db
      .select({
        net: sql<string>`COALESCE(SUM(CASE WHEN tx_type = 'in' THEN quantity_kg::numeric ELSE -quantity_kg::numeric END), 0)`,
      })
      .from(stockTransactionsTable)
      .where(eq(stockTransactionsTable.itemType, item));
    result[item] = parseFloat(row?.net || "0");
  }

  res.json(result);
});

// GET /stock/transactions
router.get("/transactions", async (req, res) => {
  const query = ListStockTransactionsQueryParams.parse(req.query);

  const txs = query.itemType
    ? await db.select().from(stockTransactionsTable).where(eq(stockTransactionsTable.itemType, query.itemType)).orderBy(sql`date DESC, created_at DESC`)
    : await db.select().from(stockTransactionsTable).orderBy(sql`date DESC, created_at DESC`);

  res.json(txs.map((t) => ({
    ...t,
    quantityKg: parseFloat(t.quantityKg),
    createdAt: t.createdAt.toISOString(),
  })));
});

// POST /stock/transactions
router.post("/transactions", async (req, res) => {
  const body = CreateStockTransactionBody.parse(req.body);
  const [tx] = await db
    .insert(stockTransactionsTable)
    .values({
      itemType: body.itemType,
      txType: body.txType,
      quantityKg: String(body.quantityKg),
      date: body.date,
      note: body.note ?? null,
      batchId: body.batchId ?? null,
    })
    .returning();

  res.status(201).json({
    ...tx,
    quantityKg: parseFloat(tx.quantityKg),
    createdAt: tx.createdAt.toISOString(),
  });
});

export default router;
