import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const profileSummaryExportsTable = pgTable("profile_summary_exports", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  userId: text("user_id").notNull(),
  objectPath: text("object_path").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull().default("application/pdf"),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProfileSummaryExport = typeof profileSummaryExportsTable.$inferSelect;