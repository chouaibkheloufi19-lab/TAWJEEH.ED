---
name: Quiz fallback Unicode
description: Unicode safety for source excerpts used in grounded quiz fallbacks
---

Grounded quiz fallbacks must sanitize source excerpts after truncation, not only before it, because slicing UTF-16 text can split a valid mathematical symbol or emoji into an unpaired surrogate.

**Why:** PostgreSQL rejects JSON containing an unpaired surrogate, which can turn an otherwise valid source-backed fallback into a 502 during quiz-session persistence.

**How to apply:** Keep valid surrogate pairs intact and remove only unpaired code units before putting source-derived text into JSON, database rows, or API responses.