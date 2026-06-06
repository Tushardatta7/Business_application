import { Router } from "express";
import { db } from "@workspace/db";
import {
  cashEntriesTable,
  partiesTable,
  stockTransactionsTable,
  stockRatesTable,
  CAPITAL_INJECTION_CATEGORY,
  DRAWING_CATEGORY,
} from "@workspace/db";
import { sql, lte, eq, inArray, and } from "drizzle-orm";
import { GetBalanceSheetQueryParams } from "@workspace/api-zod";

const router = Router();

const ITEM_TYPES = ["sugar", "grade1", "grade2", "byproduct", "sala", "gas"] as const;

// GET /balance-sheet?asOf=YYYY-MM-DD
router.get("/", async (req, res) => {
  const { asOf } = GetBalanceSheetQueryParams.parse({ asOf: req.query.asOf });
  const cutoff = asOf || new Date().toISOString().split("T")[0]!;

  // ── Cash & Bank: cumulative (income − expense) up to cutoff, excluding equity categories
  const equityCategories = [CAPITAL_INJECTION_CATEGORY, DRAWING_CATEGORY];
  const [cashRow] = await db
    .select({
      net: sql<string>`COALESCE(SUM(CASE WHEN type = 'income' THEN amount::numeric ELSE -amount::numeric END), 0)`,
    })
    .from(cashEntriesTable)
    .where(lte(cashEntriesTable.date, cutoff));

  // Equity: capital injections (income, category=মূলধন) − drawings (expense, category=উত্তোলন)
  const [capitalInRow] = await db
    .select({
      total: sql<string>`COALESCE(SUM(amount::numeric), 0)`,
    })
    .from(cashEntriesTable)
    .where(
      and(
        lte(cashEntriesTable.date, cutoff),
        eq(cashEntriesTable.type, "income"),
        eq(cashEntriesTable.category, CAPITAL_INJECTION_CATEGORY),
      ),
    );
  const [drawingRow] = await db
    .select({
      total: sql<string>`COALESCE(SUM(amount::numeric), 0)`,
    })
    .from(cashEntriesTable)
    .where(
      and(
        lte(cashEntriesTable.date, cutoff),
        eq(cashEntriesTable.type, "expense"),
        eq(cashEntriesTable.category, DRAWING_CATEGORY),
      ),
    );

  // Retained earnings = cumulative (income − expense) excluding equity-flagged categories
  const [retainedRow] = await db
    .select({
      total: sql<string>`COALESCE(SUM(CASE WHEN type = 'income' THEN amount::numeric ELSE -amount::numeric END), 0)`,
    })
    .from(cashEntriesTable)
    .where(
      and(
        lte(cashEntriesTable.date, cutoff),
        sql`${cashEntriesTable.category} NOT IN (${sql.raw(
          equityCategories.map((c) => `'${c.replace(/'/g, "''")}'`).join(", "),
        )})`,
      ),
    );

  // ── Inventory: kg × rate per item
  const rates = await db.select().from(stockRatesTable);
  const ratesByItem: Record<string, number> = {};
  for (const r of rates) ratesByItem[r.itemType] = parseFloat(r.ratePerKg);

  const inventory: Array<{ itemType: string; quantityKg: number; ratePerKg: number; value: number }> = [];
  for (const item of ITEM_TYPES) {
    const [row] = await db
      .select({
        net: sql<string>`COALESCE(SUM(CASE WHEN tx_type = 'in' THEN quantity_kg::numeric ELSE -quantity_kg::numeric END), 0)`,
      })
      .from(stockTransactionsTable)
      .where(and(eq(stockTransactionsTable.itemType, item), lte(stockTransactionsTable.date, cutoff)));
    const qty = parseFloat(row?.net || "0");
    const rate = ratesByItem[item] || 0;
    inventory.push({ itemType: item, quantityKg: qty, ratePerKg: rate, value: qty * rate });
  }
  const inventoryTotal = inventory.reduce((s, i) => s + i.value, 0);

  // ── Party balances grouped by type and sign
  // Convention: positive balance = they owe us (asset); negative = we owe them (liability)
  const allParties = await db.select().from(partiesTable);

  let receivables = 0; // customers + both, balance > 0
  let advancesPaid = 0; // suppliers, balance > 0 (we paid before delivery)
  let advancesReceived = 0; // customers, balance < 0 (they paid before delivery)
  let payablesSupplier = 0; // suppliers + both, balance < 0
  let payablesOther = 0; // 'other' party type, balance < 0
  let receivablesOther = 0; // 'other' party type, balance > 0
  let loanGiven = 0; // 'loan_given' parties — outstanding loan asset
  let loanTaken = 0; // 'loan_taken' parties — outstanding loan liability

  for (const p of allParties) {
    const bal = parseFloat(p.balance);
    if (p.type === "loan_given") {
      if (bal > 0) loanGiven += bal;
      // negative balance on loan_given would be unusual; treat as loan repaid + advance
    } else if (p.type === "loan_taken") {
      if (bal < 0) loanTaken += -bal;
    } else if (p.type === "supplier") {
      if (bal > 0) advancesPaid += bal;
      else if (bal < 0) payablesSupplier += -bal;
    } else if (p.type === "customer" || p.type === "both") {
      if (bal > 0) receivables += bal;
      else if (bal < 0) advancesReceived += -bal;
    } else if (p.type === "other") {
      if (bal > 0) receivablesOther += bal;
      else if (bal < 0) payablesOther += -bal;
    }
  }

  const cashAndBank = parseFloat(cashRow?.net || "0");
  const capital = parseFloat(capitalInRow?.total || "0") - parseFloat(drawingRow?.total || "0");
  const retainedEarnings = parseFloat(retainedRow?.total || "0");

  const totalAssets =
    cashAndBank + inventoryTotal + receivables + advancesPaid + loanGiven + receivablesOther;
  const totalLiabilities = payablesSupplier + payablesOther + advancesReceived + loanTaken;
  const totalEquity = capital + retainedEarnings;

  return res.json({
    asOf: cutoff,
    assets: {
      cashAndBank,
      inventory,
      inventoryTotal,
      receivables,
      advancesPaid,
      loanGiven,
      receivablesOther,
      total: totalAssets,
    },
    liabilities: {
      payablesSupplier,
      payablesOther,
      advancesReceived,
      loanTaken,
      total: totalLiabilities,
    },
    equity: {
      capital,
      retainedEarnings,
      total: totalEquity,
    },
    // Plug check — should be ~0 if books are consistent
    imbalance: totalAssets - totalLiabilities - totalEquity,
  });
});

export default router;
