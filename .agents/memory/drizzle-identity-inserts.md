---
name: Drizzle identity insert schemas
description: Compatibility note for drizzle-zod schemas backed by generated identity columns.
---

For tables whose primary key uses Drizzle's generated-always identity, the current drizzle-zod types already exclude that column from inserts. Do not add the identity key to an `.omit()` object; it can be inferred as `never` and fail workspace typechecking.

**Why:** The imported workspace's current Drizzle/Drizzle-Zod combination rejects `id: true` in insert-schema omissions even though the database column is generated automatically.

**How to apply:** When adding or editing insert schemas, omit only generated timestamp or other user-inaccessible fields that remain present in the inferred schema. Verify with the workspace typecheck.