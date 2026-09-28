---
name: Gemini provider availability
description: Current Gemini model and quota behavior for Tawjeeh's direct generation path
---

The current direct Gemini path uses the repository default model `gemini-3.6-flash`; the account tested in September 2026 rejected generation with HTTP 429 because its quota was exhausted. `gemini-2.5-flash` was unavailable to new users with HTTP 404, so changing models is not a reliable quota workaround.

**Why:** Grounded retrieval and fallback generation can work while live lesson/topic generation fails at the provider boundary, and the two failure modes must not be confused.

**How to apply:** Keep the supported default unless a newly verified model is configured. When live generation is required, use a Gemini key with available quota or connect an approved alternate provider; do not hide provider exhaustion as a retrieval failure.