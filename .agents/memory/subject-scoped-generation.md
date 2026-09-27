---
name: Subject-scoped generation
description: Durable rule for preventing cross-subject contamination in grounded educational generation.
---

Grounded educational generation must apply the requested subject and curriculum year at the knowledge-retrieval boundary, then repeat the constraint in the model prompt. Prompt-only restrictions are insufficient because semantically similar nodes from another subject can already be present in the context.

**Why:** Cross-subject contamination was caused by generation routes retrieving unfiltered Chroma nodes even though the source documents and RAG service were otherwise healthy.

**How to apply:** Every route that generates exams, quizzes, exercises, or creative lesson material should derive canonical subject/year filters from the request or lesson context and pass them to retrieval before formatting the model context.