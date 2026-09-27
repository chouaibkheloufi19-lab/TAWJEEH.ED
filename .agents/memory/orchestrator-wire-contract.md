---
name: Orchestrator wire contract
description: The persisted orchestrator domain and generated API contract use different field naming conventions at the route boundary.
---

Keep the orchestrator reducer and database mapping in camelCase, but serialize state-machine responses to the generated snake_case OpenAPI shape before Zod parsing. Do not expose the internal state object directly.

**Why:** The first runtime state request compiled successfully but failed because `diagnostic` and `learning` were returned with internal camelCase keys while the generated contract required snake_case.

**How to apply:** When adding orchestrator response fields, update the explicit wire view types and snapshot serializer together, then exercise the endpoint rather than relying on TypeScript alone.