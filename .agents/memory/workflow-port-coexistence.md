---
name: Fixed-port workflow coexistence
description: The imported Tawjeeh project has separate artifact workflows and a full-stack launcher that share fixed service ports.
---

The full-stack launcher and the individual web/API/knowledge workflows must not run at the same time when they target the same fixed ports; choose one verification path at a time.

**Why:** The launcher starts its own Vite, Express, and knowledge-base processes. Replit's artifact workflows can already own those ports, so a second launcher fails with address-in-use errors and can terminate healthy sibling services.

**How to apply:** Before verifying or restarting the full-stack launcher, stop or avoid the individual workflows for the same ports; otherwise verify the individual artifact workflows independently. Never use both paths concurrently.