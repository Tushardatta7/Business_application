import { Router } from "express";
import { db } from "@workspace/db";
import { ledgerEntriesTable, partiesTable, stockTransactionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  ListLedgerEntriesQueryParams,
  CreateLedgerEntryBody,
  DeleteLedgerEntryParams,
} from "@workspace/api-zod";

const router = Router();

// GET /ledger?partyId=X
router.get("/", async (req, res) => {
  const query = ListLedgerEntriesQueryParams.parse({
    partyId: parseInt(String(req.query.partyId)),
  });

  const entries = await db
    .select()
    .from(ledgerEntriesTable)
    .where(eq(ledgerEntriesTable.partyId, query.partyId))
    .orderBy(ledgerEntriesTable.date, ledgerEntriesTable.createdAt);

  res.json(entries.map((e) => ({
    ...e,
    amount: parseFloat(e.amount),
    runningBalance: parseFloat(e.runningBalance),
    itemQtyKg: e.itemQtyKg ? parseFloat(e.itemQtyKg) : null,
    pricePerKg: e.pricePerKg ? parseFloat(e.pricePerKg) : null,
    createdAt: e.createdAt.toISOString(),
  })));
});

// POST /ledger
router.post("/", async (req, res) => {
  const body = CreateLedgerEntryBody.parse(req.body);

  // Calculate running balance
  const [lastEntry] = await db
    .select({ runningBalance: ledgerEntriesTable.runningBalance })
    .from(ledgerEntriesTable)
    .where(eq(ledgerEntriesTable.partyId, body.partyId))
    .orderBy(sql`date DESC, created_at DESC`)
    .limit(1);

  const prevBalance = parseFloat(lastEntry?.runningBalance || "0");
  const newBalance = body.type === "debit" ? prevBalance + body.amount : prevBalance - body.amount;

  const [entry] = await db
    .insert(ledgerEntriesTable)
    .values({
      partyId: body.partyId,
      date: body.date,
      type: body.type,
      amount: String(body.amount),
      description: body.description,
      itemType: body.itemType ?? null,
      itemQtyKg: body.itemQtyKg != null ? String(body.itemQtyKg) : null,
      pricePerKg: body.pricePerKg != null ? String(body.pricePerKg) : null,
      runningBalance: String(newBalance),
    })
    .returning();

  // Update party balance
  await db
    .update(partiesTable)
    .set({
      balance: String(newBalance),
      lastTransactionDate: body.date,
    })
    .where(eq(partiesTable.id, body.partyId));

  // If this is a stock-affecting transaction, add a stock out entry
  if (body.type === "debit" && body.itemType && body.itemQtyKg) {
    await db.insert(stockTransactionsTable).values({
      itemType: body.itemType,
      txType: "out",
      quantityKg: String(body.itemQtyKg),
      date: body.date,
      note: `Sold to party (ledger entry #${entry.id})`,
    });
  }

  res.status(201).json({
    ...entry,
    amount: parseFloat(entry.amount),
    runningBalance: parseFloat(entry.runningBalance),
    itemQtyKg: entry.itemQtyKg ? parseFloat(entry.itemQtyKg) : null,
    pricePerKg: entry.pricePerKg ? parseFloat(entry.pricePerKg) : null,
    createdAt: entry.createdAt.toISOString(),
  });
});

// DELETE /ledger/:id
router.delete("/:id", async (req, res) => {
  const params = DeleteLedgerEntryParams.parse({ id: parseInt(req.params.id) });
  const [entry] = await db
    .select()
    .from(ledgerEntriesTable)
    .where(eq(ledgerEntriesTable.id, params.id));

  if (!entry) return res.status(404).json({ error: "Not found" });

  await db.delete(ledgerEntriesTable).where(eq(ledgerEntriesTable.id, params.id));

  // Recalculate party balance from scratch
  const allEntries = await db
    .select()
    .from(ledgerEntriesTable)
    .where(eq(ledgerEntriesTable.partyId, entry.partyId))
    .orderBy(ledgerEntriesTable.date, ledgerEntriesTable.createdAt);

  let runningBal = 0;
  for (const e of allEntries) {
    runningBal = e.type === "debit" ? runningBal + parseFloat(e.amount) : runningBal - parseFloat(e.amount);
    await db.update(ledgerEntriesTable).set({ runningBalance: String(runningBal) }).where(eq(ledgerEntriesTable.id, e.id));
  }

  await db.update(partiesTable).set({ balance: String(runningBal) }).where(eq(partiesTable.id, entry.partyId));

  return res.json({ success: true, message: "Deleted" });
});

export default router;
