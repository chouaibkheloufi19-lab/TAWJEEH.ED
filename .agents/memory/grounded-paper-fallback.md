---
name: Grounded paper fallback
description: How source-backed multi-exercise papers should choose retrieved educational excerpts
---

Source-backed paper fallbacks must rank retrieved nodes by usable exercise evidence within the preferred content types: explicit exercise markers, actionable question text, and sufficient excerpt length. Retrieval order alone can place short curriculum headings ahead of a solvable exercise.

**Why:** Semantic retrieval can return tiny syllabus or cover-page fragments as `assessment` nodes before a later node that contains the actual multi-exercise problem. When the AI provider is unavailable, using those first nodes makes the grounded fallback incorrectly report that no paper structure exists.

**How to apply:** Preserve `exercise`, `assessment`, and `solution` as the preferred content types, then prefer nodes with explicit exercise markers and meaningful text. Validate every generated section against its retrieved evidence and keep at least two source-backed sections for a paper.