import { createInsertSchema } from "drizzle-zod";
import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export type SummaryConcept = {
  id: string;
  title: string;
  summary: string;
  mastery?: number;
};

export const summaryBankTable = pgTable("summary_bank", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  userId: text("user_id").notNull(),
  lessonId: text("lesson_id").notNull(),
  lessonTitle: text("lesson_title").notNull(),
  subject: text("subject").notNull(),
  summary: text("summary").notNull(),
  concepts: jsonb("concepts").$type<SummaryConcept[]>().notNull(),
  groundingQuery: text("grounding_query").notNull().default(""),
  groundingNodeIds: jsonb("grounding_node_ids").$type<string[]>().notNull().default([]),
  officialStamp: text("official_stamp").notNull().default("TAWJEEH.ED · OFFICIAL"),
  logo: text("logo").notNull().default("tawjeeh-owl-transparent.png"),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSummaryBankSchema = createInsertSchema(summaryBankTable).omit({
  completedAt: true,
  createdAt: true,
});

export type InsertSummaryBank = z.infer<typeof insertSummaryBankSchema>;
export type SummaryBankItem = typeof summaryBankTable.$inferSelect;