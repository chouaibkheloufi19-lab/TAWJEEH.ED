import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { quizSessionsTable } from "./quiz-sessions";

export const quizAttemptsTable = pgTable("quiz_attempts", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  userId: text("user_id").notNull(),
  quizSessionId: integer("quiz_session_id").references(() => quizSessionsTable.id, {
    onDelete: "set null",
  }),
  quizId: text("quiz_id").notNull(),
  quizTitle: text("quiz_title").notNull(),
  score: integer("score").notNull(),
  correct: integer("correct").notNull(),
  total: integer("total").notNull(),
  pointsEarned: integer("points_earned").notNull(),
  isHighDifficulty: boolean("is_high_difficulty").notNull().default(false),
  passed: boolean("passed").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type QuizAttempt = typeof quizAttemptsTable.$inferSelect;