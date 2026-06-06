import { pgTable, serial, text, numeric, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const batchesTable = pgTable("batches", {
  id: serial("id").primaryKey(),
  batchCode: text("batch_code").notNull().unique(),
  startDate: text("start_date").notNull(),
  expectedEndDate: text("expected_end_date").notNull(),
  sugarInputKg: numeric("sugar_input_kg", { precision: 10, scale: 3 }).notNull(),
  traysCount: integer("trays_count").notNull(),
  workerName: text("worker_name"),
  notes: text("notes"),
  status: text("status").notNull().default("boiling"), // boiling | curing | ready | harvested
  grade1OutputKg: numeric("grade1_output_kg", { precision: 10, scale: 3 }),
  grade2OutputKg: numeric("grade2_output_kg", { precision: 10, scale: 3 }),
  byproductKg: numeric("byproduct_kg", { precision: 10, scale: 3 }),
  lossKg: numeric("loss_kg", { precision: 10, scale: 3 }),
  yieldPercent: numeric("yield_percent", { precision: 5, scale: 2 }),
  harvestedAt: timestamp("harvested_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBatchSchema = createInsertSchema(batchesTable).omit({ id: true, createdAt: true, batchCode: true, expectedEndDate: true });
export type InsertBatch = z.infer<typeof insertBatchSchema>;
export type Batch = typeof batchesTable.$inferSelect;
