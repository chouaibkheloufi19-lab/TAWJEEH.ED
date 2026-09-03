import { and, desc, eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import type { Request } from "express";
import {
  db,
  learningAttemptsTable,
  quizAttemptsTable,
  studyScheduleTable,
  summaryBankTable,
} from "@workspace/db";

export const EMERGENCY_REMEDIATION_LABEL = "غرفة إنعاش مستعجلة";
export const ERROR_RATE_THRESHOLD = 0.5;
export const OFFICIAL_SUMMARY_STAMP = "TAWJEEH.ED · OFFICIAL";
export const OFFICIAL_SUMMARY_LOGO = "tawjeeh-owl-transparent.png";

export type SummaryConcept = {
  id: string;
  title: string;
  summary: string;
  mastery?: number;
};

export type SummaryBankItem = {
  id: number;
  lesson_id: string;
  lesson_title: string;
  subject: string;
  summary: string;
  concepts: SummaryConcept[];
  completed_at: string;
  official_stamp: string;
  logo: string;
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
  missed: boolean;
  penalty_type: string | null;
  volume_multiplier: number;
};

export type ErrorBankItem = {
  id: number;
  lesson_id: string;
  lesson_title: string;
  concept_id: string;
  concept_title: string;
  error_tag: string;
  summary_id: number | null;
  created_at: string;
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
    official_stamp: row.officialStamp,
    logo: row.logo,
  };
}

export function toScheduleEntry(row: typeof studyScheduleTable.$inferSelect): ScheduleEntry {
  const today = new Date().toISOString().slice(0, 10);
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
    missed: !row.completed && row.scheduledDate < today,
    penalty_type: row.penaltyType,
    volume_multiplier: row.volumeMultiplier,
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

export async function listErrorBank(userId: string) {
  const [attempts, summaries] = await Promise.all([
    db
      .select()
      .from(learningAttemptsTable)
      .where(and(eq(learningAttemptsTable.userId, userId), eq(learningAttemptsTable.isCorrect, false)))
      .orderBy(desc(learningAttemptsTable.createdAt))
      .limit(100),
    db
      .select({ id: summaryBankTable.id, lessonId: summaryBankTable.lessonId })
      .from(summaryBankTable)
      .where(eq(summaryBankTable.userId, userId)),
  ]);
  const summaryIds = new Map(summaries.map((summary) => [summary.lessonId, summary.id]));
  return {
    errors: attempts.map((attempt) => ({
      id: attempt.id,
      lesson_id: attempt.lessonId,
      lesson_title: attempt.lessonTitle,
      concept_id: attempt.conceptId,
      concept_title: attempt.conceptTitle,
      error_tag: attempt.errorTag,
      summary_id: summaryIds.get(attempt.lessonId) ?? null,
      created_at: attempt.createdAt.toISOString(),
    })),
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
            officialStamp: OFFICIAL_SUMMARY_STAMP,
            logo: OFFICIAL_SUMMARY_LOGO,
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
            officialStamp: OFFICIAL_SUMMARY_STAMP,
            logo: OFFICIAL_SUMMARY_LOGO,
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
          penaltyType: "error_remediation",
          volumeMultiplier: 1,
          completed: false,
        })
        .returning()
    )[0];

    if (row) remediation = toScheduleEntry(row);
  }

  return { attempt_id: attempt.id, metric, remediation };
}

function addDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isTheorySession(row: typeof studyScheduleTable.$inferSelect) {
  const value = `${row.kind} ${row.title}`.toLowerCase();
  return value.includes("theory") || value.includes("نظر") || value.includes("مكتسب") || value.includes("فهم");
}

function isPracticalSession(row: typeof studyScheduleTable.$inferSelect) {
  const value = `${row.kind} ${row.title}`.toLowerCase();
  return value.includes("practical") || value.includes("تطبيق") || value.includes("تمرين") || value.includes("exercise");
}

function nextWeekendDates(today: string) {
  const start = new Date(`${today}T12:00:00Z`);
  const dates: string[] = [];
  for (let offset = 1; offset <= 7 && dates.length < 2; offset += 1) {
    const candidate = new Date(start);
    candidate.setUTCDate(candidate.getUTCDate() + offset);
    if (candidate.getUTCDay() === 5 || candidate.getUTCDay() === 6) {
      dates.push(candidate.toISOString().slice(0, 10));
    }
  }
  return dates;
}

function scheduleSeedDates(start = new Date().toISOString().slice(0, 10)) {
  return Array.from({ length: 10 }, (_, index) => addDays(start, index));
}

const scheduleSeedRuns = new Map<string, Promise<void>>();

async function ensureBaseLearningSchedule(userId: string) {
  const active = scheduleSeedRuns.get(userId);
  if (active) return active;

  const run = (async () => {
    const existing = await db
      .select({ id: studyScheduleTable.id })
      .from(studyScheduleTable)
      .where(eq(studyScheduleTable.userId, userId))
      .limit(1);
    if (existing.length > 0) return;

    const slots = [
      {
        time: "08:30",
        duration: "25–40 دقيقة",
        title: "فهم الفكرة الأساسية",
        subject: "العلوم الفيزيائية",
        kind: "مكتسبات نظرية",
        lessonId: "newton-motion",
        conceptId: "definition",
      },
      {
        time: "12:00",
        duration: "حتى حل تمرينين",
        title: "تطبيق موجّه",
        subject: "العلوم الفيزيائية",
        kind: "حصة تطبيقية",
        lessonId: "newton-motion",
        conceptId: "practice",
      },
      {
        time: "17:30",
        duration: "حتى إجابة التحقق",
        title: "تثبيت واسترجاع",
        subject: "العلوم الفيزيائية",
        kind: "مراجعة تطبيقية",
        lessonId: "newton-motion",
        conceptId: "recap",
      },
    ] as const;

    await db.insert(studyScheduleTable).values(
      scheduleSeedDates().flatMap((scheduledDate) =>
        slots.map((slot) => ({
          userId,
          scheduledDate,
          time: slot.time,
          duration: slot.duration,
          title: slot.title,
          subject: slot.subject,
          kind: slot.kind,
          remediationLabel: null,
          lessonId: slot.lessonId,
          conceptId: slot.conceptId,
          sourceSummaryId: null,
          penaltyKey: null,
          penaltyType: null,
          volumeMultiplier: 1,
          completed: false,
        })),
      ),
    );
  })();
  scheduleSeedRuns.set(userId, run);
  await run.finally(() => scheduleSeedRuns.delete(userId));
}

async function addWeekendVolumePenalty(
  userId: string,
  penaltyKey: string,
  source: typeof studyScheduleTable.$inferSelect | null,
  reason: string,
) {
  const existing = await db
    .select({ id: studyScheduleTable.id })
    .from(studyScheduleTable)
    .where(and(eq(studyScheduleTable.userId, userId), eq(studyScheduleTable.penaltyKey, penaltyKey)))
    .limit(1);
  if (existing.length > 0) return;

  const dates = nextWeekendDates(new Date().toISOString().slice(0, 10));
  await db.insert(studyScheduleTable).values(
    dates.map((scheduledDate, index) => ({
      userId,
      scheduledDate,
      time: index === 0 ? "18:00" : "10:00",
      duration: "حجم مضاعف · 45 دقيقة",
      title: source
        ? `تمرين نهاية الأسبوع المضاعف · ${source.title}`
        : "كويز نهاية الأسبوع المضاعف · نقاط اليوم",
      subject: source?.subject ?? "العلوم الفيزيائية",
      kind: "تمرين نهاية الأسبوع",
      remediationLabel: reason,
      lessonId: source?.lessonId ?? null,
      conceptId: source?.conceptId ?? null,
      sourceSummaryId: null,
      penaltyKey,
      penaltyType: "weekend_volume_double",
      volumeMultiplier: 2,
      completed: false,
    })),
  );
}

async function applyMissedTheoryPenalty(
  userId: string,
  source: typeof studyScheduleTable.$inferSelect,
  rows: (typeof studyScheduleTable.$inferSelect)[],
) {
  const penaltyKey = `missed-theory:${source.id}`;
  if (source.penaltyKey) return;
  const next = rows
    .filter((row) => !row.completed && !row.penaltyKey)
    .filter((row) => `${row.scheduledDate}T${row.time}` > `${source.scheduledDate}T${source.time}`)
    .sort((a, b) => `${a.scheduledDate}T${a.time}`.localeCompare(`${b.scheduledDate}T${b.time}`))[0];

  await db
    .update(studyScheduleTable)
    .set({ penaltyKey, penaltyType: "missed_theory" })
    .where(eq(studyScheduleTable.id, source.id));
  source.penaltyKey = penaltyKey;
  source.penaltyType = "missed_theory";

  if (!next) {
    await db.insert(studyScheduleTable).values({
      userId,
      scheduledDate: addDays(source.scheduledDate, 1),
      time: source.time,
      duration: source.duration,
      title: source.title,
      subject: source.subject,
      kind: source.kind,
      remediationLabel: "تعويض حصة نظرية فائتة",
      lessonId: source.lessonId,
      conceptId: source.conceptId,
      sourceSummaryId: source.sourceSummaryId,
      penaltyKey,
      penaltyType: "missed_theory",
      volumeMultiplier: 1,
      completed: false,
    });
    return;
  }

  const lastDate = rows.reduce((latest, row) => row.scheduledDate > latest ? row.scheduledDate : latest, next.scheduledDate);
  await db.insert(studyScheduleTable).values({
    userId,
    scheduledDate: addDays(lastDate, 1),
    time: next.time,
    duration: next.duration,
    title: next.title,
    subject: next.subject,
    kind: next.kind,
    remediationLabel: "تأجيل بعد حصة نظرية فائتة",
    lessonId: next.lessonId,
    conceptId: next.conceptId,
    sourceSummaryId: next.sourceSummaryId,
    penaltyKey: `${penaltyKey}:shifted`,
    penaltyType: "shifted_after_missed_theory",
    volumeMultiplier: next.volumeMultiplier,
    completed: false,
  });
  await db
    .update(studyScheduleTable)
    .set({
      title: source.title,
      subject: source.subject,
      kind: source.kind,
      duration: source.duration,
      remediationLabel: "تعويض حصة نظرية فائتة",
      lessonId: source.lessonId,
      conceptId: source.conceptId,
      sourceSummaryId: source.sourceSummaryId,
      penaltyKey,
      penaltyType: "missed_theory",
      volumeMultiplier: 1,
      completed: false,
    })
    .where(eq(studyScheduleTable.id, next.id));
  next.penaltyKey = penaltyKey;
  next.penaltyType = "missed_theory";
}

async function applySchedulePenalties(userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select()
    .from(studyScheduleTable)
    .where(eq(studyScheduleTable.userId, userId))
    .orderBy(studyScheduleTable.scheduledDate, studyScheduleTable.time);

  for (const row of rows) {
    if (row.completed || row.scheduledDate >= today || row.penaltyKey) continue;
    if (isTheorySession(row)) {
      await applyMissedTheoryPenalty(userId, row, rows);
      continue;
    }
    if (isPracticalSession(row)) {
      await db
        .update(studyScheduleTable)
        .set({ penaltyKey: `missed-practical:${row.id}`, penaltyType: "missed_practical" })
        .where(eq(studyScheduleTable.id, row.id));
      await addWeekendVolumePenalty(
        userId,
        `missed-practical:${row.id}`,
        row,
        "مضاعفة حجم نهاية الأسبوع بسبب حصة تطبيقية فائتة",
      );
    }
  }

  const quizAttempts = await db
    .select()
    .from(quizAttemptsTable)
    .where(eq(quizAttemptsTable.userId, userId));
  const historicDates = new Set(
    rows
      .filter((row) => row.scheduledDate < today && row.penaltyType === null)
      .map((row) => row.scheduledDate),
  );
  for (const scheduledDate of historicDates) {
    const points = quizAttempts
      .filter((attempt) => attempt.completedAt.toISOString().slice(0, 10) === scheduledDate)
      .reduce((total, attempt) => total + attempt.pointsEarned, 0);
    if (points >= 70) continue;
    await addWeekendVolumePenalty(
      userId,
      `daily-quiz-points:${scheduledDate}`,
      null,
      "مضاعفة حجم نهاية الأسبوع بسبب عدم بلوغ ٧٠ نقطة يومية",
    );
  }
}

const schedulePenaltyRuns = new Map<string, Promise<void>>();

async function ensureSchedulePenalties(userId: string) {
  const active = schedulePenaltyRuns.get(userId);
  if (active) return active;
  const run = applySchedulePenalties(userId).finally(() => schedulePenaltyRuns.delete(userId));
  schedulePenaltyRuns.set(userId, run);
  return run;
}

export async function listLearningSchedule(userId: string) {
  await ensureBaseLearningSchedule(userId);
  await ensureSchedulePenalties(userId);
  const rows = await db
    .select()
    .from(studyScheduleTable)
    .where(eq(studyScheduleTable.userId, userId))
    .orderBy(studyScheduleTable.scheduledDate, studyScheduleTable.time);
  return rows.map(toScheduleEntry);
}

export async function updateLearningSchedule(userId: string, scheduleId: number, completed: boolean) {
  await ensureBaseLearningSchedule(userId);
  const [row] = await db
    .update(studyScheduleTable)
    .set({ completed })
    .where(and(eq(studyScheduleTable.id, scheduleId), eq(studyScheduleTable.userId, userId)))
    .returning();
  return row ? toScheduleEntry(row) : null;
}

export async function recordQuizAttempt(
  userId: string,
  input: {
    quizId: string;
    quizTitle: string;
    score: number;
    correct: number;
    total: number;
    pointsEarned: number;
    isHighDifficulty: boolean;
    passed: boolean;
  },
) {
  const [row] = await db
    .insert(quizAttemptsTable)
    .values({
      userId,
      quizId: input.quizId,
      quizTitle: input.quizTitle,
      score: input.score,
      correct: input.correct,
      total: input.total,
      pointsEarned: input.pointsEarned,
      isHighDifficulty: input.isHighDifficulty,
      passed: input.passed,
    })
    .returning();
  if (!row) throw new Error("Quiz attempt could not be saved");
  return row;
}

export async function listQuizAttempts(userId: string) {
  const rows = await db
    .select()
    .from(quizAttemptsTable)
    .where(eq(quizAttemptsTable.userId, userId))
    .orderBy(desc(quizAttemptsTable.completedAt))
    .limit(50);
  return {
    attempts: rows.map((row) => ({
      id: row.id,
      quiz_id: row.quizId,
      quiz_title: row.quizTitle,
      score: row.score,
      correct: row.correct,
      total: row.total,
      points_earned: row.pointsEarned,
      is_high_difficulty: row.isHighDifficulty,
      passed: row.passed,
      completed_at: row.completedAt.toISOString(),
    })),
  };
}