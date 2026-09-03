---
name: Chroma index reload
description: Persistent Chroma indexes must be rebuilt and reloaded together after importing educational assets.
---

When an imported knowledge catalog reports indexed sources but the persistent Chroma directory is empty or stale, rebuild the vector collection from the asset directory and restart the knowledge service before testing semantic queries.

**Why:** The catalog can survive an import independently from the ignored persistent vector directory, and a long-running Chroma process can retain stale HNSW readers after an external index job changes the files.

**How to apply:** Treat catalog status as browse metadata only; confirm collection count and run a real vector query after indexing and service restart. Keep strict agent readiness blocked until both checks succeed.