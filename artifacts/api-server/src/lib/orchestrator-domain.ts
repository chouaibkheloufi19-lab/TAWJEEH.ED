export const AGENT_IDS = [
  "mascot",
  "program",
  "faheem",
  "daleel",
  "exercises",
] as const;

export type AgentId = (typeof AGENT_IDS)[number];
export type AgentAvailability = "ACTIVE" | "LIMITED" | "INACTIVE";
export type Phase =
  | "ONBOARDING"
  | "SCHEDULE_PENDING"
  | "DIAGNOSTIC"
  | "TRANSITIONING"
  | "CORE_LEARNING"
  | "EXAM_PREP"
  | "PAUSED";
export type DiagnosticStatus = "ACTIVE" | "COMPLETED" | "PAUSED";
export type ScheduleEntryKind =
  | "ONBOARDING"
  | "DIAGNOSTIC"
  | "THEORY"
  | "PRACTICE"
  | "QUIZ"
  | "ERROR_STACK"
  | "REVIEW"
  | "EXAM";
export type ScheduleEntryStatus =
  | "PENDING"
  | "ACTIVE"
  | "PAUSED"
  | "MASTERED"
  | "SKIPPED"
  | "MISSED"
  | "CANCELLED";
export type AgentEventType =
  | "ONBOARDING_COMPLETED"
  | "SCHEDULE_INITIALIZED"
  | "SESSION_STARTED"
  | "SESSION_HEARTBEAT"
  | "MASTERY_EVIDENCE_SUBMITTED"
  | "SESSION_COMPLETED"
  | "SESSION_SKIPPED"
  | "SESSION_MISSED"
  | "SESSION_OUTCOME_RECORDED"
  | "QUIZ_SUBMITTED"
  | "MISTAKE_RECORDED"
  | "DIAGNOSTIC_DAY_COMPLETED"
  | "DIAGNOSTIC_PHASE_COMPLETED"
  | "SCHEDULE_SHIFT_REQUESTED"
  | "PENALTY_APPLIED"
  | "VOLUME_MULTIPLIER_APPLIED"
  | "PHASE_CHANGED"
  | "NOTIFICATION_REQUESTED"
  | "LEARNER_PAUSED"
  | "LEARNER_RESUMED";

export type AgentActor = {
  kind: "student" | "agent" | "system";
  id: string;
  version?: string;
};

export type Curriculum = {
  country: string;
  schoolYear: string;
  subjects: string[];
  examDate: string;
};

export type StudyWindow = {
  weekday: number;
  start: string;
  end: string;
};

export type LearningPreferences = {
  availableWindows: StudyWindow[];
  pushNotifications: boolean;
  voiceTeaching: boolean;
};

export type DiagnosticState = {
  startedAt: string | null;
  diagnosticDay: number;
  totalDays: 10;
  status: DiagnosticStatus;
  faheemEnabled: boolean;
  masteredDays: number[];
  pendingDays: number[];
};

export type LearningState = {
  userId: string;
  timezone: string;
  locale: string;
  curriculum: Curriculum;
  phase: Phase;
  diagnostic: DiagnosticState;
  agentAvailability: Record<AgentId, AgentAvailability>;
  learning: {
    weeklyExerciseMultiplier: number;
    weeklyMultiplierWeek: string;
    currentConceptIds: string[];
    masteryThreshold: number;
    daleelActivityMultiplier: number;
    exercisesIntensityMultiplier: number;
  };
  preferences: LearningPreferences;
  version: number;
  updatedAt: string;
};

export type AgentEvent = {
  eventId: string;
  eventType: AgentEventType;
  occurredAt: string;
  actor: AgentActor;
  userId: string;
  sessionId?: string;
  correlationId?: string;
  causationId?: string;
  idempotencyKey: string;
  phase: Phase;
  payload: Record<string, unknown>;
  routing: {
    targetAgent: AgentId;
    priority: "LOW" | "NORMAL" | "HIGH";
  };
};

export class AgentStateTransitionException extends Error {
  readonly name = "AgentStateTransitionException";

  constructor(
    message: string,
    readonly code:
      | "STALE_PHASE"
      | "INVALID_PHASE_TRANSITION"
      | "AGENT_UNAVAILABLE"
      | "INVALID_EVENT"
      | "INVALID_SESSION_STATE"
      | "GUARD_FAILED",
    readonly details: {
      phase?: Phase;
      targetPhase?: Phase;
      eventType?: AgentEventType;
      agentId?: AgentId;
      sessionId?: string;
    } = {},
  ) {
    super(message);
  }
}

const PHASE_TRANSITIONS: Record<Phase, readonly Phase[]> = {
  ONBOARDING: ["SCHEDULE_PENDING"],
  SCHEDULE_PENDING: ["DIAGNOSTIC"],
  DIAGNOSTIC: ["DIAGNOSTIC", "TRANSITIONING"],
  TRANSITIONING: ["CORE_LEARNING"],
  CORE_LEARNING: ["CORE_LEARNING", "EXAM_PREP", "PAUSED"],
  EXAM_PREP: ["CORE_LEARNING", "PAUSED"],
  PAUSED: ["DIAGNOSTIC", "CORE_LEARNING", "EXAM_PREP"],
};

const AGENT_LABELS: Record<AgentId, string> = {
  mascot: "Blue Owl",
  program: "Schedule Agent",
  faheem: "Faheem",
  daleel: "Daliil",
  exercises: "Exercises Agent",
};

export function agentLabel(agentId: AgentId): string {
  return AGENT_LABELS[agentId];
}

export function createInitialLearningState(
  userId: string,
  updatedAt = new Date().toISOString(),
): LearningState {
  return {
    userId,
    timezone: "Africa/Algiers",
    locale: "ar-DZ",
    curriculum: {
      country: "DZ",
      schoolYear: "third_secondary",
      subjects: [],
      examDate: "",
    },
    phase: "ONBOARDING",
    diagnostic: {
      startedAt: null,
      diagnosticDay: 1,
      totalDays: 10,
      status: "ACTIVE",
      faheemEnabled: false,
      masteredDays: [],
      pendingDays: [],
    },
    agentAvailability: {
      mascot: "ACTIVE",
      program: "ACTIVE",
      faheem: "INACTIVE",
      daleel: "INACTIVE",
      exercises: "INACTIVE",
    },
    learning: {
      weeklyExerciseMultiplier: 1,
      weeklyMultiplierWeek: "",
      currentConceptIds: [],
      masteryThreshold: 0.7,
      daleelActivityMultiplier: 1,
      exercisesIntensityMultiplier: 1,
    },
    preferences: {
      availableWindows: [],
      pushNotifications: true,
      voiceTeaching: true,
    },
    version: 1,
    updatedAt,
  };
}

export function availabilityForPhase(
  phase: Phase,
  diagnostic: DiagnosticState,
): Record<AgentId, AgentAvailability> {
  const availability: Record<AgentId, AgentAvailability> = {
    mascot: phase === "ONBOARDING" ? "ACTIVE" : "INACTIVE",
    program: "ACTIVE",
    faheem:
      phase === "DIAGNOSTIC" && diagnostic.faheemEnabled && diagnostic.diagnosticDay <= 10
        ? "ACTIVE"
        : "INACTIVE",
    daleel:
      phase === "CORE_LEARNING" || phase === "EXAM_PREP" ? "ACTIVE" : "INACTIVE",
    exercises:
      phase === "CORE_LEARNING" || phase === "EXAM_PREP" ? "ACTIVE" : "INACTIVE",
  };
  return availability;
}

export function exerciseIntensityForExam(examDate: string, now: string): number {
  if (!examDate) return 1;
  const exam = Date.parse(`${examDate}T12:00:00Z`);
  const current = Date.parse(now);
  if (!Number.isFinite(exam) || !Number.isFinite(current)) return 1;
  const daysUntil = Math.floor((exam - current) / 86_400_000);
  if (daysUntil <= 30) return 2;
  if (daysUntil <= 60) return 1.5;
  return 1;
}

export function isoWeekKey(isoDate: string): string {
  const date = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new AgentStateTransitionException(
      `Invalid event date: ${isoDate}`,
      "INVALID_EVENT",
    );
  }
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function assertTransition(
  from: Phase,
  to: Phase,
  eventType: AgentEventType,
): void {
  if (!PHASE_TRANSITIONS[from].includes(to)) {
    throw new AgentStateTransitionException(
      `Transition ${from} → ${to} is not allowed for ${eventType}`,
      "INVALID_PHASE_TRANSITION",
      { phase: from, targetPhase: to, eventType },
    );
  }
}

function payloadString(payload: Record<string, unknown>, key: string): string | undefined {
  return typeof payload[key] === "string" && payload[key].trim()
    ? payload[key].trim()
    : undefined;
}

function payloadNumber(payload: Record<string, unknown>, key: string): number | undefined {
  return typeof payload[key] === "number" && Number.isFinite(payload[key])
    ? payload[key]
    : undefined;
}

function requireAgent(event: AgentEvent, expected: AgentId): void {
  if (event.actor.kind !== "agent" || event.actor.id !== expected) {
    throw new AgentStateTransitionException(
      `Event ${event.eventType} must be emitted by ${expected}`,
      "AGENT_UNAVAILABLE",
      { eventType: event.eventType, agentId: expected },
    );
  }
}

function requirePayloadString(
  event: AgentEvent,
  key: string,
): string {
  const value = payloadString(event.payload, key);
  if (!value) {
    throw new AgentStateTransitionException(
      `Event ${event.eventType} requires payload.${key}`,
      "INVALID_EVENT",
      { eventType: event.eventType },
    );
  }
  return value;
}

function requireScore(event: AgentEvent): number {
  const score = payloadNumber(event.payload, "mastery")
    ?? payloadNumber(event.payload, "score");
  if (score === undefined || score < 0 || score > 1) {
    throw new AgentStateTransitionException(
      "Mastery must be a number between 0 and 1",
      "INVALID_EVENT",
      { eventType: event.eventType },
    );
  }
  return score;
}

export function assertEventPreconditions(state: LearningState, event: AgentEvent): void {
  if (event.userId !== state.userId) {
    throw new AgentStateTransitionException(
      "Event user does not match the learning state",
      "INVALID_EVENT",
      { eventType: event.eventType },
    );
  }
  if (event.eventType !== "ONBOARDING_COMPLETED" && event.phase !== state.phase) {
    throw new AgentStateTransitionException(
      `Event phase ${event.phase} is stale; current phase is ${state.phase}`,
      "STALE_PHASE",
      { phase: state.phase, eventType: event.eventType },
    );
  }
  if (
    event.actor.kind === "agent"
    && !AGENT_IDS.includes(event.actor.id as AgentId)
  ) {
    throw new AgentStateTransitionException(
      `Unknown agent ${event.actor.id}`,
      "INVALID_EVENT",
      { eventType: event.eventType },
    );
  }

  const targetAgent = event.routing.targetAgent;
  if (
    targetAgent !== "program"
    && state.agentAvailability[targetAgent] !== "ACTIVE"
    && event.eventType !== "ONBOARDING_COMPLETED"
  ) {
    throw new AgentStateTransitionException(
      `${agentLabel(targetAgent)} is not active in ${state.phase}`,
      "AGENT_UNAVAILABLE",
      { phase: state.phase, eventType: event.eventType, agentId: targetAgent },
    );
  }
}

function setPhase(state: LearningState, phase: Phase, event: AgentEvent): void {
  assertTransition(state.phase, phase, event.eventType);
  state.phase = phase;
  state.agentAvailability = availabilityForPhase(phase, state.diagnostic);
}

function updateExamIntensity(state: LearningState, now: string): void {
  state.learning.exercisesIntensityMultiplier = exerciseIntensityForExam(
    state.curriculum.examDate,
    now,
  );
  state.learning.daleelActivityMultiplier =
    state.learning.exercisesIntensityMultiplier >= 2 ? 0.5 : 1;
}

export function reduceLearningState(
  previous: LearningState,
  event: AgentEvent,
): LearningState {
  const state: LearningState = structuredClone(previous);
  assertEventPreconditions(state, event);

  switch (event.eventType) {
    case "ONBOARDING_COMPLETED": {
      if (state.phase !== "ONBOARDING") {
        throw new AgentStateTransitionException(
          "Onboarding has already been completed",
          "INVALID_PHASE_TRANSITION",
          { phase: state.phase, eventType: event.eventType },
        );
      }
      if (event.actor.kind !== "agent" || event.actor.id !== "mascot") {
        throw new AgentStateTransitionException(
          "Blue Owl must complete onboarding and route the learner to the Schedule Agent",
          "AGENT_UNAVAILABLE",
          { eventType: event.eventType, agentId: "mascot" },
        );
      }
      const timezone = payloadString(event.payload, "timezone");
      const schoolYear = payloadString(event.payload, "schoolYear");
      const examDate = payloadString(event.payload, "examDate");
      const subjects = event.payload.subjects;
      const availableWindows = event.payload.availableWindows;
      if (
        !timezone
        || !schoolYear
        || !examDate
        || !Array.isArray(subjects)
        || !subjects.every((item) => typeof item === "string" && item.trim())
        || !Array.isArray(availableWindows)
        || availableWindows.length === 0
      ) {
        throw new AgentStateTransitionException(
          "Onboarding requires timezone, study windows, curriculum year, exam date, and subjects",
          "GUARD_FAILED",
          { phase: state.phase, eventType: event.eventType },
        );
      }
      setPhase(state, "SCHEDULE_PENDING", event);
      state.timezone = timezone;
      state.curriculum = {
        country: payloadString(event.payload, "country") ?? "DZ",
        schoolYear,
        subjects: subjects as string[],
        examDate,
      };
      state.preferences = {
        availableWindows: availableWindows as StudyWindow[],
        pushNotifications: event.payload.pushNotifications !== false,
        voiceTeaching: event.payload.voiceTeaching !== false,
      };
      state.diagnostic = {
        ...state.diagnostic,
        startedAt: null,
        status: "ACTIVE",
        faheemEnabled: false,
        diagnosticDay: 1,
        masteredDays: [],
        pendingDays: [],
      };
      break;
    }
    case "SCHEDULE_INITIALIZED": {
      requireAgent(event, "program");
      if (state.phase !== "SCHEDULE_PENDING") {
        throw new AgentStateTransitionException(
          "A schedule can only be initialized after onboarding",
          "INVALID_PHASE_TRANSITION",
          { phase: state.phase, eventType: event.eventType },
        );
      }
      if (event.payload.hasSchedule !== true || event.payload.diagnosticCurriculumSelected !== true) {
        throw new AgentStateTransitionException(
          "A schedule and diagnostic curriculum must exist before diagnostic phase",
          "GUARD_FAILED",
          { phase: state.phase, eventType: event.eventType },
        );
      }
      setPhase(state, "DIAGNOSTIC", event);
      state.diagnostic = {
        ...state.diagnostic,
        startedAt: state.diagnostic.startedAt ?? event.occurredAt,
        faheemEnabled: true,
        status: "ACTIVE",
        diagnosticDay: 1,
        pendingDays: [1],
      };
      state.agentAvailability = availabilityForPhase(state.phase, state.diagnostic);
      break;
    }
    case "DIAGNOSTIC_DAY_COMPLETED":
    case "MASTERY_EVIDENCE_SUBMITTED": {
      requireAgent(event, "faheem");
      if (state.phase !== "DIAGNOSTIC" || !state.diagnostic.faheemEnabled) {
        throw new AgentStateTransitionException(
          "Faheem cannot accept evidence after the diagnostic phase",
          "AGENT_UNAVAILABLE",
          { phase: state.phase, eventType: event.eventType, agentId: "faheem" },
        );
      }
      const score = requireScore(event);
      const day = payloadNumber(event.payload, "day") ?? state.diagnostic.diagnosticDay;
      if (day !== state.diagnostic.diagnosticDay || day < 1 || day > 10) {
        throw new AgentStateTransitionException(
          `Diagnostic evidence belongs to day ${state.diagnostic.diagnosticDay}`,
          "GUARD_FAILED",
          { phase: state.phase, eventType: event.eventType, agentId: "faheem" },
        );
      }
      if (score < state.learning.masteryThreshold) {
        throw new AgentStateTransitionException(
          `Diagnostic day ${day} requires mastery ${state.learning.masteryThreshold}`,
          "GUARD_FAILED",
          { phase: state.phase, eventType: event.eventType, agentId: "faheem" },
        );
      }
      state.diagnostic.masteredDays = Array.from(
        new Set([...state.diagnostic.masteredDays, day]),
      ).sort((a, b) => a - b);
      if (day < state.diagnostic.totalDays) {
        state.diagnostic.diagnosticDay = day + 1;
        state.diagnostic.pendingDays = [day + 1];
        break;
      }
      state.diagnostic.pendingDays = [];
      state.diagnostic.status = "COMPLETED";
      state.diagnostic.faheemEnabled = false;
      setPhase(state, "TRANSITIONING", event);
      state.agentAvailability = availabilityForPhase(state.phase, state.diagnostic);
      setPhase(state, "CORE_LEARNING", event);
      state.agentAvailability = availabilityForPhase(state.phase, state.diagnostic);
      updateExamIntensity(state, event.occurredAt);
      break;
    }
    case "DIAGNOSTIC_PHASE_COMPLETED": {
      requireAgent(event, "program");
      if (
        state.phase !== "DIAGNOSTIC"
        || state.diagnostic.diagnosticDay !== 10
        || !state.diagnostic.masteredDays.includes(10)
      ) {
        throw new AgentStateTransitionException(
          "The tenth diagnostic day must be mastered before closing Faheem",
          "GUARD_FAILED",
          { phase: state.phase, eventType: event.eventType, agentId: "program" },
        );
      }
      state.diagnostic.status = "COMPLETED";
      state.diagnostic.faheemEnabled = false;
      setPhase(state, "TRANSITIONING", event);
      setPhase(state, "CORE_LEARNING", event);
      updateExamIntensity(state, event.occurredAt);
      break;
    }
    case "PHASE_CHANGED": {
      requireAgent(event, "program");
      const target = payloadString(event.payload, "targetPhase") as Phase | undefined;
      if (!target || !Object.hasOwn(PHASE_TRANSITIONS, target)) {
        throw new AgentStateTransitionException(
          "Phase change requires a valid target phase",
          "INVALID_EVENT",
          { phase: state.phase, eventType: event.eventType },
        );
      }
      if (target === "CORE_LEARNING" && state.diagnostic.status !== "COMPLETED") {
        throw new AgentStateTransitionException(
          "Core learning cannot start before diagnostic completion",
          "GUARD_FAILED",
          { phase: state.phase, targetPhase: target, eventType: event.eventType },
        );
      }
      setPhase(state, target, event);
      break;
    }
    case "LEARNER_PAUSED": {
      if (state.phase !== "CORE_LEARNING" && state.phase !== "EXAM_PREP") {
        throw new AgentStateTransitionException(
          "Only active learning can be paused",
          "INVALID_PHASE_TRANSITION",
          { phase: state.phase, eventType: event.eventType },
        );
      }
      setPhase(state, "PAUSED", event);
      break;
    }
    case "LEARNER_RESUMED": {
      if (state.phase !== "PAUSED") {
        throw new AgentStateTransitionException(
          "Only a paused learner can be resumed",
          "INVALID_PHASE_TRANSITION",
          { phase: state.phase, eventType: event.eventType },
        );
      }
      const target = state.diagnostic.status !== "COMPLETED"
        ? "DIAGNOSTIC"
        : (payloadString(event.payload, "targetPhase") as Phase | undefined) === "EXAM_PREP"
          ? "EXAM_PREP"
          : "CORE_LEARNING";
      setPhase(state, target, event);
      state.diagnostic.faheemEnabled = target === "DIAGNOSTIC";
      state.agentAvailability = availabilityForPhase(state.phase, state.diagnostic);
      break;
    }
    case "SESSION_OUTCOME_RECORDED":
    case "QUIZ_SUBMITTED":
    case "SESSION_SKIPPED":
    case "SESSION_MISSED": {
      if (event.eventType !== "SESSION_MISSED") requireAgent(event, "exercises");
      const score = payloadNumber(event.payload, "mastery")
        ?? payloadNumber(event.payload, "score");
      const underperformed = event.eventType !== "SESSION_SKIPPED"
        && event.eventType !== "SESSION_MISSED"
        && score !== undefined
        && score < state.learning.masteryThreshold;
      if (event.eventType === "SESSION_SKIPPED" || event.eventType === "SESSION_MISSED" || underperformed) {
        const week = isoWeekKey(event.occurredAt);
        if (state.learning.weeklyMultiplierWeek !== week) {
          state.learning.weeklyMultiplierWeek = week;
          state.learning.weeklyExerciseMultiplier = 1;
        }
        state.learning.weeklyExerciseMultiplier = Math.max(
          state.learning.weeklyExerciseMultiplier,
          2,
        );
      }
      break;
    }
    case "SESSION_STARTED":
    case "SESSION_HEARTBEAT":
    case "SESSION_COMPLETED":
      break;
    case "MISTAKE_RECORDED":
      requireAgent(event, "exercises");
      break;
    case "SCHEDULE_SHIFT_REQUESTED":
    case "PENALTY_APPLIED":
    case "VOLUME_MULTIPLIER_APPLIED":
    case "NOTIFICATION_REQUESTED":
      requireAgent(event, "program");
      break;
    default:
      throw new AgentStateTransitionException(
        `Unhandled agent event ${(event as { eventType: string }).eventType}`,
        "INVALID_EVENT",
      );
  }

  state.version += 1;
  state.updatedAt = event.occurredAt;
  state.agentAvailability = availabilityForPhase(state.phase, state.diagnostic);
  return state;
}

export function primaryAgentForEntry(
  state: LearningState,
  kind?: ScheduleEntryKind,
): AgentId {
  if (state.phase === "ONBOARDING") return "mascot";
  if (state.phase === "SCHEDULE_PENDING" || state.phase === "TRANSITIONING") return "program";
  if (state.phase === "DIAGNOSTIC") return "faheem";
  if (kind === "THEORY" || kind === "REVIEW") return "daleel";
  return "exercises";
}

export function validateSessionAgent(
  state: LearningState,
  agent: AgentId,
  kind?: ScheduleEntryKind,
): void {
  if (agent === "program") return;
  if (state.agentAvailability[agent] !== "ACTIVE") {
    throw new AgentStateTransitionException(
      `${agentLabel(agent)} is not active in ${state.phase}`,
      "AGENT_UNAVAILABLE",
      { phase: state.phase, agentId: agent },
    );
  }
  const expected = primaryAgentForEntry(state, kind);
  if (agent !== expected) {
    throw new AgentStateTransitionException(
      `${agentLabel(agent)} cannot own a ${kind ?? "learning"} session in ${state.phase}`,
      "AGENT_UNAVAILABLE",
      { phase: state.phase, agentId: agent },
    );
  }
}