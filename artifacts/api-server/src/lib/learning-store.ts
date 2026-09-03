import { and, desc, eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import type { Request } from "express";
import {
  db,
  learningAttemptsTable,
  studyScheduleTable,
  summaryBankTable,
} from "@workspace/db";

export const EMERGENCY_REMEDIATION_LABEL = "غرفة إنعاش مستعجلة";
export const ERROR_RATE_THRESHOLD = 0.5;

export type SummaryConcept = {
  id: string;
  title: string;
  summary: string;
};

export type SummaryBankItem = {
  id: number;
  lesson_id: string;
  lesson_title: string;
  subject: string;
  summary: string;
  concepts: SummaryConcept[];
  completed_at: string;
};

export type ConceptMetric = {
  lesson_id: string;
  lesson_title: string;
  concept_id: string;
  concept_title: string;
  attempts: number;
  errors_count: number;
  error_rate: number;
  last_error_tag: string;
};

export type ScheduleEntry = {
  id: number;
  scheduled_date: string;
  time: string;
  duration: string;
  title: string;
  subject: string;
  kind: string;
  remediation_label: string | null;
  lesson_id: string | null;
  concept_id: string | null;
  completed: boolean;
};

export function getUserId(req: Request): string | null {
  const auth = getAuth(req);
  if (typeof auth?.userId === "string" && auth.userId) return auth.userId;
  return typeof auth?.sessionClaims?.userId === "string" ? auth.sessionClaims.userId : null;
}

export function toSummaryBankItem(row: typeof summaryBankTable.$inferSelect): SummaryBankItem {
  return {
    id: row.id,
    lesson_id: row.lessonId,
    lesson_title: row.lessonTitle,
    subject: row.subject,
    summary: row.summary,
    concepts: row.concepts,
    completed_at: row.completedAt.toISOString(),
  };
}

export function toScheduleEntry(row: typeof studyScheduleTable.$inferSelect): ScheduleEntry {
  return {
    id: row.id,
    scheduled_date: row.scheduledDate,
    time: row.time,
    duration: row.duration,
    title: row.title,
    subject: row.subject,
    kind: row.kind,
    remediation_label: row.remediationLabel,
    lesson_id: row.lessonId,
    concept_id: row.conceptId,
    completed: row.completed,
  };
}

export async function listSummaryBank(userId: string) {
  const [summaries, attempts] = await Promise.all([
    db
      .select()
      .from(summaryBankTable)
      .where(eq(summaryBankTable.userId, userId))
      .orderBy(desc(summaryBankTable.completedAt)),
    db
      .select()
      .from(learningAttemptsTable)
      .where(eq(learningAttemptsTable.userId, userId))
      .orderBy(desc(learningAttemptsTable.createdAt)),
  ]);

  const metrics = new Map<string, ConceptMetric>();
  for (const attempt of attempts) {
    const key = `${attempt.lessonId}:${attempt.conceptId}`;
    const current = metrics.get(key) ?? {
      lesson_id: attempt.lessonId,
      lesson_title: attempt.lessonTitle,
      concept_id: attempt.conceptId,
      concept_title: attempt.conceptTitle,
      attempts: 0,
      errors_count: 0,
      error_rate: 0,
      last_error_tag: "",
    };
    current.attempts += 1;
    if (!attempt.isCorrect) {
      current.errors_count += 1;
      if (!current.last_error_tag) current.last_error_tag = attempt.errorTag;
    }
    current.error_rate = Number((current.errors_count / current.attempts).toFixed(2));
    metrics.set(key, current);
  }

  return {
    summaries: summaries.map(toSummaryBankItem),
    metrics: Array.from(metrics.values()),
  };
}

export async function saveLessonSummary(
  userId: string,
  input: {
    lessonId: string;
    lessonTitle: string;
    subject: string;
    summary: string;
    concepts: SummaryConcept[];
  },
) {
  const existing = await db
    .select()
    .from(summaryBankTable)
    .where(and(eq(summaryBankTable.userId, userId), eq(summaryBankTable.lessonId, input.lessonId)))
    .limit(1);

  const row = existing[0]
    ? (
        await db
          .update(summaryBankTable)
          .set({
            lessonTitle: input.lessonTitle,
            subject: input.subject,
            summary: input.summary,
            concepts: input.concepts,
            completedAt: new Date(),
          })
          .where(eq(summaryBankTable.id, existing[0].id))
          .returning()
      )[0]
    : (
        await db
          .insert(summaryBankTable)
          .values({
            userId,
            lessonId: input.lessonId,
            lessonTitle: input.lessonTitle,
            subject: input.subject,
            summary: input.summary,
            concepts: input.concepts,
          })
          .returning()
      )[0];

  if (!row) throw new Error("Lesson summary could not be saved");
  return toSummaryBankItem(row);
}

export async function recordLearningAttempt(
  userId: string,
  input: {
    lessonId: string;
    lessonTitle: string;
    conceptId: string;
    conceptTitle: string;
    errorTag: string;
    isCorrect: boolean;
  },
) {
  const [attempt] = await db
    .insert(learningAttemptsTable)
    .values({
      userId,
      lessonId: input.lessonId,
      lessonTitle: input.lessonTitle,
      conceptId: input.conceptId,
      conceptTitle: input.conceptTitle,
      errorTag: input.errorTag,
      isCorrect: input.isCorrect,
    })
    .returning();

  if (!attempt) throw new Error("Learning attempt could not be saved");
  const { metrics } = await listSummaryBank(userId);
  const metric = metrics.find(
    (item) => item.lesson_id === input.lessonId && item.concept_id === input.conceptId,
  );
  if (!metric) throw new Error("Learning attempt metric could not be calculated");

  let remediation: ScheduleEntry | null = null;
  if (!input.isCorrect && metric.error_rate > ERROR_RATE_THRESHOLD) {
    const current = await db
      .select()
      .from(studyScheduleTable)
      .where(
        and(
          eq(studyScheduleTable.userId, userId),
          eq(studyScheduleTable.lessonId, input.lessonId),
          eq(studyScheduleTable.conceptId, input.conceptId),
          eq(studyScheduleTable.completed, false),
        ),
      )
      .limit(1);

    const summary = await db
      .select({ id: summaryBankTable.id })
      .from(summaryBankTable)
      .where(and(eq(summaryBankTable.userId, userId), eq(summaryBankTable.lessonId, input.lessonId)))
      .limit(1);

    const row = current[0] ?? (
      await db
        .insert(studyScheduleTable)
        .values({
          userId,
          scheduledDate: new Date().toISOString().slice(0, 10),
          time: "18:30",
          duration: "25 دقيقة",
          title: `مراجعة تأهيلية: ${input.conceptTitle}`,
          subject: "العلوم الفيزيائية",
          kind: EMERGENCY_REMEDIATION_LABEL,
          remediationLabel: EMERGENCY_REMEDIATION_LABEL,
          lessonId: input.lessonId,
          conceptId: input.conceptId,
          sourceSummaryId: summary[0]?.id ?? null,
          completed: false,
        })
        .returning()
    )[0];

    if (row) remediation = toScheduleEntry(row);
  }

  return { attempt_id: attempt.id, metric, remediation };
}

export async function listLearningSchedule(userId: string) {
  const rows = await db
    .select()
    .from(studyScheduleTable)
    .where(eq(studyScheduleTable.userId, userId))
    .orderBy(studyScheduleTable.scheduledDate, studyScheduleTable.time);
  return rows.map(toScheduleEntry);
}

export async function updateLearningSchedule(userId: string, scheduleId: number, completed: boolean) {
  const [row] = await db
    .update(studyScheduleTable)
    .set({ completed })
    .where(and(eq(studyScheduleTable.id, scheduleId), eq(studyScheduleTable.userId, userId)))
    .returning();
  return row ? toScheduleEntry(row) : null;
}