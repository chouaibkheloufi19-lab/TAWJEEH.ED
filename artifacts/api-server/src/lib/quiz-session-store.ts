import { and, desc, eq, isNull, or } from "drizzle-orm";
import {
  db,
  quizSessionsTable,
  type InsertQuizSession,
  type QuizSession,
} from "@workspace/db";

export type QuizWeek = {
  year: number;
  number: number;
  key: string;
  start: string;
};

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getQuizWeek(dateValue = new Date()): QuizWeek {
  const date = new Date(Date.UTC(
    dateValue.getUTCFullYear(),
    dateValue.getUTCMonth(),
    dateValue.getUTCDate(),
  ));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const number = Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  const monday = new Date(dateValue);
  const mondayDay = monday.getUTCDay() || 7;
  monday.setUTCDate(monday.getUTCDate() - mondayDay + 1);
  return {
    year,
    number,
    key: `${year}-W${String(number).padStart(2, "0")}`,
    start: formatDate(monday),
  };
}

export async function findQuizSessionByCacheKey(cacheKey: string): Promise<QuizSession | null> {
  const [row] = await db
    .select()
    .from(quizSessionsTable)
    .where(eq(quizSessionsTable.cacheKey, cacheKey))
    .limit(1);
  return row ?? null;
}

export async function findQuizSessionById(
  quizId: string,
  userId?: string,
): Promise<QuizSession | null> {
  const ownerScope = userId
    ? or(isNull(quizSessionsTable.ownerUserId), eq(quizSessionsTable.ownerUserId, userId))
    : isNull(quizSessionsTable.ownerUserId);
  const [row] = await db
    .select()
    .from(quizSessionsTable)
    .where(and(eq(quizSessionsTable.quizId, quizId), ownerScope))
    .limit(1);
  return row ?? null;
}

export async function insertQuizSession(input: InsertQuizSession): Promise<QuizSession> {
  const [created] = await db
    .insert(quizSessionsTable)
    .values(input)
    .onConflictDoNothing({ target: quizSessionsTable.cacheKey })
    .returning();
  if (created) return created;
  const existing = await findQuizSessionByCacheKey(input.cacheKey);
  if (!existing) throw new Error("Quiz session could not be created or loaded");
  return existing;
}

export async function listRecentPrivateQuizSessions(userId: string): Promise<QuizSession[]> {
  return db
    .select()
    .from(quizSessionsTable)
    .where(and(
      eq(quizSessionsTable.quizType, "CUSTOM_PRIVATE"),
      eq(quizSessionsTable.ownerUserId, userId),
    ))
    .orderBy(desc(quizSessionsTable.createdAt))
    .limit(20);
}