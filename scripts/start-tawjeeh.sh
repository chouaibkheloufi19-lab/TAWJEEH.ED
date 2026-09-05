#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WEB_PORT="${PORT:-25786}"
API_PORT="${API_PORT:-8080}"
KNOWLEDGE_PORT="${KNOWLEDGE_BASE_PORT:-8001}"
API_PROXY_TARGET="${API_PROXY_TARGET:-http://127.0.0.1:${API_PORT}}"
KNOWLEDGE_BASE_URL="${KNOWLEDGE_BASE_URL:-http://127.0.0.1:${KNOWLEDGE_PORT}/knowledge}"

kb_pid=""
api_pid=""

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  [[ -n "$api_pid" ]] && kill "$api_pid" 2>/dev/null || true
  [[ -n "$kb_pid" ]] && kill "$kb_pid" 2>/dev/null || true
  wait "$api_pid" 2>/dev/null || true
  wait "$kb_pid" 2>/dev/null || true
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

wait_for_url() {
  local url="$1"
  local label="$2"
  local attempts="${3:-90}"

  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if curl --silent --fail --output /dev/null "$url"; then
      echo "[tawjeeh] $label is ready"
      return 0
    fi
    sleep 1
  done

  echo "[tawjeeh] Timed out waiting for $label at $url" >&2
  return 1
}

echo "[tawjeeh] Installing JavaScript dependencies"
pnpm install --frozen-lockfile

echo "[tawjeeh] Installing Python dependencies from uv.lock"
uv sync --locked

"$ROOT_DIR/scripts/ensure-knowledge-base.sh"

missing_auth_vars=()
for required_auth_var in CLERK_SECRET_KEY CLERK_PUBLISHABLE_KEY VITE_CLERK_PUBLISHABLE_KEY; do
  if [[ -z "${!required_auth_var:-}" ]]; then
    missing_auth_vars+=("$required_auth_var")
  fi
done
if (( ${#missing_auth_vars[@]} > 0 )); then
  echo "[tawjeeh] Clerk Auth is not configured for this environment." >&2
  echo "[tawjeeh] Open the Replit Auth pane to provision development credentials." >&2
  echo "[tawjeeh] Missing variables: ${missing_auth_vars[*]}" >&2
  exit 1
fi

echo "[tawjeeh] Starting Python knowledge-base service on ${KNOWLEDGE_PORT}"
KNOWLEDGE_BASE_HOST=127.0.0.1 \
  KNOWLEDGE_BASE_PORT="$KNOWLEDGE_PORT" \
  uv run --locked python3 -m knowledge_base.cli serve \
  --host 127.0.0.1 \
  --port "$KNOWLEDGE_PORT" &
kb_pid=$!
wait_for_url "${KNOWLEDGE_BASE_URL}/healthz" "Knowledge Base"

echo "[tawjeeh] Starting Express API on ${API_PORT}"
PORT="$API_PORT" \
  KNOWLEDGE_BASE_URL="$KNOWLEDGE_BASE_URL" \
  pnpm --filter @workspace/api-server run dev &
api_pid=$!
wait_for_url "http://127.0.0.1:${API_PORT}/api/healthz" "Express API"

echo "[tawjeeh] Starting Vite on ${WEB_PORT}"
PORT="$WEB_PORT" \
  BASE_PATH="${BASE_PATH:-/}" \
  API_PROXY_TARGET="$API_PROXY_TARGET" \
  pnpm --filter @workspace/tawjeeh-ed run dev