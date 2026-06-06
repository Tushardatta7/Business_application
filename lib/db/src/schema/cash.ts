import { pgTable, serial, text, numeric, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const cashEntriesTable = pgTable("cash_entries", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  type: text("type").notNull(), // 'income' | 'expense'
  category: text("category").notNull(),
  partyId: integer("party_id"),
  buyerName: text("buyer_name"),
  saleItems: text("sale_items"), // JSON string: [{product, price, qty}]
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCashEntrySchema = createInsertSchema(cashEntriesTable).omit({ id: true, createdAt: true });
export type InsertCashEntry = z.infer<typeof insertCashEntrySchema>;
export type CashEntry = typeof cashEntriesTable.$inferSelect;
