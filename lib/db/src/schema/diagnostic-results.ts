import { createInsertSchema } from "drizzle-zod";
import { check, date, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

export type DiagnosticAnswer = {
  questionId: string;
  answer: string;
  correct?: boolean;
};

export const diagnosticResultsTable = pgTable(
  "diagnostic_results",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    userId: text("user_id").notNull(),
    assessmentDay: integer("assessment_day").notNull(),
    assessmentDate: date("assessment_date", { mode: "string" }).notNull(),
    subject: text("subject").notNull(),
    topic: text("topic").notNull(),
    score: integer("score").notNull(),
    totalQuestions: integer("total_questions").notNull(),
    masteryPercentage: real("mastery_percentage").notNull(),
    answers: jsonb("answers").$type<DiagnosticAnswer[]>().notNull().default([]),
    agentName: text("agent_name").notNull().default("Fahim Agent"),
    agentFeedback: text("agent_feedback").notNull().default(""),
    status: text("status").notNull().default("completed"),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("diagnostic_results_user_day_unique").on(table.userId, table.assessmentDay),
    index("diagnostic_results_user_date_lookup").on(table.userId, table.assessmentDate),
    check("diagnostic_results_day_range", sql`${table.assessmentDay} between 1 and 10`),
  ],
);

export const insertDiagnosticResultSchema = createInsertSchema(diagnosticResultsTable).omit({
  completedAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDiagnosticResult = z.infer<typeof insertDiagnosticResultSchema>;
export type DiagnosticResult = typeof diagnosticResultsTable.$inferSelect;