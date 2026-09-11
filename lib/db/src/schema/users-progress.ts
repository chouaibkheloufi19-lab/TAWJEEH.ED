import { createInsertSchema } from "drizzle-zod";
import { date, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export type LearningPathNode = {
  id: string;
  title: string;
  status: "locked" | "available" | "in_progress" | "completed";
  progress?: number;
};

export const usersProgressTable = pgTable(
  "users_progress",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    userId: text("user_id").notNull(),
    progressDate: date("progress_date", { mode: "string" }).notNull(),
    dailyPoints: integer("daily_points").notNull().default(0),
    topicMasteryPercentage: real("topic_mastery_percentage").notNull().default(0),
    overallLearningPathNodes: jsonb("overall_learning_path_nodes")
      .$type<LearningPathNode[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("users_progress_user_date_unique").on(table.userId, table.progressDate),
    index("users_progress_user_date_lookup").on(table.userId, table.progressDate),
  ],
);

export const insertUsersProgressSchema = createInsertSchema(usersProgressTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertUsersProgress = z.infer<typeof insertUsersProgressSchema>;
export type UsersProgress = typeof usersProgressTable.$inferSelect;