"""Page-aware PDF ingestion for Tawjeeh learning material."""

from __future__ import annotations

import hashlib
import re
<<<<<<< HEAD
import subprocess
from dataclasses import dataclass
=======
<<<<<<< HEAD
import subprocess
from dataclasses import dataclass
=======
>>>>>>> origin/main
>>>>>>> origin/main
from pathlib import Path

import pymupdf

from .schema import KnowledgeChunk, KnowledgeMetadata, validate_metadata
from .store import KnowledgeStore

DEFAULT_CHUNK_SIZE = 1400
DEFAULT_OVERLAP = 180
<<<<<<< HEAD
=======
<<<<<<< HEAD
>>>>>>> origin/main
OCR_LANGUAGES = "ara+eng"
OCR_TIMEOUT_SECONDS = 30


@dataclass(frozen=True)
class ExtractedPage:
    number: int
    text: str
    method: str
<<<<<<< HEAD
=======
=======
>>>>>>> origin/main
>>>>>>> origin/main


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


<<<<<<< HEAD
=======
<<<<<<< HEAD
>>>>>>> origin/main
def _ocr_bytes(image_bytes: bytes) -> str:
    """Run the system Tesseract installation without writing user content to disk."""

    try:
        completed = subprocess.run(
            ["tesseract", "stdin", "stdout", "-l", OCR_LANGUAGES, "--psm", "6"],
            input=image_bytes,
            capture_output=True,
            check=False,
            timeout=OCR_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        return ""
    if completed.returncode != 0:
        return ""
    return normalize_text(completed.stdout.decode("utf-8", errors="ignore"))


def extract_file_pages(
    file_path: str | Path,
    *,
    ocr_empty_pages: bool = True,
) -> list[ExtractedPage]:
    """Extract page text from PDF, image, or UTF-8 text sources.

    PDFs keep their page numbers. Images are treated as one-page sources so
    page-aware citations remain consistent across all uploaded material.
    """

    path = Path(file_path)
    if not path.is_file():
        raise FileNotFoundError(f"Source not found: {path}")

    suffix = path.suffix.lower()
    if suffix == ".txt":
        text = normalize_text(path.read_text(encoding="utf-8", errors="ignore"))
        return [ExtractedPage(1, text, "text")] if text else []

    if suffix not in {".pdf", ".png", ".jpg", ".jpeg", ".webp"}:
        raise ValueError(f"Unsupported educational source: {path.name}")

    pages: list[ExtractedPage] = []
    with pymupdf.open(path) as document:
        for page_number, page in enumerate(document, start=1):
            text = normalize_text(page.get_text("text"))
            method = "text" if text else "empty"
            if not text and ocr_empty_pages:
                pixmap = page.get_pixmap(matrix=pymupdf.Matrix(1.1, 1.1), alpha=False)
                text = _ocr_bytes(pixmap.tobytes("png"))
                method = "ocr" if text else "empty"
            pages.append(ExtractedPage(page_number, text, method))
    return pages


def _chunks_from_pages(
    path: Path,
    pages: list[ExtractedPage],
    base_metadata: KnowledgeMetadata,
    *,
    max_chars: int,
    overlap: int,
) -> list[KnowledgeChunk]:
    source_hash = _stable_source_hash(path)
    chunks: list[KnowledgeChunk] = []
    for page in pages:
        if not page.text:
            continue
        for local_index, content in enumerate(
            split_text(page.text, max_chars=max_chars, overlap=overlap)
        ):
            chunk_index = len(chunks)
            metadata = KnowledgeMetadata(
                subject=base_metadata.subject,
                curriculum_year=base_metadata.curriculum_year,
                term=base_metadata.term,
                unit=base_metadata.unit,
                lesson=base_metadata.lesson,
                content_type=base_metadata.content_type,
                difficulty=base_metadata.difficulty,
                language=base_metadata.language,
                skills=base_metadata.skills,
                concepts=base_metadata.concepts,
                agent_roles=base_metadata.agent_roles,
                agent_priority=base_metadata.agent_priority,
                prerequisites=base_metadata.prerequisites,
                lesson_keys=base_metadata.lesson_keys,
                source_file=path.name,
                source_type=path.suffix.lower().lstrip("."),
                extraction_method=page.method,
                source_page=page.number,
                source_hash=source_hash,
                chunk_index=chunk_index,
                schema_version=base_metadata.schema_version,
            )
            validate_metadata(metadata)
            stable_key = (
                f"{source_hash}:{page.number}:{local_index}:"
                f"{hashlib.sha256(content.encode('utf-8')).hexdigest()}"
            )
            chunks.append(
                KnowledgeChunk(
                    id=hashlib.sha256(stable_key.encode("utf-8")).hexdigest(),
                    document=content,
                    metadata=metadata,
                )
            )
    return chunks


<<<<<<< HEAD
=======
=======
>>>>>>> origin/main
>>>>>>> origin/main
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

<<<<<<< HEAD
=======
<<<<<<< HEAD
>>>>>>> origin/main
    return _chunks_from_pages(
        path,
        extract_file_pages(path),
        base_metadata,
        max_chars=max_chars,
        overlap=overlap,
    )


def extract_file_chunks(
    file_path: str | Path,
    base_metadata: KnowledgeMetadata,
    *,
    pages: list[ExtractedPage] | None = None,
    max_chars: int = DEFAULT_CHUNK_SIZE,
    overlap: int = DEFAULT_OVERLAP,
) -> list[KnowledgeChunk]:
    """Create deterministic chunks from any supported educational source."""

    path = Path(file_path)
    return _chunks_from_pages(
        path,
        pages if pages is not None else extract_file_pages(path),
        base_metadata,
        max_chars=max_chars,
        overlap=overlap,
    )
<<<<<<< HEAD
=======
=======
    source_hash = _stable_source_hash(path)
    chunks: list[KnowledgeChunk] = []
    with pymupdf.open(path) as document:
        for page_index, page in enumerate(document, start=1):
            page_text = normalize_text(page.get_text("text"))
            if not page_text:
                continue
            for local_index, content in enumerate(
                split_text(page_text, max_chars=max_chars, overlap=overlap)
            ):
                chunk_index = len(chunks)
                metadata = KnowledgeMetadata(
                    subject=base_metadata.subject,
                    curriculum_year=base_metadata.curriculum_year,
                    term=base_metadata.term,
                    unit=base_metadata.unit,
                    lesson=base_metadata.lesson,
                    content_type=base_metadata.content_type,
                    difficulty=base_metadata.difficulty,
                    language=base_metadata.language,
                    skills=base_metadata.skills,
                    concepts=base_metadata.concepts,
                    agent_roles=base_metadata.agent_roles,
                    source_file=path.name,
                    source_page=page_index,
                    source_hash=source_hash,
                    chunk_index=chunk_index,
                    schema_version=base_metadata.schema_version,
                )
                validate_metadata(metadata)
                stable_key = (
                    f"{source_hash}:{page_index}:{local_index}:"
                    f"{hashlib.sha256(content.encode('utf-8')).hexdigest()}"
                )
                chunks.append(
                    KnowledgeChunk(
                        id=hashlib.sha256(stable_key.encode("utf-8")).hexdigest(),
                        document=content,
                        metadata=metadata,
                    )
                )
    return chunks
>>>>>>> origin/main
>>>>>>> origin/main


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