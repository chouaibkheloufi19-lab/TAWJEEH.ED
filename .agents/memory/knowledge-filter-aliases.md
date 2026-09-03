---
name: Knowledge filter aliases
description: Canonical knowledge metadata can differ from learner-facing subject and curriculum labels.
---

Normalize learner-facing subject and curriculum-year labels at the knowledge-service boundary before filtering or querying.

**Why:** The catalog stores canonical values such as `third_secondary`, while the lesson UI uses labels such as `3AS`; physics sources may also be split between «الفيزياء» and «العلوم الفيزيائية». Exact filtering otherwise hides valid sources.

**How to apply:** Keep canonical metadata stable for indexing, maintain explicit alias groups in the service layer, and expand aliased filters into scalar queries while preserving source/page citations.