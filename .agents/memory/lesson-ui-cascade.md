---
name: Lesson UI cascade
description: Tawjeeh's lesson stylesheet contains legacy rules that can override newer topic-board styles.
---

Place final lesson workspace overrides after the legacy lesson blocks in `index.css`; otherwise an older rule block can silently win in the cascade even when the component markup is correct.

**Why:** The imported lesson stylesheet contains multiple historical layout sections, and a visually correct topic redesign was initially covered by a later legacy block.

**How to apply:** When changing the lesson board or topic surface, search for duplicate selectors first and keep the final intentional overrides at the end of the stylesheet.