#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

WEB_PORT="${PORT:-5173}"
API_PORT="${API_PORT:-8080}"
KNOWLEDGE_PORT="${KNOWLEDGE_BASE_PORT:-8001}"
API_PROXY_TARGET="${API_PROXY_TARGET:-http://127.0.0.1:${API_PORT}}"
KNOWLEDGE_BASE_URL="${KNOWLEDGE_BASE_URL:-http://127.0.0.1:${KNOWLEDGE_PORT}/knowledge}"

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

echo "[tawjeeh] Waiting for the managed Knowledge Base service"
wait_for_url "${KNOWLEDGE_BASE_URL}/healthz" "Knowledge Base"

echo "[tawjeeh] Waiting for the managed Express API"
wait_for_url "${API_PROXY_TARGET}/api/healthz" "Express API"

echo "[tawjeeh] Starting Vite on ${WEB_PORT}"
PORT="$WEB_PORT" \
  BASE_PATH="${BASE_PATH:-/}" \
  API_PROXY_TARGET="$API_PROXY_TARGET" \
  pnpm --filter @workspace/tawjeeh-ed run dev