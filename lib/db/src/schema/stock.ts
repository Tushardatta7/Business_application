import { pgTable, serial, text, numeric, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { batchesTable } from "./batches";

export const stockTransactionsTable = pgTable("stock_transactions", {
  id: serial("id").primaryKey(),
  itemType: text("item_type").notNull(), // sugar | grade1 | grade2 | byproduct | sala | gas
  txType: text("tx_type").notNull(), // in | out
  quantityKg: numeric("quantity_kg", { precision: 10, scale: 3 }).notNull(),
  date: text("date").notNull(),
  note: text("note"),
  batchId: integer("batch_id").references(() => batchesTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertStockTransactionSchema = createInsertSchema(stockTransactionsTable).omit({ id: true, createdAt: true });
export type InsertStockTransaction = z.infer<typeof insertStockTransactionSchema>;
export type StockTransaction = typeof stockTransactionsTable.$inferSelect;
