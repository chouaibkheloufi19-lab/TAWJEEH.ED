import { boolean, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const quizTypeEnum = pgEnum("quiz_type", [
  "WEEKLY_GLOBAL",
  "UNIT_WEEKLY",
  "CUSTOM_PRIVATE",
]);

export type QuizType = (typeof quizTypeEnum.enumValues)[number];

export type StoredQuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctOption: string;
  conceptId: string;
  conceptTitle: string;
  sourceNodeIds: string[];
};

export const quizSessionsTable = pgTable(
  "quiz_sessions",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    quizId: text("quiz_id").notNull(),
    cacheKey: text("cache_key").notNull(),
    quizType: quizTypeEnum("quiz_type").notNull(),
    ownerUserId: text("owner_user_id"),
    title: text("title").notNull(),
    subject: text("subject").notNull(),
    description: text("description").notNull(),
    duration: text("duration").notNull(),
    points: integer("points").notNull(),
    isHighDifficulty: boolean("is_high_difficulty").notNull().default(false),
    unitId: text("unit_id"),
    lessonIds: jsonb("lesson_ids").$type<string[]>().notNull().default([]),
    scoreThreshold: integer("score_threshold").notNull().default(70),
    mode: text("mode").notNull().default("standard"),
    exerciseDensity: integer("exercise_density").notNull().default(1),
    reducePassiveExplanation: boolean("reduce_passive_explanation").notNull().default(false),
    linkedConcepts: jsonb("linked_concepts").$type<string[]>().notNull().default([]),
    questions: jsonb("questions").$type<StoredQuizQuestion[]>().notNull(),
    groundingNodeIds: jsonb("grounding_node_ids").$type<string[]>().notNull().default([]),
    weekYear: integer("week_year"),
    weekNumber: integer("week_number"),
    weekStart: date("week_start"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("quiz_sessions_quiz_id_unique").on(table.quizId),
    uniqueIndex("quiz_sessions_cache_key_unique").on(table.cacheKey),
    index("quiz_sessions_week_lookup").on(table.quizType, table.unitId, table.weekYear, table.weekNumber),
    index("quiz_sessions_owner_lookup").on(table.ownerUserId, table.createdAt),
  ],
);

export type QuizSession = typeof quizSessionsTable.$inferSelect;
export type InsertQuizSession = typeof quizSessionsTable.$inferInsert;