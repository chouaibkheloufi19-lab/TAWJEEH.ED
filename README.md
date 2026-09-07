# Tawjeeh

Tawjeeh is an Arabic-first adaptive learning workspace for baccalaureate
students. This repository is a pnpm monorepo with a React/Vite web app, an
Express API, and a Python/ChromaDB knowledge-base service.

## Quick start

### Replit

Use the **Tawjeeh preview** workflow. It runs the complete local stack:

1. installs JavaScript dependencies with the committed `pnpm-lock.yaml`;
2. creates/synchronizes the Python environment from `uv.lock`;
3. indexes educational files when the local ChromaDB index is missing or stale;
4. starts the Python Knowledge Base on port `8001`;
5. starts the Express API on port `8080`;
6. starts Vite on port `25786`.

The startup command is:

```bash
bash scripts/start-tawjeeh.sh
```

The complete workflow requires Clerk development credentials. If the
environment is new, provision Clerk from the Replit Auth pane first; the
launcher intentionally stops with a clear message rather than running the
API with authentication disabled.

The workflow is intentionally a single supervised process so the preview is
ready only after the API and Knowledge Base health checks pass.

### Local shell

Requirements:

- Node.js 20
- pnpm 10+
- Python 3.11+
- `uv`
- `curl`

Install and run:

```bash
pnpm install
uv sync --locked
bash scripts/start-tawjeeh.sh
```

For a fast local start after the index is already prepared:

```bash
TAWJEEH_SKIP_INDEX=1 bash scripts/start-tawjeeh.sh
```

Do not use `TAWJEEH_SKIP_INDEX=1` on a fresh environment; the Knowledge Base
will be available but will contain no searchable vector nodes.

## Repository structure

| Path | Purpose |
| --- | --- |
| `artifacts/tawjeeh-ed/` | React/Vite Arabic learning interface |
| `artifacts/api-server/` | Express API, auth middleware, learning routes, and RAG gateway |
| `knowledge_base/` | Python CLI, PDF/text extraction, cataloging, ChromaDB store, and read-only HTTP service |
| `lib/api-spec/` | OpenAPI source and Orval code generation |
| `lib/api-client-react/` | Generated React Query client used by the web app |
| `lib/api-zod/` | Shared Zod schemas |
| `lib/db/` | Drizzle/PostgreSQL schema and database client |
| `attached_assets/` | Educational source files and application media |
| `scripts/start-tawjeeh.sh` | Full-stack startup and process supervision |
| `scripts/ensure-knowledge-base.sh` | Idempotent catalog/vector indexing |
| `pnpm-workspace.yaml` | Workspace packages and shared dependency catalog |
| `pyproject.toml` / `uv.lock` | Python package metadata and locked dependencies |

## Service topology and proxying

```text
Browser
  │ same-origin /api/*
  ▼
Vite :25786
  │ development proxy, no browser CORS
  ▼
Express API :8080
  │ KNOWLEDGE_BASE_URL
  ▼
Python Knowledge Base :8001/knowledge
  │
  ▼
ChromaDB .chroma/
```

The browser only calls relative `/api` routes. Vite proxies those requests to
`API_PROXY_TARGET` (default `http://127.0.0.1:8080`), so the browser does not
need a cross-origin URL. The Express API calls the Python service through
`KNOWLEDGE_BASE_URL` (default
`http://127.0.0.1:8001/knowledge`). The Python service also sends permissive
CORS headers for direct health/query checks, but normal web traffic should use
the same-origin `/api` path.

Health endpoints:

```text
GET http://127.0.0.1:25786/           # Vite app
GET http://127.0.0.1:8080/api/healthz
GET http://127.0.0.1:8001/knowledge/healthz
```

Knowledge routes exposed through Express include:

```text
GET  /api/knowledge
GET  /api/knowledge/status
POST /api/knowledge/query
```

AI generation routes (authenticated):

```text
POST /api/ai/generate-explanation
POST /api/ai/generate-exercises
```

Both routes accept JSON and return structured Arabic content. The explanation
request uses `lesson_title` and `content`; the exercises request also accepts
`exercise_count` (1–10) and `exercise_types` (`mcq`, `true_false`, or
`practical`). The server keeps the DeepSeek credential private, validates the
model response, and retries transient provider failures and malformed JSON.

## Environment variables

Never commit secret values. Configure secrets with Replit Secrets or the
corresponding local environment mechanism.

### Web application

| Variable | Required | Default / purpose |
| --- | --- | --- |
| `PORT` | No | `25786` in the Replit workflow; Vite listen port |
| `BASE_PATH` | No | `/`; Vite base path |
| `API_PROXY_TARGET` | No | `http://127.0.0.1:8080`; Express target for `/api` |
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes | Public Clerk publishable key; the app refuses to boot without it |
| `VITE_CLERK_PROXY_URL` | No | Optional Clerk proxy URL used by the browser auth client |

### Express API

| Variable | Required | Default / purpose |
| --- | --- | --- |
| `PORT` | Yes | `8080` in the full-stack launcher |
| `DATABASE_URL` | Yes for database-backed routes | Replit PostgreSQL connection string |
| `CLERK_PUBLISHABLE_KEY` | Yes for authenticated operation | Clerk publishable key |
| `CLERK_SECRET_KEY` | Production proxy only | Clerk secret used by the production Frontend API proxy |
| `PRIVATE_OBJECT_DIR` | Required for PDF storage routes | Replit App Storage private object prefix |
| `KNOWLEDGE_BASE_URL` | No | `http://127.0.0.1:8001/knowledge` |
| `DEEPSEEK_API_KEY` | Required for AI generation routes | DeepSeek credential; never put it in client code |
| `DEEPSEEK_BASE_URL` | No | `https://api.deepseek.com` |
| `DEEPSEEK_MODEL` | No | `deepseek-chat` |
| `GROK_VISION_MODEL` | No | `grok-2-vision-1212`; optional image-analysis model |
| `BACCALAUREATE_DATE` | No | Application default exam date |
| `LOG_LEVEL` | No | `info` |
| `NODE_ENV` | No | `development` in local operation |

`DATABASE_URL`, Clerk values, `PRIVATE_OBJECT_DIR`, and AI credentials must
come from managed integrations or secrets when their routes are enabled.

### Python Knowledge Base

The Python service has safe local defaults and does not require an external
secret:

| Variable | Required | Default / purpose |
| --- | --- | --- |
| `KNOWLEDGE_BASE_HOST` | No | `0.0.0.0` for the CLI; launcher binds `127.0.0.1` |
| `KNOWLEDGE_BASE_PORT` | No | `8001` |
| `KNOWLEDGE_BASE_PATH` | No | `/knowledge` |
| `TAWJEEH_CHROMA_PATH` | No | `.chroma` |
| `TAWJEEH_ASSETS_DIR` | No | `attached_assets` for automatic indexing |
| `TAWJEEH_CATALOG_PATH` | No | `knowledge_base/catalog.json` |
| `TAWJEEH_INDEX_MARKER` | No | `.chroma/.tawjeeh-index-ready` |
| `TAWJEEH_SKIP_INDEX` | No | Set to `1` only to skip startup indexing |

## Knowledge-base ingestion

`scripts/ensure-knowledge-base.sh` runs the safe batch command:

```bash
uv run --locked python3 -m knowledge_base.cli index-assets \
  --directory attached_assets \
  --catalog knowledge_base/catalog.json \
  --no-ocr
```

The command is deterministic and replaces chunks by source name, so it does
not duplicate a source on later runs. It leaves scanned pages marked
`needs_review` instead of guessing OCR text. The marker is refreshed only
after a successful run; changing an asset or the catalog causes the next
startup to re-index.

For explicit one-off PDF ingestion:

```bash
uv run --locked python3 -m knowledge_base.cli ingest \
  --file attached_assets/example.pdf \
  --year second_secondary
```

## Common commands

```bash
pnpm install
uv sync --locked
pnpm run typecheck
pnpm run build
pnpm --filter @workspace/api-spec run codegen
uv run --locked python3 -m knowledge_base.cli collections
uv run --locked python3 -m knowledge_base.cli query --text "اشرح قانون نيوتن الثاني"
```

The imported repository currently contains TypeScript errors in the existing
learning UI and generated library build outputs; those are separate from the
runtime setup and should be resolved before relying on `pnpm run build` as a
release gate.