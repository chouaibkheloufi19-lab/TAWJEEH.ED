---
name: DeepSeek topic generation
description: Text generation for Tawjeeh uses DeepSeek directly with structured JSON responses.
---

Tawjeeh's server-side educational text generation is configured for the OpenAI-compatible DeepSeek API. Structured lesson, exercise, quiz, and creative-topic calls should use JSON response mode and keep the API key server-side.

**Why:** The imported implementation pointed text generation at an xAI connector while its error handling and requested setup referred to DeepSeek, so topic generation could never reliably reach the intended provider.

**How to apply:** Keep `DEEPSEEK_API_KEY` in Replit Secrets; use `DEEPSEEK_MODEL` and `DEEPSEEK_BASE_URL` only for non-secret configuration. Do not move the key into browser code or add a silent provider fallback.