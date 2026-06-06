import { Router } from "express";
import { db } from "@workspace/db";
import { stockRatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateStockRatesBody } from "@workspace/api-zod";

const router = Router();

const ITEM_TYPES = ["sugar", "grade1", "grade2", "byproduct", "sala", "gas"] as const;
type ItemType = (typeof ITEM_TYPES)[number];

async function readAllRates(): Promise<Record<ItemType, number>> {
  const rows = await db.select().from(stockRatesTable);
  const out: Record<string, number> = {};
  for (const t of ITEM_TYPES) out[t] = 0;
  for (const row of rows) {
    if ((ITEM_TYPES as readonly string[]).includes(row.itemType)) {
      out[row.itemType] = parseFloat(row.ratePerKg);
    }
  }
  return out as Record<ItemType, number>;
}

// GET /settings/stock-rates → { sugar: 100, grade1: 200, ... }
router.get("/stock-rates", async (_req, res) => {
  const rates = await readAllRates();
  return res.json(rates);
});

// PUT /settings/stock-rates → upsert all rates from body { sugar: 100, ... }
router.put("/stock-rates", async (req, res) => {
  const body = UpdateStockRatesBody.parse(req.body);
  for (const t of ITEM_TYPES) {
    const value = (body as Record<string, number | undefined>)[t];
    if (value == null) continue;
    const [existing] = await db
      .select({ id: stockRatesTable.id })
      .from(stockRatesTable)
      .where(eq(stockRatesTable.itemType, t));
    if (existing) {
      await db
        .update(stockRatesTable)
        .set({ ratePerKg: String(value), updatedAt: new Date() })
        .where(eq(stockRatesTable.id, existing.id));
    } else {
      await db
        .insert(stockRatesTable)
        .values({ itemType: t, ratePerKg: String(value) });
    }
  }
  const rates = await readAllRates();
  return res.json(rates);
});

export default router;
