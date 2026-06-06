import { pgTable, serial, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Per-item cost-per-kg used to value inventory on the balance sheet.
// Item types match stock_transactions.item_type: 'sugar' | 'grade1' | 'grade2' | 'byproduct' | 'sala' | 'gas'
export const stockRatesTable = pgTable("stock_rates", {
  id: serial("id").primaryKey(),
  itemType: text("item_type").notNull().unique(),
  ratePerKg: numeric("rate_per_kg", { precision: 12, scale: 2 }).notNull().default("0"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertStockRateSchema = createInsertSchema(stockRatesTable).omit({ id: true, updatedAt: true });
export type InsertStockRate = z.infer<typeof insertStockRateSchema>;
export type StockRate = typeof stockRatesTable.$inferSelect;

// Cash-entry categories that the balance sheet treats as equity transactions
// rather than revenue/expense. Income with category=CAPITAL_INJECTION → Capital;
// Expense with category=DRAWING → Capital reduction.
export const CAPITAL_INJECTION_CATEGORY = "মূলধন";
export const DRAWING_CATEGORY = "উত্তোলন";
