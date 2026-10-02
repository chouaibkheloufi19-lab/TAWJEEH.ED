---
name: Exam contract repair
description: Reliability rules for correcting structured exam-generation output without weakening grounding or validation
---

Exam generation may need a second model call when its first response fails structural validation. Preserve the original retrieved context for one targeted correction, then run the full validator again. Do not silently accept malformed output, invent missing fields, or weaken source, point-total, or correction-guide checks. Client timeouts must allow for both the initial generation and one correction call.

**Why:** A real mathematics-paper request took about 55 seconds because its first response failed a content check and the corrected response passed; the existing client timeout was also 55 seconds.

**How to apply:** When changing exam-generation routes or their clients, keep the correction bounded to one pass, validate the result again, and set the request timeout above the expected two-call duration. Keep failure explicit if the corrected result still fails.