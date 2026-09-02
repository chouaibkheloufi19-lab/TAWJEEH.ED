---
name: Imported repository validation
description: GitHub snapshots can contain unresolved merge markers that break imported services.
---

After importing a repository, scan tracked source and configuration files for unresolved merge markers before starting workflows.

**Why:** A repository can be cloneable and look complete while a conflicted source file prevents a service from building; early detection avoids misleading preview failures.

**How to apply:** Exclude dependency caches and generated output, inspect each conflict deliberately, and preserve the richer compatible branch when the project contains both an offline fallback and a source-backed implementation.