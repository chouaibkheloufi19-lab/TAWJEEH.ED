# Tawjeeh Knowledge Base

قاعدة معرفة تعليمية قابلة للبحث الدلالي لمنصة توجيه، تبدأ بمحتوى الفيزياء وتربط كل معلومة بمصدرها وبياناتها البيداغوجية.

## Run & Operate

- `pnpm install --frozen-lockfile` — install the locked workspace dependencies
- `pnpm --filter @workspace/tawjeeh-ed run dev` — run the web app (Vite uses the workflow-provided `PORT`)
- `pnpm --filter @workspace/api-server run dev` — run the API server (workflow port 8080)
- `cd ../.. && uv run python3 -m knowledge_base.cli serve --port 8001` — run the knowledge-base service
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Replit workflows: `artifacts/tawjeeh-ed: web`, `artifacts/api-server: API Server`, and `artifacts/api-server: Knowledge Base`
- Required setup: Replit PostgreSQL (`DATABASE_URL` is managed automatically), `DEEPSEEK_API_KEY` in Secrets, the connected xAI integration for Grok Vision, and Replit-managed Clerk Auth
- Optional env: `KNOWLEDGE_BASE_URL` (defaults to `http://127.0.0.1:8001/knowledge`) and `DEEPSEEK_MODEL` (defaults to `deepseek-chat`)
- `python main.py index-assets --directory attached_assets --catalog knowledge_base/catalog.json` — inventory and index the educational library
- Add `--no-ocr` for a fast, safe catalog pass that marks scanned pages for later OCR
- `python main.py ingest --file <pdf> --year second_secondary` — import a PDF into ChromaDB
- `python main.py serve --port 8001` — run the knowledge-base query service on Replit

## Stack

- pnpm workspaces, Node.js 20, Python 3.11, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `knowledge_base/` — ChromaDB storage, PDF extraction/chunking, CLI, and query service
- `knowledge_base/schema.py` — metadata contract shared by ingestion and retrieval
- `knowledge_base/ingest.py` — page-aware PDF/image/text extraction and OCR pipeline
- `knowledge_base/catalog.py` — deterministic batch catalog, taxonomy inference, duplicate handling, and safe indexing
- `knowledge_base/catalog.json` — generated source manifest and user-facing source cards
- `knowledge_base/server.py` — read-only HTTP API for agent retrieval
- `.chroma/` — local persistent ChromaDB data (ignored from version control)

## Architecture decisions

- ChromaDB stores searchable content chunks; metadata stays scalar and filterable so agents can target year, unit, type, difficulty, and source.
- Every chunk keeps deterministic IDs and source page metadata, allowing generated explanations and exercises to cite the original PDF.
- Batch ingestion is explicit through the CLI; originals remain in `attached_assets`, duplicate binaries are cataloged but not embedded twice, and scan failures are surfaced as `needs_review`.
- The query service is read-only. Content is ingested offline by the CLI, reducing the risk of exposing write access.

## Product

The knowledge base will support Fahim's diagnostic evaluation, concept mastery tracking, lesson guidance, exercise generation, weekly quizzes, and error-stack remediation for Tawjeeh.

## Phase 2 lesson room

- `/lesson/:id` is the protected Faheem foundational lesson room with a three-panel layout: mastery roadmap, Arabic chat/evidence workspace, and the animated owl blackboard.
- Sessions persist their first `startedAt` and remain open-ended; completion is mastery-based rather than time-based.
- Practical examples require a written answer and are graded against the expected concept keywords before they count toward mastery.
- A fully mastered session auto-generates and saves an official structured summary to the authenticated user's summary bank. The explicit “إنهاء وحفظ الملخص” control remains available as a review fallback.
- Pausing the owl preserves the current teaching moment; the next Faheem question includes the paused timestamp and explanation.
- Summary-bank rows persist concept mastery plus the official Tawjeeh stamp and owl logo reference.

## User preferences

- Preserve the existing product concept, supplied branding, and content structure; do not redesign the app while setting up the data layer.

## Gotchas

- ChromaDB data is local and ignored; back it up before moving environments.
- Run the PDF importer once per source file. Re-running the same file updates deterministic chunk IDs instead of duplicating them.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
