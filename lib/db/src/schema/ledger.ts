import { pgTable, serial, text, numeric, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partiesTable } from "./parties";

export const ledgerEntriesTable = pgTable("ledger_entries", {
  id: serial("id").primaryKey(),
  partyId: integer("party_id").notNull().references(() => partiesTable.id, { onDelete: "cascade" }),
  date: text("date").notNull(),
  type: text("type").notNull(), // 'debit' | 'credit'
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  description: text("description").notNull(),
  itemType: text("item_type"), // 'grade1' | 'grade2' | 'byproduct' | null
  itemQtyKg: numeric("item_qty_kg", { precision: 10, scale: 3 }),
  pricePerKg: numeric("price_per_kg", { precision: 10, scale: 2 }),
  runningBalance: numeric("running_balance", { precision: 12, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLedgerEntrySchema = createInsertSchema(ledgerEntriesTable).omit({ id: true, createdAt: true, runningBalance: true });
export type InsertLedgerEntry = z.infer<typeof insertLedgerEntrySchema>;
export type LedgerEntry = typeof ledgerEntriesTable.$inferSelect;
