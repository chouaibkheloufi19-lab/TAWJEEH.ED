import { createInsertSchema } from "drizzle-zod";
import { index, integer, pgTable, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const errorBankTable = pgTable(
  "error_bank",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    userId: text("user_id").notNull(),
    lessonId: text("lesson_id").notNull(),
    lessonTitle: text("lesson_title").notNull(),
    sectionId: text("section_id").notNull(),
    conceptId: text("concept_id").notNull(),
    conceptTitle: text("concept_title").notNull(),
    latestErrorTag: text("latest_error_tag").notNull().default(""),
    attemptsCount: integer("attempts_count").notNull().default(0),
    errorsCount: integer("errors_count").notNull().default(0),
    errorPercentage: real("error_percentage").notNull().default(0),
    deepLink: text("deep_link").notNull(),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("error_bank_user_section_unique").on(table.userId, table.lessonId, table.sectionId),
    index("error_bank_user_error_lookup").on(table.userId, table.errorPercentage),
  ],
);

export const insertErrorBankSchema = createInsertSchema(errorBankTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertErrorBank = z.infer<typeof insertErrorBankSchema>;
export type ErrorBank = typeof errorBankTable.$inferSelect;