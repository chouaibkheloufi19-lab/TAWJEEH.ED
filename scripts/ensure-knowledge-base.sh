#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

INDEX_MARKER="${TAWJEEH_INDEX_MARKER:-.chroma/.tawjeeh-index-ready}"
ASSETS_DIR="${TAWJEEH_ASSETS_DIR:-attached_assets}"
CATALOG_PATH="${TAWJEEH_CATALOG_PATH:-knowledge_base/catalog.json}"

if [[ "${TAWJEEH_SKIP_INDEX:-0}" == "1" ]]; then
  echo "[tawjeeh] Skipping knowledge-base indexing because TAWJEEH_SKIP_INDEX=1"
  exit 0
fi

if [[ ! -d "$ASSETS_DIR" ]]; then
  echo "[tawjeeh] Missing assets directory: $ASSETS_DIR" >&2
  exit 1
fi

if ! find "$ASSETS_DIR" -type f -print -quit | grep -q .; then
  echo "[tawjeeh] No source files found in $ASSETS_DIR" >&2
  exit 1
fi

needs_index=1
if [[ -f "$INDEX_MARKER" ]]; then
  marker_mtime="$(stat -c '%Y' "$INDEX_MARKER")"
  newest_input_mtime="$(
    {
      find "$ASSETS_DIR" -type f -printf '%T@\n'
      [[ -f "$CATALOG_PATH" ]] && stat -c '%Y' "$CATALOG_PATH"
    } | sort -nr | head -n 1 | cut -d. -f1
  )"
  if [[ -n "$newest_input_mtime" && "$newest_input_mtime" -le "$marker_mtime" ]]; then
    needs_index=0
  fi
fi

if [[ "$needs_index" == "0" ]]; then
  echo "[tawjeeh] Knowledge-base index is current; skipping ingestion"
  exit 0
fi

echo "[tawjeeh] Indexing educational assets from $ASSETS_DIR"
uv run --locked python3 -m knowledge_base.cli index-assets \
  --directory "$ASSETS_DIR" \
  --catalog "$CATALOG_PATH" \
  --no-ocr

mkdir -p "$(dirname "$INDEX_MARKER")"
touch "$INDEX_MARKER"
echo "[tawjeeh] Knowledge-base index is ready"