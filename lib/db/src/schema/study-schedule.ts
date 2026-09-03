import { createInsertSchema } from "drizzle-zod";
import { boolean, date, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const studyScheduleTable = pgTable("study_schedule", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  userId: text("user_id").notNull(),
  scheduledDate: date("scheduled_date", { mode: "string" }).notNull(),
  time: text("time").notNull(),
  duration: text("duration").notNull(),
  title: text("title").notNull(),
  subject: text("subject").notNull(),
  kind: text("kind").notNull(),
  remediationLabel: text("remediation_label"),
  lessonId: text("lesson_id"),
  conceptId: text("concept_id"),
  sourceSummaryId: integer("source_summary_id"),
  penaltyKey: text("penalty_key"),
  penaltyType: text("penalty_type"),
  volumeMultiplier: integer("volume_multiplier").notNull().default(1),
  completed: boolean("completed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertStudyScheduleSchema = createInsertSchema(studyScheduleTable).omit({
  createdAt: true,
});

export type InsertStudySchedule = z.infer<typeof insertStudyScheduleSchema>;
export type StudyScheduleItem = typeof studyScheduleTable.$inferSelect;