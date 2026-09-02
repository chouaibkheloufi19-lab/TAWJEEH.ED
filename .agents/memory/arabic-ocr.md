---
name: Arabic educational OCR
description: Safe handling of scanned Arabic study material in the Tawjeeh library
---

Scanned Arabic educational pages must not be embedded when OCR is empty, timed out, or visibly unreliable; keep them cataloged as pending review and preserve the original upload.

**Why:** Tesseract can be too slow or produce unusable text on dense CamScanner pages, and low-quality embeddings would mislead Fahim more than an explicit missing-text status.

**How to apply:** Prefer text-layer extraction first, use OCR selectively with bounded time, and only promote a source from `needs_review` after its extracted text passes a quality check.