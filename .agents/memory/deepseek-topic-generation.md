---
name: xAI topic generation
description: Text generation for Tawjeeh uses the server-side Replit xAI connector with structured JSON responses.
---

Tawjeeh's server-side educational text generation uses the Replit-managed xAI connector. Structured lesson, exercise, quiz, creative-topic, and Daleel calls should use JSON response mode and keep credentials server-side.

**Why:** The project already had an xAI connector path for visual tutoring, and DeepSeek was not available as a Replit integration in this environment. A single authenticated provider avoids mismatched setup and error handling.

**How to apply:** Call xAI through `ReplitConnectors` on the server. Prefer runtime model discovery, allow `XAI_MODEL` or `GROK_TEXT_MODEL` as explicit configuration, and never move credentials into browser code or add a silent provider fallback.