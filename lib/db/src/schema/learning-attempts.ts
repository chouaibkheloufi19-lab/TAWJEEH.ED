import { createInsertSchema } from "drizzle-zod";
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const learningAttemptsTable = pgTable("learning_attempts", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  userId: text("user_id").notNull(),
  lessonId: text("lesson_id").notNull(),
  lessonTitle: text("lesson_title").notNull(),
  conceptId: text("concept_id").notNull(),
  conceptTitle: text("concept_title").notNull(),
  errorTag: text("error_tag").notNull(),
  isCorrect: boolean("is_correct").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLearningAttemptSchema = createInsertSchema(learningAttemptsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertLearningAttempt = z.infer<typeof insertLearningAttemptSchema>;
export type LearningAttempt = typeof learningAttemptsTable.$inferSelect;