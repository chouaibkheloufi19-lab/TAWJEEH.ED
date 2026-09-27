import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, isNull } from "drizzle-orm";
import {
  agentEventsTable,
  db,
  learningStateTable,
  mistakesTable,
  notificationOutboxTable,
  scheduleEntriesTable,
  type AgentEventRow,
  type LearningStateRow,
  type ScheduleEntryRow,
} from "@workspace/db";
import {
  AGENT_IDS,
  AgentStateTransitionException,
  type AgentEvent,
  type AgentEventType,
  type AgentId,
  type AgentAvailability,
  type Curriculum,
  type DiagnosticState,
  type LearningPreferences,
  type LearningState,
  type ScheduleEntryKind,
  type ScheduleEntryStatus,
  agentLabel,
  availabilityForPhase,
  createInitialLearningState,
  isoWeekKey,
  primaryAgentForEntry,
  reduceLearningState,
  validateSessionAgent,
} from "./orchestrator-domain";

type DbTransaction = Parameters<typeof db.transaction>[0] extends (
  transaction: infer T,
) => unknown
  ? T
  : never;
type QueryClient = typeof db | DbTransaction;

export type ScheduleEntryView = {
  entry_id: string;
  schedule_id: string;
  week_key: string;
  sequence: number;
  agent: AgentId;
  kind: ScheduleEntryKind;
  title: string;
  subject: string;
  concept_ids: string[];
  planned_start: string;
  started_at: string | null;
  mastered_at: string | null;
  ends_at: string | null;
  mastery: Record<string, unknown>;
  status: ScheduleEntryStatus;
  original_entry_id: string | null;
  shift: Record<string, unknown> | null;
  volume_multiplier: number;
  notification: Record<string, unknown>;
};

export type AgentNetworkItem = {
  id: AgentId;
  name: string;
  availability: AgentAvailability;
  activation: string;
  responsibilities: string[];
};

type DiagnosticStateView = {
  started_at: string | null;
  diagnostic_day: number;
  total_days: 10;
  status: DiagnosticState["status"];
  faheem_enabled: boolean;
  mastered_days: number[];
  pending_days: number[];
};

type LearningStateView = {
  weekly_exercise_multiplier: number;
  weekly_multiplier_week: string;
  current_concept_ids: string[];
  mastery_threshold: number;
  daleel_activity_multiplier: number;
  exercises_intensity_multiplier: number;
};

export type OrchestratorSnapshot = {
  user_id: string;
  phase: LearningState["phase"];
  timezone: string;
  locale: string;
  curriculum: Curriculum;
  diagnostic: DiagnosticStateView;
  agent_availability: Record<AgentId, AgentAvailability>;
  agents: AgentNetworkItem[];
  learning: LearningStateView;
  preferences: LearningPreferences;
  version: number;
  updated_at: string;
  entries: ScheduleEntryView[];
};

const AGENT_NETWORK: Record<AgentId, Omit<AgentNetworkItem, "id" | "availability">> = {
  mascot: {
    name: "Blue Owl",
    activation: "ONBOARDING",
    responsibilities: ["welcome", "explain_product", "route_to_schedule"],
  },
  program: {
    name: "Schedule Agent",
    activation: "ALWAYS",
    responsibilities: [
      "allocate_time",
      "track_exams_assignments_holidays",
      "reschedule_sessions",
      "enforce_phase_gates",
    ],
  },
  faheem: {
    name: "Faheem",
    activation: "DIAGNOSTIC_DAYS_1_TO_10",
    responsibilities: ["baseline_assessment", "prerequisite_teaching", "mastery_evidence"],
  },
  daleel: {
    name: "Daliil",
    activation: "POST_DIAGNOSTIC",
    responsibilities: ["explanations", "concepts", "summary_generation"],
  },
  exercises: {
    name: "Exercises Agent",
    activation: "POST_DIAGNOSTIC",
    responsibilities: ["quiz_generation", "grading", "error_stacks", "problem_solving"],
  },
};

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function asDate(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AgentStateTransitionException(
      `Invalid timestamp ${value}`,
      "INVALID_EVENT",
    );
  }
  return date;
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function firstStudyTime(state: LearningState): string {
  const start = state.preferences.availableWindows
    .map((window) => window.start)
    .filter((value) => /^\d{2}:\d{2}$/.test(value))
    .sort()[0];
  return start ?? "18:00";
}

function plannedStart(state: LearningState, date: Date): Date {
  return asDate(`${dateOnly(date)}T${firstStudyTime(state)}:00Z`);
}

function stateFromRow(row: LearningStateRow): LearningState {
  const curriculum = recordValue(row.curriculum);
  const diagnostic = recordValue(row.diagnostic);
  const learning = recordValue(row.learning);
  const preferences = recordValue(row.preferences);
  const availability = recordValue(row.agentAvailability);
  const initial: LearningState = {
    userId: row.userId,
    timezone: row.timezone,
    locale: row.locale,
    curriculum: {
      country: typeof curriculum.country === "string" ? curriculum.country : "DZ",
      schoolYear:
        typeof curriculum.schoolYear === "string"
          ? curriculum.schoolYear
          : "third_secondary",
      subjects: stringArray(curriculum.subjects),
      examDate: typeof curriculum.examDate === "string" ? curriculum.examDate : "",
    },
    phase: row.phase as LearningState["phase"],
    diagnostic: {
      startedAt: typeof diagnostic.startedAt === "string" ? diagnostic.startedAt : null,
      diagnosticDay:
        typeof diagnostic.diagnosticDay === "number" ? diagnostic.diagnosticDay : 1,
      totalDays: 10,
      status: diagnostic.status === "COMPLETED" || diagnostic.status === "PAUSED"
        ? diagnostic.status
        : "ACTIVE",
      faheemEnabled: diagnostic.faheemEnabled === true,
      masteredDays: Array.isArray(diagnostic.masteredDays)
        ? diagnostic.masteredDays.filter((day): day is number => typeof day === "number")
        : [],
      pendingDays: Array.isArray(diagnostic.pendingDays)
        ? diagnostic.pendingDays.filter((day): day is number => typeof day === "number")
        : [],
    },
    agentAvailability: {
      mascot: availability.mascot === "ACTIVE" ? "ACTIVE" : "INACTIVE",
      program: "ACTIVE",
      faheem: availability.faheem === "ACTIVE" ? "ACTIVE" : "INACTIVE",
      daleel: availability.daleel === "ACTIVE" ? "ACTIVE" : "INACTIVE",
      exercises: availability.exercises === "ACTIVE" ? "ACTIVE" : "INACTIVE",
    },
    learning: {
      weeklyExerciseMultiplier:
        typeof learning.weeklyExerciseMultiplier === "number"
          ? learning.weeklyExerciseMultiplier
          : 1,
      weeklyMultiplierWeek:
        typeof learning.weeklyMultiplierWeek === "string" ? learning.weeklyMultiplierWeek : "",
      currentConceptIds: stringArray(learning.currentConceptIds),
      masteryThreshold:
        typeof learning.masteryThreshold === "number" ? learning.masteryThreshold : 0.7,
      daleelActivityMultiplier:
        typeof learning.daleelActivityMultiplier === "number"
          ? learning.daleelActivityMultiplier
          : 1,
      exercisesIntensityMultiplier:
        typeof learning.exercisesIntensityMultiplier === "number"
          ? learning.exercisesIntensityMultiplier
          : 1,
    },
    preferences: {
      availableWindows: Array.isArray(preferences.availableWindows)
        ? preferences.availableWindows.filter((item): item is LearningPreferences["availableWindows"][number] =>
            Boolean(item && typeof item === "object" && typeof (item as { weekday?: unknown }).weekday === "number"
              && typeof (item as { start?: unknown }).start === "string"
              && typeof (item as { end?: unknown }).end === "string"),
          )
        : [],
      pushNotifications: preferences.pushNotifications !== false,
      voiceTeaching: preferences.voiceTeaching !== false,
    },
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
  initial.agentAvailability = availabilityForPhase(initial.phase, initial.diagnostic);
  return initial;
}

function stateValues(state: LearningState) {
  return {
    userId: state.userId,
    timezone: state.timezone,
    locale: state.locale,
    curriculum: state.curriculum,
    phase: state.phase,
    diagnostic: state.diagnostic,
    agentAvailability: state.agentAvailability,
    learning: state.learning,
    preferences: state.preferences,
    version: state.version,
    updatedAt: asDate(state.updatedAt),
  };
}

function entryView(row: ScheduleEntryRow): ScheduleEntryView {
  return {
    entry_id: row.entryId,
    schedule_id: row.scheduleId,
    week_key: row.weekKey,
    sequence: row.sequence,
    agent: row.agent as AgentId,
    kind: row.kind as ScheduleEntryKind,
    title: row.title,
    subject: row.subject,
    concept_ids: row.conceptIds,
    planned_start: row.plannedStart.toISOString(),
    started_at: asIso(row.startedAt),
    mastered_at: asIso(row.masteredAt),
    ends_at: asIso(row.endsAt),
    mastery: row.mastery,
    status: row.status as ScheduleEntryStatus,
    original_entry_id: row.originalEntryId,
    shift: row.shift,
    volume_multiplier: row.volumeMultiplier,
    notification: row.notification,
  };
}

function snapshotFromRows(state: LearningState, entries: ScheduleEntryRow[]): OrchestratorSnapshot {
  return {
    user_id: state.userId,
    phase: state.phase,
    timezone: state.timezone,
    locale: state.locale,
    curriculum: state.curriculum,
    diagnostic: {
      started_at: state.diagnostic.startedAt,
      diagnostic_day: state.diagnostic.diagnosticDay,
      total_days: state.diagnostic.totalDays,
      status: state.diagnostic.status,
      faheem_enabled: state.diagnostic.faheemEnabled,
      mastered_days: state.diagnostic.masteredDays,
      pending_days: state.diagnostic.pendingDays,
    },
    agent_availability: state.agentAvailability,
    agents: AGENT_IDS.map((id) => ({
      id,
      name: AGENT_NETWORK[id].name,
      availability: state.agentAvailability[id],
      activation: AGENT_NETWORK[id].activation,
      responsibilities: AGENT_NETWORK[id].responsibilities,
    })),
    learning: {
      weekly_exercise_multiplier: state.learning.weeklyExerciseMultiplier,
      weekly_multiplier_week: state.learning.weeklyMultiplierWeek,
      current_concept_ids: state.learning.currentConceptIds,
      mastery_threshold: state.learning.masteryThreshold,
      daleel_activity_multiplier: state.learning.daleelActivityMultiplier,
      exercises_intensity_multiplier: state.learning.exercisesIntensityMultiplier,
    },
    preferences: state.preferences,
    version: state.version,
    updated_at: state.updatedAt,
    entries: entries.map(entryView),
  };
}

async function selectState(client: QueryClient, userId: string): Promise<LearningStateRow | undefined> {
  const rows = await client
    .select()
    .from(learningStateTable)
    .where(eq(learningStateTable.userId, userId))
    .limit(1);
  return rows[0];
}

async function ensureState(client: QueryClient, userId: string): Promise<LearningStateRow> {
  const existing = await selectState(client, userId);
  if (existing) return existing;
  const now = new Date();
  const initial = createInitialLearningState(userId, now.toISOString());
  const [created] = await client
    .insert(learningStateTable)
    .values(stateValues(initial))
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const raced = await selectState(client, userId);
  if (!raced) throw new Error("Learning state could not be initialized");
  return raced;
}

function baseEntryValues(
  state: LearningState,
  input: {
    scheduleId: string;
    sequence: number;
    agent: AgentId;
    kind: ScheduleEntryKind;
    title: string;
    subject: string;
    conceptIds: string[];
    plannedStart: Date;
    volumeMultiplier?: number;
    originalEntryId?: string | null;
    shift?: Record<string, unknown> | null;
  },
) {
  return {
    entryId: `ent_${randomUUID()}`,
    scheduleId: input.scheduleId,
    userId: state.userId,
    weekKey: isoWeekKey(dateOnly(input.plannedStart)),
    sequence: input.sequence,
    agent: input.agent,
    kind: input.kind,
    title: input.title,
    subject: input.subject,
    conceptIds: input.conceptIds,
    plannedStart: input.plannedStart,
    mastery: { required: state.learning.masteryThreshold, current: 0, status: "NOT_STARTED" },
    status: "PENDING" as const,
    originalEntryId: input.originalEntryId ?? null,
    shift: input.shift ?? null,
    volumeMultiplier: input.volumeMultiplier ?? 1,
    notification: { enabled: state.preferences.pushNotifications, lastSentAt: null },
  };
}

async function selectEntries(client: QueryClient, userId: string): Promise<ScheduleEntryRow[]> {
  return client
    .select()
    .from(scheduleEntriesTable)
    .where(eq(scheduleEntriesTable.userId, userId))
    .orderBy(asc(scheduleEntriesTable.plannedStart), asc(scheduleEntriesTable.sequence));
}

function firstPlanDate(entries: ScheduleEntryRow[], occurredAt: Date): Date {
  const last = entries.reduce<Date | null>(
    (latest, entry) => (!latest || entry.plannedStart > latest ? entry.plannedStart : latest),
    null,
  );
  return last ? addDays(last, 1) : occurredAt;
}

async function initializeDiagnosticSchedule(
  client: QueryClient,
  state: LearningState,
  occurredAt: Date,
): Promise<void> {
  const existing = await selectEntries(client, state.userId);
  if (existing.length > 0) return;
  const scheduleId = `sch_${randomUUID()}`;
  const start = firstPlanDate(existing, occurredAt);
  const subject = state.curriculum.subjects[0] ?? "العلوم الفيزيائية";
  const rows = Array.from({ length: 10 }, (_, index) => {
    const date = addDays(start, index);
    return baseEntryValues(state, {
      scheduleId,
      sequence: index + 1,
      agent: "faheem",
      kind: "DIAGNOSTIC",
      title: `التقييم التشخيصي · اليوم ${index + 1}`,
      subject,
      conceptIds: [`${subject}.diagnostic.day-${index + 1}`],
      plannedStart: plannedStart(state, date),
    });
  });
  await client.insert(scheduleEntriesTable).values(rows);
}

async function initializeCoreSchedule(
  client: QueryClient,
  state: LearningState,
  occurredAt: Date,
): Promise<void> {
  const entries = await selectEntries(client, state.userId);
  if (entries.some((entry) => entry.kind === "THEORY" || entry.kind === "PRACTICE")) return;
  const scheduleId = entries[0]?.scheduleId ?? `sch_${randomUUID()}`;
  const start = firstPlanDate(entries, occurredAt);
  const subject = state.curriculum.subjects[0] ?? "العلوم الفيزيائية";
  const count = Math.max(7, Math.ceil(14 * state.learning.exercisesIntensityMultiplier));
  const rows = Array.from({ length: count }, (_, index) => {
    const isTheory = index % 3 === 0;
    const kind: ScheduleEntryKind = isTheory ? "THEORY" : "PRACTICE";
    const agent: AgentId = isTheory ? "daleel" : "exercises";
    const date = addDays(start, index);
    return baseEntryValues(state, {
      scheduleId,
      sequence: entries.length + index + 1,
      agent,
      kind,
      title: isTheory
        ? `شرح المفهوم وتطبيقاته · ${index + 1}`
        : `تدريب موجّه ومكدس أخطاء · ${index + 1}`,
      subject,
      conceptIds: [`${subject}.core.${index + 1}`],
      plannedStart: plannedStart(state, date),
      volumeMultiplier: isTheory ? 1 : Math.max(1, Math.ceil(state.learning.exercisesIntensityMultiplier)),
    });
  });
  await client.insert(scheduleEntriesTable).values(rows);
}

function sessionIdFromEvent(event: AgentEvent): string {
  if (!event.sessionId) {
    throw new AgentStateTransitionException(
      `${event.eventType} requires a sessionId`,
      "INVALID_EVENT",
      { eventType: event.eventType },
    );
  }
  return event.sessionId;
}

async function findEntry(
  client: QueryClient,
  userId: string,
  entryId: string,
): Promise<ScheduleEntryRow> {
  const rows = await client
    .select()
    .from(scheduleEntriesTable)
    .where(and(eq(scheduleEntriesTable.userId, userId), eq(scheduleEntriesTable.entryId, entryId)))
    .limit(1);
  const entry = rows[0];
  if (!entry) {
    throw new AgentStateTransitionException(
      `Session ${entryId} was not found`,
      "INVALID_SESSION_STATE",
      { sessionId: entryId },
    );
  }
  return entry;
}

async function updateSession(
  client: QueryClient,
  state: LearningState,
  event: AgentEvent,
): Promise<void> {
  const entryId = sessionIdFromEvent(event);
  const entry = await findEntry(client, state.userId, entryId);
  validateSessionAgent(state, entry.agent as AgentId, entry.kind as ScheduleEntryKind);
  const now = asDate(event.occurredAt);

  switch (event.eventType) {
    case "SESSION_STARTED":
      if (entry.status !== "PENDING" && entry.status !== "PAUSED") {
        throw new AgentStateTransitionException(
          `Session ${entryId} cannot start from ${entry.status}`,
          "INVALID_SESSION_STATE",
          { sessionId: entryId, eventType: event.eventType },
        );
      }
      await client
        .update(scheduleEntriesTable)
        .set({ status: "ACTIVE", startedAt: entry.startedAt ?? now, updatedAt: now })
        .where(eq(scheduleEntriesTable.entryId, entryId));
      return;
    case "SESSION_HEARTBEAT":
      if (entry.status !== "ACTIVE") {
        throw new AgentStateTransitionException(
          `Session ${entryId} is not active`,
          "INVALID_SESSION_STATE",
          { sessionId: entryId, eventType: event.eventType },
        );
      }
      return;
    case "LEARNER_PAUSED":
      if (entry.status !== "ACTIVE") {
        throw new AgentStateTransitionException(
          `Session ${entryId} is not active`,
          "INVALID_SESSION_STATE",
          { sessionId: entryId, eventType: event.eventType },
        );
      }
      await client
        .update(scheduleEntriesTable)
        .set({ status: "PAUSED", updatedAt: now })
        .where(eq(scheduleEntriesTable.entryId, entryId));
      return;
    case "LEARNER_RESUMED":
      if (entry.status !== "PAUSED") {
        throw new AgentStateTransitionException(
          `Session ${entryId} is not paused`,
          "INVALID_SESSION_STATE",
          { sessionId: entryId, eventType: event.eventType },
        );
      }
      await client
        .update(scheduleEntriesTable)
        .set({ status: "ACTIVE", updatedAt: now })
        .where(eq(scheduleEntriesTable.entryId, entryId));
      return;
    case "MASTERY_EVIDENCE_SUBMITTED":
    case "SESSION_COMPLETED":
    case "DIAGNOSTIC_DAY_COMPLETED": {
      const rawScore = event.payload.mastery ?? event.payload.score;
      if (typeof rawScore !== "number" || rawScore < 0 || rawScore > 1) {
        throw new AgentStateTransitionException(
          "Session completion requires mastery between 0 and 1",
          "INVALID_EVENT",
          { sessionId: entryId, eventType: event.eventType },
        );
      }
      if (rawScore < state.learning.masteryThreshold) {
        throw new AgentStateTransitionException(
          `Session requires mastery ${state.learning.masteryThreshold}`,
          "GUARD_FAILED",
          { sessionId: entryId, eventType: event.eventType },
        );
      }
      await client
        .update(scheduleEntriesTable)
        .set({
          status: "MASTERED",
          masteredAt: now,
          endsAt: now,
          updatedAt: now,
          mastery: { required: state.learning.masteryThreshold, current: rawScore, status: "MASTERED" },
        })
        .where(eq(scheduleEntriesTable.entryId, entryId));
      return;
    }
    case "SESSION_SKIPPED":
      await client
        .update(scheduleEntriesTable)
        .set({ status: "SKIPPED", updatedAt: now })
        .where(eq(scheduleEntriesTable.entryId, entryId));
      return;
    case "SESSION_MISSED":
      await client
        .update(scheduleEntriesTable)
        .set({ status: "MISSED", updatedAt: now })
        .where(eq(scheduleEntriesTable.entryId, entryId));
      await compensateMissedTheory(client, state, entry, now, event.eventId);
      return;
    case "SESSION_OUTCOME_RECORDED":
    case "QUIZ_SUBMITTED": {
      const score = event.payload.mastery ?? event.payload.score;
      if (typeof score === "number" && score >= state.learning.masteryThreshold) {
        await client
          .update(scheduleEntriesTable)
          .set({
            status: "MASTERED",
            masteredAt: now,
            endsAt: now,
            updatedAt: now,
            mastery: { required: state.learning.masteryThreshold, current: score, status: "MASTERED" },
          })
          .where(eq(scheduleEntriesTable.entryId, entryId));
      } else {
        await client
          .update(scheduleEntriesTable)
          .set({
            status: "ACTIVE",
            updatedAt: now,
            mastery: {
              required: state.learning.masteryThreshold,
              current: typeof score === "number" ? score : 0,
              status: "IN_REMEDIATION",
            },
          })
          .where(eq(scheduleEntriesTable.entryId, entryId));
      }
      return;
    }
    default:
      return;
  }
}

async function compensateMissedTheory(
  client: QueryClient,
  state: LearningState,
  source: ScheduleEntryRow,
  now: Date,
  eventId: string,
): Promise<void> {
  if (source.kind !== "THEORY" || recordValue(source.shift).isCompensation === true) return;
  const future = await client
    .select()
    .from(scheduleEntriesTable)
    .where(and(
      eq(scheduleEntriesTable.userId, state.userId),
      gte(scheduleEntriesTable.plannedStart, source.plannedStart),
      isNull(scheduleEntriesTable.masteredAt),
    ))
    .orderBy(asc(scheduleEntriesTable.plannedStart), asc(scheduleEntriesTable.sequence));
  const displaced = future.find((entry) => entry.entryId !== source.entryId && entry.status !== "CANCELLED");
  if (!displaced) return;
  const shiftChainId = `shift_${randomUUID()}`;
  const shiftedStart = addDays(displaced.plannedStart, 1);
  await client
    .update(scheduleEntriesTable)
    .set({
      plannedStart: shiftedStart,
      weekKey: isoWeekKey(dateOnly(shiftedStart)),
      shift: {
        ...(displaced.shift ?? {}),
        isCompensation: false,
        reason: "MISSED_THEORY",
        sourceEntryId: source.entryId,
        shiftChainId,
        previousStart: displaced.plannedStart.toISOString(),
      },
      updatedAt: now,
    })
    .where(eq(scheduleEntriesTable.entryId, displaced.entryId));
  const compensation = baseEntryValues(state, {
    scheduleId: source.scheduleId,
    sequence: displaced.sequence,
    agent: "daleel",
    kind: "THEORY",
    title: source.title,
    subject: source.subject,
    conceptIds: source.conceptIds,
    plannedStart: displaced.plannedStart,
    originalEntryId: source.entryId,
    shift: {
      isCompensation: true,
      reason: "MISSED_THEORY",
      sourceEntryId: source.entryId,
      shiftChainId,
    },
  });
  await client.insert(scheduleEntriesTable).values(compensation);
  await client
    .update(scheduleEntriesTable)
    .set({
      shift: {
        ...(source.shift ?? {}),
        isCompensation: false,
        reason: "MISSED_THEORY",
        compensationEntryId: compensation.entryId,
        shiftChainId,
      },
      updatedAt: now,
    })
    .where(eq(scheduleEntriesTable.entryId, source.entryId));
  await client
    .insert(notificationOutboxTable)
    .values({
      notificationId: `note_${randomUUID()}`,
      userId: state.userId,
      eventId,
      entryId: compensation.entryId,
      title: "تعويض حصة نظرية فائتة",
      body: `أُعيد ترتيب حصة «${source.title}» في موعد جديد حتى لا يضيع المفهوم.`,
      locale: state.locale,
      scheduledFor: displaced.plannedStart,
    })
    .onConflictDoNothing();
}

async function addPracticeExpansion(
  client: QueryClient,
  state: LearningState,
  occurredAt: Date,
): Promise<void> {
  const entries = await selectEntries(client, state.userId);
  const source = entries.find((entry) => entry.status === "ACTIVE" || entry.status === "MISSED");
  const last = firstPlanDate(entries, asDate(occurredAt.toISOString()));
  const count = Math.min(6, Math.max(2, state.learning.weeklyExerciseMultiplier * 2));
  const scheduleId = entries[0]?.scheduleId ?? `sch_${randomUUID()}`;
  const subject = source?.subject ?? state.curriculum.subjects[0] ?? "العلوم الفيزيائية";
  const rows = Array.from({ length: count }, (_, index) => {
    const start = plannedStart(state, addDays(last, index));
    return baseEntryValues(state, {
      scheduleId,
      sequence: entries.length + index + 1,
      agent: "exercises",
      kind: "ERROR_STACK",
      title: "مكدس أخطاء وتمرين تصحيحي",
      subject,
      conceptIds: source?.conceptIds ?? state.learning.currentConceptIds,
      plannedStart: start,
      volumeMultiplier: state.learning.weeklyExerciseMultiplier,
      shift: { reason: "UNDERPERFORMED", sourceEntryId: source?.entryId ?? null },
    });
  });
  await client.insert(scheduleEntriesTable).values(rows);
}

async function recordMistake(
  client: QueryClient,
  state: LearningState,
  event: AgentEvent,
): Promise<void> {
  const conceptId = typeof event.payload.conceptId === "string"
    ? event.payload.conceptId.trim()
    : "";
  const skillId = typeof event.payload.skillId === "string"
    ? event.payload.skillId.trim()
    : "";
  if (!conceptId || !skillId) {
    throw new AgentStateTransitionException(
      "MISTAKE_RECORDED requires conceptId and skillId",
      "INVALID_EVENT",
      { eventType: event.eventType },
    );
  }
  const existing = await client
    .select()
    .from(mistakesTable)
    .where(and(
      eq(mistakesTable.userId, state.userId),
      eq(mistakesTable.conceptId, conceptId),
      eq(mistakesTable.skillId, skillId),
      eq(mistakesTable.status, "OPEN"),
    ))
    .limit(1);
  const now = asDate(event.occurredAt);
  const classification = recordValue(event.payload.classification);
  const evidence = recordValue(event.payload.evidence);
  if (existing[0]) {
    await client
      .update(mistakesTable)
      .set({
        occurrences: existing[0].occurrences + 1,
        lastSeenAt: now,
        classification,
        evidence,
        includedInNextPractice: true,
        updatedAt: now,
      })
      .where(eq(mistakesTable.mistakeId, existing[0].mistakeId));
    return;
  }
  await client.insert(mistakesTable).values({
    mistakeId: `mist_${randomUUID()}`,
    userId: state.userId,
    conceptId,
    skillId,
    source: recordValue(event.payload.source),
    classification,
    evidence,
    status: "OPEN",
    occurrences: 1,
    firstSeenAt: now,
    lastSeenAt: now,
    nextReviewAt: null,
    masteryAttempts: 0,
    requiredConsecutiveCorrect: 2,
    stackId: `stack_${randomUUID()}`,
    stackRank: 1,
    includedInNextPractice: true,
    updatedAt: now,
  });
}

async function shiftScheduledEntry(
  client: QueryClient,
  state: LearningState,
  event: AgentEvent,
): Promise<void> {
  const entryId = typeof event.payload.entryId === "string"
    ? event.payload.entryId
    : event.sessionId;
  const newStartValue = typeof event.payload.newStart === "string"
    ? event.payload.newStart
    : undefined;
  if (!entryId || !newStartValue) {
    throw new AgentStateTransitionException(
      "SCHEDULE_SHIFT_REQUESTED requires entryId and newStart",
      "INVALID_EVENT",
      { eventType: event.eventType },
    );
  }
  const entry = await findEntry(client, state.userId, entryId);
  if (entry.status !== "PENDING" && entry.status !== "PAUSED") {
    throw new AgentStateTransitionException(
      `Session ${entryId} cannot be shifted from ${entry.status}`,
      "INVALID_SESSION_STATE",
      { eventType: event.eventType, sessionId: entryId },
    );
  }
  const newStart = asDate(newStartValue);
  await client
    .update(scheduleEntriesTable)
    .set({
      plannedStart: newStart,
      weekKey: isoWeekKey(dateOnly(newStart)),
      shift: {
        ...(entry.shift ?? {}),
        reason: "FLEXIBLE_RESCHEDULE",
        previousStart: entry.plannedStart.toISOString(),
        requestedBy: event.actor.id,
      },
      updatedAt: asDate(event.occurredAt),
    })
    .where(eq(scheduleEntriesTable.entryId, entry.entryId));
}

function eventRow(event: AgentEvent) {
  return {
    eventId: event.eventId,
    userId: event.userId,
    eventType: event.eventType,
    occurredAt: asDate(event.occurredAt),
    actor: event.actor,
    sessionId: event.sessionId ?? null,
    correlationId: event.correlationId ?? null,
    causationId: event.causationId ?? null,
    idempotencyKey: event.idempotencyKey,
    phase: event.phase,
    payload: event.payload,
    routing: event.routing,
  };
}

async function snapshotForClient(client: QueryClient, userId: string): Promise<OrchestratorSnapshot> {
  const stateRow = await ensureState(client, userId);
  const entries = await selectEntries(client, userId);
  return snapshotFromRows(stateFromRow(stateRow), entries);
}

export async function getOrchestratorSnapshot(userId: string): Promise<OrchestratorSnapshot> {
  return snapshotForClient(db, userId);
}

export async function handleAgentEvent(input: AgentEvent): Promise<OrchestratorSnapshot> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(agentEventsTable)
      .where(and(
        eq(agentEventsTable.userId, input.userId),
        eq(agentEventsTable.idempotencyKey, input.idempotencyKey),
      ))
      .limit(1);
    if (existing[0]) return snapshotForClient(tx, input.userId);

    const stateRow = await ensureState(tx, input.userId);
    const previous = stateFromRow(stateRow);
    const next = reduceLearningState(previous, input);
    const occurredAt = asDate(input.occurredAt);

    const inserted = await tx
      .insert(agentEventsTable)
      .values(eventRow(input))
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) return snapshotForClient(tx, input.userId);

    await tx
      .update(learningStateTable)
      .set(stateValues(next))
      .where(eq(learningStateTable.userId, input.userId));

    switch (input.eventType) {
      case "SCHEDULE_INITIALIZED":
        await initializeDiagnosticSchedule(tx, next, occurredAt);
        break;
      case "DIAGNOSTIC_DAY_COMPLETED":
      case "MASTERY_EVIDENCE_SUBMITTED":
      case "SESSION_STARTED":
      case "SESSION_HEARTBEAT":
      case "SESSION_COMPLETED":
      case "SESSION_SKIPPED":
      case "SESSION_MISSED":
      case "SESSION_OUTCOME_RECORDED":
      case "QUIZ_SUBMITTED":
      case "LEARNER_PAUSED":
      case "LEARNER_RESUMED":
        await updateSession(tx, previous, input);
        break;
      case "MISTAKE_RECORDED":
        await recordMistake(tx, next, input);
        break;
      case "SCHEDULE_SHIFT_REQUESTED":
        await shiftScheduledEntry(tx, next, input);
        break;
      default:
        break;
    }

    if (
      next.phase === "CORE_LEARNING"
      && (previous.phase === "DIAGNOSTIC" || previous.phase === "TRANSITIONING")
    ) {
      await initializeCoreSchedule(tx, next, occurredAt);
    }
    if (
      input.eventType === "SESSION_SKIPPED"
      || input.eventType === "SESSION_MISSED"
      || input.eventType === "SESSION_OUTCOME_RECORDED"
      || input.eventType === "QUIZ_SUBMITTED"
    ) {
      if (next.learning.weeklyExerciseMultiplier > 1) {
        await addPracticeExpansion(tx, next, occurredAt);
      }
    }

    const notificationEntryId =
      typeof input.payload.entryId === "string" ? input.payload.entryId : null;
    await tx
      .insert(notificationOutboxTable)
      .values({
        notificationId: `note_${randomUUID()}`,
        userId: input.userId,
        eventId: input.eventId,
        entryId: notificationEntryId,
        title: `${agentLabel(input.routing.targetAgent)} · ${input.eventType}`,
        body: typeof input.payload.notificationMessage === "string"
          ? input.payload.notificationMessage
          : "تم حفظ قرار الوكيل في مسار التعلم.",
        locale: next.locale,
      })
      .onConflictDoNothing();

    return snapshotForClient(tx, input.userId);
  });
}

export function eventTypeFromUnknown(value: string): AgentEventType {
  const allowed: AgentEventType[] = [
    "ONBOARDING_COMPLETED",
    "SCHEDULE_INITIALIZED",
    "SESSION_STARTED",
    "SESSION_HEARTBEAT",
    "MASTERY_EVIDENCE_SUBMITTED",
    "SESSION_COMPLETED",
    "SESSION_SKIPPED",
    "SESSION_MISSED",
    "SESSION_OUTCOME_RECORDED",
    "QUIZ_SUBMITTED",
    "MISTAKE_RECORDED",
    "DIAGNOSTIC_DAY_COMPLETED",
    "DIAGNOSTIC_PHASE_COMPLETED",
    "SCHEDULE_SHIFT_REQUESTED",
    "PENALTY_APPLIED",
    "VOLUME_MULTIPLIER_APPLIED",
    "PHASE_CHANGED",
    "NOTIFICATION_REQUESTED",
    "LEARNER_PAUSED",
    "LEARNER_RESUMED",
  ];
  if (!allowed.includes(value as AgentEventType)) {
    throw new AgentStateTransitionException(
      `Unhandled agent event ${value}`,
      "INVALID_EVENT",
    );
  }
  return value as AgentEventType;
}