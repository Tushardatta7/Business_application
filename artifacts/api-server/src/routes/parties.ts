import { Router } from "express";
import { db } from "@workspace/db";
import { partiesTable, ledgerEntriesTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import {
  CreatePartyBody,
  GetPartyParams,
  UpdatePartyBody,
  UpdatePartyParams,
  DeletePartyParams,
} from "@workspace/api-zod";

const router = Router();

// GET /parties/aging  (must be before /:id)
router.get("/aging", async (req, res) => {
  const parties = await db
    .select()
    .from(partiesTable)
    .where(sql`balance::numeric != 0`);

  const today = new Date();
  const result = parties.map((p) => {
    const balance = parseFloat(p.balance);
    const lastDate = p.lastTransactionDate ? new Date(p.lastTransactionDate) : null;
    const daysSince = lastDate ? Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)) : null;

    let bucket = "current";
    if (daysSince !== null) {
      if (daysSince > 90) bucket = "overdue_90plus";
      else if (daysSince > 60) bucket = "overdue_60";
      else if (daysSince > 30) bucket = "overdue_30";
    }

    return {
      partyId: p.id,
      partyName: p.name,
      balance,
      daysSinceLastPayment: daysSince,
      bucket,
    };
  });

  res.json(result);
});

// GET /parties
router.get("/", async (req, res) => {
  const parties = await db.select().from(partiesTable).orderBy(desc(partiesTable.createdAt));
  res.json(parties.map((p) => ({
    ...p,
    balance: parseFloat(p.balance),
    createdAt: p.createdAt.toISOString(),
  })));
});

// POST /parties
router.post("/", async (req, res) => {
  const body = CreatePartyBody.parse(req.body);
  const [party] = await db
    .insert(partiesTable)
    .values({
      name: body.name,
      nameBn: body.nameBn ?? null,
      phone: body.phone ?? null,
      address: body.address ?? null,
      type: body.type,
      balance: "0",
    })
    .returning();

  res.status(201).json({
    ...party,
    balance: parseFloat(party.balance),
    createdAt: party.createdAt.toISOString(),
  });
});

// GET /parties/:id
router.get("/:id", async (req, res) => {
  const params = GetPartyParams.parse({ id: parseInt(req.params.id) });
  const [party] = await db.select().from(partiesTable).where(eq(partiesTable.id, params.id));
  if (!party) return res.status(404).json({ error: "Not found" });

  const entries = await db
    .select()
    .from(ledgerEntriesTable)
    .where(eq(ledgerEntriesTable.partyId, params.id))
    .orderBy(ledgerEntriesTable.date, ledgerEntriesTable.createdAt);

  return res.json({
    ...party,
    balance: parseFloat(party.balance),
    createdAt: party.createdAt.toISOString(),
    entries: entries.map((e) => ({
      ...e,
      amount: parseFloat(e.amount),
      runningBalance: parseFloat(e.runningBalance),
      itemQtyKg: e.itemQtyKg ? parseFloat(e.itemQtyKg) : null,
      pricePerKg: e.pricePerKg ? parseFloat(e.pricePerKg) : null,
      createdAt: e.createdAt.toISOString(),
    })),
  });
});

// PUT /parties/:id
router.put("/:id", async (req, res) => {
  const params = UpdatePartyParams.parse({ id: parseInt(req.params.id) });
  const body = UpdatePartyBody.parse(req.body);

  const [party] = await db
    .update(partiesTable)
    .set({
      name: body.name,
      nameBn: body.nameBn ?? null,
      phone: body.phone ?? null,
      address: body.address ?? null,
      type: body.type,
    })
    .where(eq(partiesTable.id, params.id))
    .returning();

  if (!party) return res.status(404).json({ error: "Not found" });

  return res.json({
    ...party,
    balance: parseFloat(party.balance),
    createdAt: party.createdAt.toISOString(),
  });
});

// DELETE /parties/:id
router.delete("/:id", async (req, res) => {
  const params = DeletePartyParams.parse({ id: parseInt(req.params.id) });
  await db.delete(partiesTable).where(eq(partiesTable.id, params.id));
  res.json({ success: true, message: "Deleted" });
});

export default router;
