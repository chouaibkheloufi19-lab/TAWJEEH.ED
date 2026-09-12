---
name: Official Daleel summaries
description: Persistence boundary for Daleel lesson summaries and the student's profile bank.
---

Lesson progress and draft summaries may be shown and cached locally while the learner is still working, but the profile summary bank must receive only a mastery-complete summary carrying the official Tawjeeh seal.

**Why:** Persisting a draft before mastery both misrepresents the learner's progress and can prevent the mastery-triggered generation path from running because the save state is no longer idle.

**How to apply:** Keep draft preview updates local. Gate the server summary mutation behind the mastery result and official stamp, and allow retry after a failed official save.