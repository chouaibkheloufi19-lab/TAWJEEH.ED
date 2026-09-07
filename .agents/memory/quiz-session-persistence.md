---
name: Quiz session persistence
description: The persistence rule for shared weekly and private quiz generation.
---

Shared weekly quiz content must be generated once and stored server-side under a unique cache key containing quiz type, unit scope, and ISO week; private quizzes must carry an owner.

**Why:** A user-scoped or in-memory generation cache can give different students different questions and loses the weekly freeze after a process restart.

**How to apply:** Resolve the current week before generation, read the stored session first, use a database uniqueness constraint plus an in-process lock for concurrent misses, and attach attempts to the stored session.