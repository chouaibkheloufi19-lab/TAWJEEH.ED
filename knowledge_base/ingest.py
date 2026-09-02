"""Page-aware PDF ingestion for Tawjeeh learning material."""

from __future__ import annotations

import hashlib
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

import pymupdf

from .schema import KnowledgeChunk, KnowledgeMetadata, validate_metadata
from .store import KnowledgeStore

DEFAULT_CHUNK_SIZE = 1400
DEFAULT_OVERLAP = 180


def normalize_text(text: str) -> str:
    """Normalize PDF extraction noise without changing Arabic wording."""

    text = text.replace("\u0640", "")
    text = text.replace("\u200f", "").replace("\u200e", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n[ \t]+", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_text(
    text: str,
    *,
    max_chars: int = DEFAULT_CHUNK_SIZE,
    overlap: int = DEFAULT_OVERLAP,
) -> list[str]:
    """Split by paragraphs first, then use a bounded character window."""

    if max_chars <= overlap:
        raise ValueError("max_chars must be greater than overlap")
    paragraphs = [part.strip() for part in re.split(r"\n{2,}", text) if part.strip()]
    chunks: list[str] = []
    current = ""

    for paragraph in paragraphs:
        candidate = f"{current}\n\n{paragraph}".strip() if current else paragraph
        if len(candidate) <= max_chars:
            current = candidate
            continue

        if current:
            chunks.append(current)
        if len(paragraph) <= max_chars:
            current = paragraph
            continue

        start = 0
        while start < len(paragraph):
            end = min(start + max_chars, len(paragraph))
            chunks.append(paragraph[start:end].strip())
            if end == len(paragraph):
                break
            start = max(0, end - overlap)
        current = ""

    if current:
        chunks.append(current)
    return [chunk for chunk in chunks if chunk]


def _stable_source_hash(pdf_path: Path) -> str:
    return hashlib.sha256(pdf_path.read_bytes()).hexdigest()


def extract_pdf_chunks(
    pdf_path: str | Path,
    base_metadata: KnowledgeMetadata,
    *,
    max_chars: int = DEFAULT_CHUNK_SIZE,
    overlap: int = DEFAULT_OVERLAP,
) -> list[KnowledgeChunk]:
    """Extract text with page citations and deterministic chunk IDs."""

    path = Path(pdf_path)
    if not path.is_file():
        raise FileNotFoundError(f"PDF not found: {path}")
    if path.suffix.lower() != ".pdf":
        raise ValueError(f"Expected a PDF file, received: {path.name}")



def ingest_pdf(
    store: KnowledgeStore,
    pdf_path: str | Path,
    base_metadata: KnowledgeMetadata,
    *,
    max_chars: int = DEFAULT_CHUNK_SIZE,
    overlap: int = DEFAULT_OVERLAP,
) -> dict[str, int | str]:
    chunks = extract_pdf_chunks(
        pdf_path,
        base_metadata,
        max_chars=max_chars,
        overlap=overlap,
    )
    written = store.upsert(chunks)
    return {
        "source_file": Path(pdf_path).name,
        "chunks": written,
        "collection": store.collection_name,
        "total_chunks": store.count(),
    }