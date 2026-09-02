---
name: Imported repository validation
description: GitHub snapshots can contain unresolved merge markers that break imported services.
---

After importing a repository, scan tracked source and configuration files for unresolved merge markers, then validate cross-file contracts before starting workflows.

**Why:** A repository can be cloneable and look complete while conflict cleanup silently drops an entrypoint, endpoint, or metadata field even after syntax checks pass.

**How to apply:** Exclude dependency caches and generated output, inspect each conflict deliberately, preserve the richer compatible branch, and smoke-test each documented service route after cleanup.