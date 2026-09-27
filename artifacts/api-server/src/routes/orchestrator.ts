import { Router, type IRouter } from "express";
import {
  GetOrchestratorStateMachineResponse,
  GetOrchestratorStateResponse,
  PostOrchestratorEventBody,
  PostOrchestratorEventResponse,
} from "@workspace/api-zod";
import {
  AgentStateTransitionException,
  type AgentEvent,
} from "../lib/orchestrator-domain";
import {
  getOrchestratorSnapshot,
  handleAgentEvent,
} from "../lib/orchestrator-service";
import { getUserId, getOrchestratorState } from "../lib/learning-store";

const router: IRouter = Router();

router.get("/orchestrator/state-machine", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const state = await getOrchestratorSnapshot(userId);
  res.json(GetOrchestratorStateMachineResponse.parse(state));
});

router.post("/orchestrator/events", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = PostOrchestratorEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_agent_event", details: parsed.error.flatten() });
    return;
  }

  const body = parsed.data;
  const event: AgentEvent = {
    eventId: body.event_id,
    eventType: body.event_type,
    occurredAt: body.occurred_at.toISOString(),
    actor: {
      kind: body.actor.kind,
      id: body.actor.id,
      ...(body.actor.version ? { version: body.actor.version } : {}),
    },
    userId,
    ...(body.session_id ? { sessionId: body.session_id } : {}),
    ...(body.correlation_id ? { correlationId: body.correlation_id } : {}),
    ...(body.causation_id ? { causationId: body.causation_id } : {}),
    idempotencyKey: body.idempotency_key,
    phase: body.phase,
    payload: body.payload,
    routing: {
      targetAgent: body.routing.target_agent,
      priority: body.routing.priority,
    },
  };

  try {
    const state = await handleAgentEvent(event);
    res.json(PostOrchestratorEventResponse.parse(state));
  } catch (error) {
    if (error instanceof AgentStateTransitionException) {
      res.status(409).json({
        error: error.code,
        message: error.message,
        details: error.details,
      });
      return;
    }
    req.log.error({ error }, "Agent event processing failed");
    res.status(500).json({ error: "agent_event_processing_failed" });
  }
});

router.get("/orchestrator/state", async (req, res): Promise<void> => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const state = await getOrchestratorState(userId, {
    currentDate: typeof req.query.current_date === "string" ? req.query.current_date : undefined,
    entryDate: typeof req.query.entry_date === "string" ? req.query.entry_date : undefined,
    subjectName: typeof req.query.subject_name === "string" ? req.query.subject_name : undefined,
    prerequisiteSkill: typeof req.query.prerequisite_skill === "string"
      ? req.query.prerequisite_skill
      : undefined,
  });
  res.json(GetOrchestratorStateResponse.parse(state));
});

export default router;