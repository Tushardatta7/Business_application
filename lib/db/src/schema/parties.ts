import { pgTable, serial, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const partiesTable = pgTable("parties", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameBn: text("name_bn"),
  phone: text("phone"),
  address: text("address"),
  type: text("type").notNull().default("customer"), // 'customer' | 'supplier' | 'both' | 'loan_given' | 'loan_taken' | 'other'
  balance: numeric("balance", { precision: 12, scale: 2 }).notNull().default("0"),
  lastTransactionDate: text("last_transaction_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPartySchema = createInsertSchema(partiesTable).omit({ id: true, createdAt: true, balance: true });
export type InsertParty = z.infer<typeof insertPartySchema>;
export type Party = typeof partiesTable.$inferSelect;
