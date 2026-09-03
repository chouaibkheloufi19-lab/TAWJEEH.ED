---
name: Imported app runtime setup
description: Environment prerequisites that may be absent even when imported source and lockfiles are present.
---

Imported apps that already reference Clerk can still have no provisioned Clerk environment until managed auth setup runs; treat missing Clerk keys as an environment setup issue, not a reason to weaken auth middleware.

**Why:** The imported app loaded only after managed Clerk provisioning, while the source wiring was already canonical.

**How to apply:** Check Clerk management status before changing auth code. For Python services, install the dependencies into the Replit runtime even when `pyproject.toml` and `uv.lock` are already present.

Imported pnpm workspaces can also contain a lockfile that lags a generated or scaffolded package manifest; a frozen install may fail before the app can be inspected. Reconcile the lockfile only after confirming the manifest change is intentional.

**Why:** The imported workspace required a non-frozen install because the root lockfile did not include a dependency already declared by the imported scaffold.

**How to apply:** Treat this as an import hygiene issue, preserve the existing workspace structure, and rerun the relevant package build after reconciliation.