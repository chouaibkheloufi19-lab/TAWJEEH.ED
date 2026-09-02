---
name: Imported app runtime setup
description: Environment prerequisites that may be absent even when imported source and lockfiles are present.
---

Imported apps that already reference Clerk can still have no provisioned Clerk environment until managed auth setup runs; treat missing Clerk keys as an environment setup issue, not a reason to weaken auth middleware.

**Why:** The imported app loaded only after managed Clerk provisioning, while the source wiring was already canonical.

**How to apply:** Check Clerk management status before changing auth code. For Python services, install the dependencies into the Replit runtime even when `pyproject.toml` and `uv.lock` are already present.