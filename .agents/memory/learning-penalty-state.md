---
name: Learning penalty state
description: Durable decisions for missed-session penalties, quiz attempts, and error-bank learning state.
---

Schedule penalties, quiz attempts, and practical error-bank records belong in the server-side learning store rather than localStorage. Penalty application must be idempotent so refreshing the program cannot create duplicate replacement or weekend-volume entries.

**Why:** Phase 3 changes the student’s future schedule and mastery history; browser-only state would diverge across sessions and repeated schedule reads would compound penalties.

**How to apply:** Keep new learning consequences keyed to their source attempt, missed schedule row, or quiz date, and expose the resulting state through the authenticated API before rendering profile, program, or quiz UI. Thresholds that affect remediation or eligibility belong in the durable learning policy row, not only in application constants.