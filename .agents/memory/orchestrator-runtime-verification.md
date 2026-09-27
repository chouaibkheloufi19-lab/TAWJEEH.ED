---
name: Orchestrator runtime verification
description: Runtime acceptance for persisted orchestrator phase and agent availability.
---

Treat orchestrator readiness as a persisted-state check, not a process-health check alone: after startup, confirm the state reports `CORE_LEARNING` with Faheem inactive and both Daliil and Exercises active.

**Why:** Services can be healthy while the persisted activation matrix is wrong; the learner-facing program depends on the phase and agent state being aligned.

**How to apply:** After changes to the orchestrator reducer, persistence mapping, bootstrap state, or startup flow, use an authenticated runtime check that verifies the phase, all relevant agent statuses, and the state after reload.