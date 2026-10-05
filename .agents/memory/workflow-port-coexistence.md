---
name: Fixed-port workflow coexistence
description: The imported Tawjeeh project has separate artifact workflows and a full-stack launcher that share fixed service ports.
---

The full-stack launcher and the individual web/API/knowledge workflows must not run at the same time when they target the same fixed ports; choose one verification path at a time.

**Why:** The launcher starts its own Vite, Express, and knowledge-base processes. Replit's artifact workflows can already own those ports, so a second launcher fails with address-in-use errors and can terminate healthy sibling services.

**How to apply:** Keep one owner per fixed port. When artifact API and knowledge workflows are running, the legacy preview should start only a frontend on a separate supported port and proxy to those services; verify artifact previews directly when appropriate.

Replit can automatically restart artifact workflows after a legacy full-stack launcher starts, so manually stopping them to free their ports is not a stable fix.

**Why:** The artifact services reclaimed their ports after being stopped, causing the combined launcher to fail again.

**How to apply:** Do not depend on stopping managed artifact services to make a legacy launcher work. Keep the preview frontend on its own port and reuse the managed API and knowledge services.