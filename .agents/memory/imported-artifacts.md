---
name: Imported artifact registration
description: Imported app files may survive a conversation transition without their artifact registration.
---

When a repository import includes a runnable web artifact but the artifact registry only lists the scaffold services, register a clean artifact first, then restore the imported app files while preserving the generated artifact metadata.

**Why:** Conversation-to-project transitions can preserve source files separately from artifact registrations, leaving a valid app unavailable in the preview despite having a configured-looking directory.

**How to apply:** Check `listArtifacts()` after a transition; if the imported web artifact is absent, register it before trying to present or screenshot the app.