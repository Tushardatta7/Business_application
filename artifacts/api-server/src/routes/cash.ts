import { Router } from "express";
import { db } from "@workspace/db";
import { cashEntriesTable, partiesTable, ledgerEntriesTable } from "@workspace/db";
import { eq, and, gte, lte, sql, ilike } from "drizzle-orm";
import {
  ListCashEntriesQueryParams,
  CreateCashEntryBody,
  GetCashEntryParams,
  UpdateCashEntryBody,
  UpdateCashEntryParams,
  DeleteCashEntryParams,
  GetDailyCashSummaryQueryParams,
} from "@workspace/api-zod";

const router = Router();

// Find or create a party by name; returns partyId
async function resolveParty(name: string): Promise<number> {
  const trimmed = name.trim();
  const [existing] = await db
    .select({ id: partiesTable.id })
    .from(partiesTable)
    .where(ilike(partiesTable.name, trimmed))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(partiesTable)
    .values({ name: trimmed, type: "customer", balance: "0" })
    .returning({ id: partiesTable.id });
  return created.id;
}

// Create a ledger entry and update party balance
async function addLedgerEntry(
  partyId: number,
  date: string,
  type: "debit" | "credit",
  amount: number,
  description: string,
) {
  const [last] = await db
    .select({ runningBalance: ledgerEntriesTable.runningBalance })
    .from(ledgerEntriesTable)
    .where(eq(ledgerEntriesTable.partyId, partyId))
    .orderBy(sql`date DESC, created_at DESC`)
    .limit(1);

  const prev = parseFloat(last?.runningBalance || "0");
  const newBal = type === "debit" ? prev + amount : prev - amount;

  await db.insert(ledgerEntriesTable).values({
    partyId,
    date,
    type,
    amount: String(amount),
    description,
    runningBalance: String(newBal),
  });

  await db.update(partiesTable).set({
    balance: String(newBal),
    lastTransactionDate: date,
  }).where(eq(partiesTable.id, partyId));
}

// GET /cash
router.get("/", async (req, res) => {
  const query = ListCashEntriesQueryParams.parse(req.query);
  const conditions = [];
  if (query.date) conditions.push(eq(cashEntriesTable.date, query.date));
  if (query.startDate) conditions.push(gte(cashEntriesTable.date, query.startDate));
  if (query.endDate) conditions.push(lte(cashEntriesTable.date, query.endDate));
  if (query.type) conditions.push(eq(cashEntriesTable.type, query.type));
  if (query.category) conditions.push(eq(cashEntriesTable.category, query.category));

  const entries = await db
    .select({
      id: cashEntriesTable.id,
      date: cashEntriesTable.date,
      amount: cashEntriesTable.amount,
      type: cashEntriesTable.type,
      category: cashEntriesTable.category,
      partyId: cashEntriesTable.partyId,
      partyName: partiesTable.name,
      buyerName: cashEntriesTable.buyerName,
      saleItems: cashEntriesTable.saleItems,
      note: cashEntriesTable.note,
      createdAt: cashEntriesTable.createdAt,
    })
    .from(cashEntriesTable)
    .leftJoin(partiesTable, eq(cashEntriesTable.partyId, partiesTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${cashEntriesTable.date} DESC, ${cashEntriesTable.createdAt} DESC`);

  res.json(entries.map((e) => ({
    ...e,
    amount: parseFloat(e.amount),
    createdAt: e.createdAt.toISOString(),
  })));
});

// POST /cash
router.post("/", async (req, res) => {
  const body = CreateCashEntryBody.parse(req.body);

  // Auto-resolve party from buyerName
  let partyId = body.partyId ?? null;
  if (body.buyerName?.trim()) {
    partyId = await resolveParty(body.buyerName.trim());
  }

  const [entry] = await db
    .insert(cashEntriesTable)
    .values({
      date: body.date,
      amount: String(body.amount),
      type: body.type,
      category: body.category,
      partyId,
      buyerName: body.buyerName ?? null,
      saleItems: body.saleItems ?? null,
      note: body.note ?? null,
    })
    .returning();

  // Auto-create ledger entry for party
  if (partyId) {
    const isSale = body.category === "তাল মিসরি বিক্রয়" || (body.saleItems && body.saleItems !== "[]");
    let ledgerType: "debit" | "credit";
    let desc: string;

    if (body.type === "expense" && isSale) {
      // বিক্রয়: goods left factory, party owes you → DEBIT
      ledgerType = "debit";
      desc = `বিক্রয়: ${body.category}${body.note ? " — " + body.note : ""}`;
    } else if (body.type === "income") {
      // জমা: party paid you cash → CREDIT
      ledgerType = "credit";
      desc = `নগদ জমা: ${body.category}${body.note ? " — " + body.note : ""}`;
    } else {
      // খরচ (non-sale): you paid this party → CREDIT
      ledgerType = "credit";
      desc = `পরিশোধ: ${body.category}${body.note ? " — " + body.note : ""}`;
    }

    await addLedgerEntry(partyId, body.date, ledgerType, body.amount, desc);
  }

  const partyName = partyId
    ? (await db.select({ name: partiesTable.name }).from(partiesTable).where(eq(partiesTable.id, partyId)))[0]?.name ?? null
    : null;

  res.status(201).json({
    ...entry,
    amount: parseFloat(entry.amount),
    partyName,
    createdAt: entry.createdAt.toISOString(),
  });
});

// GET /cash/summary/daily
router.get("/summary/daily", async (req, res) => {
  const query = GetDailyCashSummaryQueryParams.parse(req.query);
  const date = query.date || new Date().toISOString().split("T")[0];

  const [dayEntries] = await db
    .select({
      totalIncome: sql<string>`COALESCE(SUM(CASE WHEN type = 'income' THEN amount::numeric ELSE 0 END), 0)`,
      totalExpense: sql<string>`COALESCE(SUM(CASE WHEN type = 'expense' THEN amount::numeric ELSE 0 END), 0)`,
    })
    .from(cashEntriesTable)
    .where(eq(cashEntriesTable.date, date));

  const [previousBalance] = await db
    .select({
      balance: sql<string>`COALESCE(SUM(CASE WHEN type = 'income' THEN amount::numeric ELSE -amount::numeric END), 0)`,
    })
    .from(cashEntriesTable)
    .where(sql`date < ${date}`);

  const openingBalance = parseFloat(previousBalance?.balance || "0");
  const totalIncome = parseFloat(dayEntries?.totalIncome || "0");
  const totalExpense = parseFloat(dayEntries?.totalExpense || "0");

  res.json({
    date,
    openingBalance,
    totalIncome,
    totalExpense,
    closingBalance: openingBalance + totalIncome - totalExpense,
  });
});

// GET /cash/:id
router.get("/:id", async (req, res) => {
  const params = GetCashEntryParams.parse({ id: parseInt(req.params.id) });
  const [entry] = await db
    .select({
      id: cashEntriesTable.id,
      date: cashEntriesTable.date,
      amount: cashEntriesTable.amount,
      type: cashEntriesTable.type,
      category: cashEntriesTable.category,
      partyId: cashEntriesTable.partyId,
      partyName: partiesTable.name,
      buyerName: cashEntriesTable.buyerName,
      saleItems: cashEntriesTable.saleItems,
      note: cashEntriesTable.note,
      createdAt: cashEntriesTable.createdAt,
    })
    .from(cashEntriesTable)
    .leftJoin(partiesTable, eq(cashEntriesTable.partyId, partiesTable.id))
    .where(eq(cashEntriesTable.id, params.id));

  if (!entry) return res.status(404).json({ error: "Not found" });

  return res.json({
    ...entry,
    amount: parseFloat(entry.amount),
    createdAt: entry.createdAt.toISOString(),
  });
});

// PUT /cash/:id
router.put("/:id", async (req, res) => {
  const params = UpdateCashEntryParams.parse({ id: parseInt(req.params.id) });
  const body = UpdateCashEntryBody.parse(req.body);

  // Auto-resolve party from buyerName
  let partyId = body.partyId ?? null;
  if (body.buyerName?.trim()) {
    partyId = await resolveParty(body.buyerName.trim());
  }

  const [entry] = await db
    .update(cashEntriesTable)
    .set({
      date: body.date,
      amount: String(body.amount),
      type: body.type,
      category: body.category,
      partyId,
      buyerName: body.buyerName ?? null,
      saleItems: body.saleItems ?? null,
      note: body.note ?? null,
    })
    .where(eq(cashEntriesTable.id, params.id))
    .returning();

  if (!entry) return res.status(404).json({ error: "Not found" });

  const partyName = partyId
    ? (await db.select({ name: partiesTable.name }).from(partiesTable).where(eq(partiesTable.id, partyId)))[0]?.name ?? null
    : null;

  return res.json({
    ...entry,
    amount: parseFloat(entry.amount),
    partyName,
    createdAt: entry.createdAt.toISOString(),
  });
});

// DELETE /cash/:id
router.delete("/:id", async (req, res) => {
  const params = DeleteCashEntryParams.parse({ id: parseInt(req.params.id) });
  await db.delete(cashEntriesTable).where(eq(cashEntriesTable.id, params.id));
  res.json({ success: true, message: "Deleted" });
});

export default router;
