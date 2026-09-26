---
name: Chroma index reload
description: Persistent Chroma indexes must be rebuilt and reloaded together after importing educational assets.
---

When an imported knowledge catalog reports indexed sources but the persistent Chroma directory is empty or stale, rebuild the vector collection from the asset directory and restart the knowledge service before testing semantic queries.

**Why:** The catalog can survive an import independently from the ignored persistent vector directory, and a long-running Chroma process can retain stale HNSW readers after an external index job changes the files.

**How to apply:** Treat catalog status as browse metadata only; confirm collection count and run a real vector query after indexing and service restart. Keep strict agent readiness blocked until both checks succeed.

The full Tawjeeh preview startup may rewrite `knowledge_base/catalog.json` with a new timestamp and newly discovered excluded media entries. Treat that as generated runtime state, not as part of unrelated UI changes.

**Why:** Preview startup runs the asset indexing guard even when the UI-only change does not touch educational assets, which can otherwise create noisy unrelated diffs.

**How to apply:** After restarting the full preview for a UI change, inspect the catalog diff and restore generated-only changes before delivery unless asset ingestion was intentional.

Batch indexing treats the assets directory as the authoritative snapshot: sources that
disappear, become unsupported, or fail review must not retain searchable chunks or
catalog records from an earlier rebuild.

**Why:** Keeping old vector segments or source cards makes retrieval disagree with the
current educational library and can feed removed material into generated lessons.

**How to apply:** Before processing the batch, remove Chroma sources outside the current
supported set; clear each current source before extraction; write the catalog from the
current batch rather than merging prior records.