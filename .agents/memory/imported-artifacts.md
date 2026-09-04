---
name: Imported artifact registration
description: Imported app files may survive a conversation transition without their artifact registration.
---

When a repository import includes a runnable web artifact but the artifact registry only lists the scaffold services, register a clean artifact first, then restore the imported app files while preserving the generated artifact metadata. Reinstall dependencies in the restored workspace package when its manifest exposes packages that are not symlinked yet. If the imported artifact is auto-registered after the clean artifact, move the clean artifact to a unique preview path through validated metadata replacement to avoid two root previews competing. If Clerk is wired in the imported app but not provisioned, provision the managed Clerk setup and re-check artifact registration before creating a fallback workflow.

**Why:** Conversation-to-project transitions can preserve source files separately from artifact registrations, leaving a valid app unavailable in the preview despite having a configured-looking directory.

**How to apply:** Check `listArtifacts()` after a transition; if the imported web artifact is absent, provision any required managed auth setup and check again before trying to present or screenshot the app. Only create a descriptive fallback workflow when the service is still not represented by a registered artifact. Keep the generated artifact service metadata, restore the imported source, then perform a package install scoped to that workspace package before restarting its managed workflow.