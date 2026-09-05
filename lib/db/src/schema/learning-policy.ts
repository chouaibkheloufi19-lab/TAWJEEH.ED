import { integer, pgTable, real, timestamp } from "drizzle-orm/pg-core";

export const learningPolicyTable = pgTable("learning_policy", {
  id: integer("id").primaryKey().default(1),
  emergencyErrorRate: real("emergency_error_rate").notNull().default(0.5),
  dailyPointsTarget: integer("daily_points_target").notNull().default(70),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LearningPolicy = typeof learningPolicyTable.$inferSelect;