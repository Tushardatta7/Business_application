import { Router } from "express";
import { db } from "@workspace/db";
import { batchesTable, stockTransactionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  ListBatchesQueryParams,
  CreateBatchBody,
  GetBatchParams,
  UpdateBatchBody,
  UpdateBatchParams,
  HarvestBatchBody,
  HarvestBatchParams,
} from "@workspace/api-zod";

function calcDaysRemaining(expectedEndDate: string): number | null {
  const today = new Date();
  const end = new Date(expectedEndDate);
  const diff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

function formatBatch(b: typeof batchesTable.$inferSelect) {
  return {
    ...b,
    sugarInputKg: parseFloat(b.sugarInputKg),
    grade1OutputKg: b.grade1OutputKg ? parseFloat(b.grade1OutputKg) : null,
    grade2OutputKg: b.grade2OutputKg ? parseFloat(b.grade2OutputKg) : null,
    byproductKg: b.byproductKg ? parseFloat(b.byproductKg) : null,
    lossKg: b.lossKg ? parseFloat(b.lossKg) : null,
    yieldPercent: b.yieldPercent ? parseFloat(b.yieldPercent) : null,
    daysRemaining: b.status !== "harvested" ? calcDaysRemaining(b.expectedEndDate) : null,
    harvestedAt: b.harvestedAt ? b.harvestedAt.toISOString() : null,
    createdAt: b.createdAt.toISOString(),
  };
}

const router = Router();

// GET /batches
router.get("/", async (req, res) => {
  const query = ListBatchesQueryParams.parse(req.query);
  const batches = query.status
    ? await db.select().from(batchesTable).where(eq(batchesTable.status, query.status)).orderBy(sql`created_at DESC`)
    : await db.select().from(batchesTable).orderBy(sql`created_at DESC`);

  res.json(batches.map(formatBatch));
});

// POST /batches
router.post("/", async (req, res) => {
  const body = CreateBatchBody.parse(req.body);

  // Auto batch code: TM-YYYYMMDD-XXX
  const count = await db.select({ count: sql<number>`count(*)` }).from(batchesTable);
  const batchCode = `TM-${body.startDate.replace(/-/g, "")}-${String((count[0]?.count || 0) + 1).padStart(3, "0")}`;

  // Expected end date = start + 7 days
  const startDate = new Date(body.startDate);
  startDate.setDate(startDate.getDate() + 7);
  const expectedEndDate = startDate.toISOString().split("T")[0];

  const [batch] = await db
    .insert(batchesTable)
    .values({
      batchCode,
      startDate: body.startDate,
      expectedEndDate,
      sugarInputKg: String(body.sugarInputKg),
      traysCount: body.traysCount,
      workerName: body.workerName ?? null,
      notes: body.notes ?? null,
      status: "boiling",
    })
    .returning();

  // Auto-deduct sugar from stock
  await db.insert(stockTransactionsTable).values({
    itemType: "sugar",
    txType: "out",
    quantityKg: String(body.sugarInputKg),
    date: body.startDate,
    note: `Batch ${batchCode} started`,
    batchId: batch.id,
  });

  res.status(201).json(formatBatch(batch));
});

// GET /batches/:id
router.get("/:id", async (req, res) => {
  const params = GetBatchParams.parse({ id: parseInt(req.params.id) });
  const [batch] = await db.select().from(batchesTable).where(eq(batchesTable.id, params.id));
  if (!batch) return res.status(404).json({ error: "Not found" });
  return res.json(formatBatch(batch));
});

// PUT /batches/:id
router.put("/:id", async (req, res) => {
  const params = UpdateBatchParams.parse({ id: parseInt(req.params.id) });
  const body = UpdateBatchBody.parse(req.body);

  const [batch] = await db
    .update(batchesTable)
    .set({
      status: body.status,
      notes: body.notes ?? undefined,
    })
    .where(eq(batchesTable.id, params.id))
    .returning();

  if (!batch) return res.status(404).json({ error: "Not found" });
  return res.json(formatBatch(batch));
});

// POST /batches/:id/harvest
router.post("/:id/harvest", async (req, res) => {
  const params = HarvestBatchParams.parse({ id: parseInt(req.params.id) });
  const body = HarvestBatchBody.parse(req.body);

  const [existing] = await db.select().from(batchesTable).where(eq(batchesTable.id, params.id));
  if (!existing) return res.status(404).json({ error: "Not found" });

  const totalOutput = body.grade1OutputKg + body.grade2OutputKg + body.byproductKg;
  const lossKg = parseFloat(existing.sugarInputKg) - totalOutput;
  const yieldPercent = (totalOutput / parseFloat(existing.sugarInputKg)) * 100;

  const [batch] = await db
    .update(batchesTable)
    .set({
      grade1OutputKg: String(body.grade1OutputKg),
      grade2OutputKg: String(body.grade2OutputKg),
      byproductKg: String(body.byproductKg),
      lossKg: String(Math.max(0, lossKg)),
      yieldPercent: String(yieldPercent.toFixed(2)),
      status: "harvested",
      harvestedAt: new Date(),
    })
    .where(eq(batchesTable.id, params.id))
    .returning();

  // Add finished goods to stock
  const harvestDate = new Date().toISOString().split("T")[0];
  if (body.grade1OutputKg > 0) {
    await db.insert(stockTransactionsTable).values({ itemType: "grade1", txType: "in", quantityKg: String(body.grade1OutputKg), date: harvestDate, note: `Harvested from batch ${existing.batchCode}`, batchId: params.id });
  }
  if (body.grade2OutputKg > 0) {
    await db.insert(stockTransactionsTable).values({ itemType: "grade2", txType: "in", quantityKg: String(body.grade2OutputKg), date: harvestDate, note: `Harvested from batch ${existing.batchCode}`, batchId: params.id });
  }
  if (body.byproductKg > 0) {
    await db.insert(stockTransactionsTable).values({ itemType: "byproduct", txType: "in", quantityKg: String(body.byproductKg), date: harvestDate, note: `Harvested from batch ${existing.batchCode}`, batchId: params.id });
  }

  return res.json(formatBatch(batch));
});

export default router;
