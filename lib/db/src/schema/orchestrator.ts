import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const learningStateTable = pgTable("learning_state", {
  userId: text("user_id").primaryKey(),
  timezone: text("timezone").notNull().default("Africa/Algiers"),
  locale: text("locale").notNull().default("ar-DZ"),
  curriculum: jsonb("curriculum").$type<Record<string, unknown>>().notNull().default({}),
  phase: text("phase").notNull().default("ONBOARDING"),
  diagnostic: jsonb("diagnostic").$type<Record<string, unknown>>().notNull().default({}),
  agentAvailability: jsonb("agent_availability")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  learning: jsonb("learning").$type<Record<string, unknown>>().notNull().default({}),
  preferences: jsonb("preferences").$type<Record<string, unknown>>().notNull().default({}),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const agentEventsTable = pgTable(
  "agent_events",
  {
    eventId: text("event_id").primaryKey(),
    userId: text("user_id").notNull(),
    eventType: text("event_type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    actor: jsonb("actor").$type<Record<string, unknown>>().notNull(),
    sessionId: text("session_id"),
    correlationId: text("correlation_id"),
    causationId: text("causation_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    phase: text("phase").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    routing: jsonb("routing").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("agent_events_user_idempotency_unique").on(table.userId, table.idempotencyKey),
    index("agent_events_user_time_lookup").on(table.userId, table.occurredAt),
  ],
);

export const agentEventConsumersTable = pgTable(
  "agent_event_consumers",
  {
    consumerName: text("consumer_name").notNull(),
    userId: text("user_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("agent_event_consumers_unique").on(
      table.consumerName,
      table.userId,
      table.idempotencyKey,
    ),
  ],
);

export const scheduleEntriesTable = pgTable(
  "schedule_entries",
  {
    entryId: text("entry_id").primaryKey(),
    scheduleId: text("schedule_id").notNull(),
    userId: text("user_id").notNull(),
    weekKey: text("week_key").notNull(),
    sequence: integer("sequence").notNull(),
    agent: text("agent").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    subject: text("subject").notNull(),
    conceptIds: jsonb("concept_ids").$type<string[]>().notNull().default([]),
    plannedStart: timestamp("planned_start", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    masteredAt: timestamp("mastered_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    mastery: jsonb("mastery").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("PENDING"),
    originalEntryId: text("original_entry_id"),
    shift: jsonb("shift").$type<Record<string, unknown> | null>(),
    volumeMultiplier: integer("volume_multiplier").notNull().default(1),
    notification: jsonb("notification")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({ enabled: true, lastSentAt: null }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("schedule_entries_user_start_lookup").on(table.userId, table.plannedStart),
    index("schedule_entries_user_status_lookup").on(table.userId, table.status),
  ],
);

export const mistakesTable = pgTable(
  "mistakes",
  {
    mistakeId: text("mistake_id").primaryKey(),
    userId: text("user_id").notNull(),
    conceptId: text("concept_id").notNull(),
    skillId: text("skill_id").notNull(),
    source: jsonb("source").$type<Record<string, unknown>>().notNull(),
    classification: jsonb("classification").$type<Record<string, unknown>>().notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull(),
    status: text("status").notNull().default("OPEN"),
    occurrences: integer("occurrences").notNull().default(1),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
    masteryAttempts: integer("mastery_attempts").notNull().default(0),
    requiredConsecutiveCorrect: integer("required_consecutive_correct").notNull().default(2),
    stackId: text("stack_id"),
    stackRank: integer("stack_rank"),
    includedInNextPractice: boolean("included_in_next_practice").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("mistakes_user_status_lookup").on(table.userId, table.status),
    index("mistakes_user_concept_lookup").on(table.userId, table.conceptId),
  ],
);

export const notificationOutboxTable = pgTable(
  "notification_outbox",
  {
    notificationId: text("notification_id").primaryKey(),
    userId: text("user_id").notNull(),
    eventId: text("event_id").notNull(),
    entryId: text("entry_id"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    locale: text("locale").notNull().default("ar-DZ"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("notification_outbox_event_unique").on(table.eventId, table.entryId),
  ],
);

export const insertLearningStateSchema = createInsertSchema(learningStateTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertAgentEventSchema = createInsertSchema(agentEventsTable).omit({
  createdAt: true,
});
export const insertScheduleEntrySchema = createInsertSchema(scheduleEntriesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertMistakeSchema = createInsertSchema(mistakesTable).omit({
  updatedAt: true,
});
export const insertNotificationOutboxSchema = createInsertSchema(notificationOutboxTable).omit({
  createdAt: true,
});

export type LearningStateRow = typeof learningStateTable.$inferSelect;
export type AgentEventRow = typeof agentEventsTable.$inferSelect;
export type ScheduleEntryRow = typeof scheduleEntriesTable.$inferSelect;
export type MistakeRow = typeof mistakesTable.$inferSelect;
export type NotificationOutboxRow = typeof notificationOutboxTable.$inferSelect;
export type InsertLearningState = z.infer<typeof insertLearningStateSchema>;
export type InsertAgentEvent = z.infer<typeof insertAgentEventSchema>;
export type InsertScheduleEntry = z.infer<typeof insertScheduleEntrySchema>;
export type InsertMistake = z.infer<typeof insertMistakeSchema>;
export type InsertNotificationOutbox = z.infer<typeof insertNotificationOutboxSchema>;