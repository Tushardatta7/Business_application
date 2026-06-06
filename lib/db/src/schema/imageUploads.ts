import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const imageUploadsTable = pgTable("image_uploads", {
  id: serial("id").primaryKey(),
  originalFilename: text("original_filename").notNull(),
  storagePath: text("storage_path").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  // queued | processing | ready | failed
  status: text("status").notNull().default("queued"),
  // JSON: array of extracted row objects
  extractedRowsJson: text("extracted_rows_json"),
  // JSON: page_summary from AI response
  pageSummaryJson: text("page_summary_json"),
  failureReason: text("failure_reason"),
  committedAt: timestamp("committed_at"),
  // JSON: array of committed cash_entry IDs
  committedEntryIds: text("committed_entry_ids"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ImageUpload = typeof imageUploadsTable.$inferSelect;
export type InsertImageUpload = typeof imageUploadsTable.$inferInsert;