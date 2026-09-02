"""Shared metadata contract for Tawjeeh knowledge chunks."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

COLLECTION_NAME = "tawjeeh_knowledge"
SCHEMA_VERSION = "2"

CONTENT_TYPES = frozenset(
    {
        "lesson",
        "concept",
        "law",
        "worked_example",
        "exercise",
        "solution",
        "summary",
        "assessment",
        "reference",
    "program",
    }
)

DIFFICULTY_LEVELS = frozenset({"introductory", "intermediate", "advanced", "mixed"})


@dataclass(frozen=True)
class KnowledgeMetadata:
    """Metadata stored with every searchable chunk.

    Chroma metadata values must be scalar values. Comma-separated fields are
    intentionally kept as strings so they remain usable in filters and can be
    expanded into richer relations later.
    """

    subject: str = "physics"
    curriculum_year: str = "unspecified"
    term: str = "unspecified"
    unit: str = "unspecified"
    lesson: str = "unspecified"
    content_type: str = "reference"
    difficulty: str = "mixed"
    language: str = "ar"
    skills: str = ""
    concepts: str = ""
    agent_roles: str = "fahim,guide,exercise"
    agent_priority: str = "fahim"
    prerequisites: str = ""
    lesson_keys: str = ""
    source_file: str = ""
    source_type: str = "pdf"
    extraction_method: str = "text"
    source_page: int = 0
    source_hash: str = ""
    chunk_index: int = 0
    schema_version: str = SCHEMA_VERSION

    def as_chroma_metadata(self) -> dict[str, str | int]:
        return {
            "subject": self.subject,
            "curriculum_year": self.curriculum_year,
            "term": self.term,
            "unit": self.unit,
            "lesson": self.lesson,
            "content_type": self.content_type,
            "difficulty": self.difficulty,
            "language": self.language,
            "skills": self.skills,
            "concepts": self.concepts,
            "agent_roles": self.agent_roles,
            "agent_priority": self.agent_priority,
            "prerequisites": self.prerequisites,
            "lesson_keys": self.lesson_keys,
            "source_file": self.source_file,
            "source_type": self.source_type,
            "extraction_method": self.extraction_method,
            "source_page": self.source_page,
            "source_hash": self.source_hash,
            "chunk_index": self.chunk_index,
            "schema_version": self.schema_version,
        }


def validate_metadata(metadata: KnowledgeMetadata) -> None:
    """Fail loudly when a chunk would be difficult for agents to filter."""

    if metadata.content_type not in CONTENT_TYPES:
        raise ValueError(
            f"Unsupported content_type {metadata.content_type!r}; "
            f"expected one of {sorted(CONTENT_TYPES)}"
        )
    if metadata.difficulty not in DIFFICULTY_LEVELS:
        raise ValueError(
            f"Unsupported difficulty {metadata.difficulty!r}; "
            f"expected one of {sorted(DIFFICULTY_LEVELS)}"
        )
    if metadata.source_page < 0:
        raise ValueError("source_page cannot be negative")
    if metadata.chunk_index < 0:
        raise ValueError("chunk_index cannot be negative")


def coerce_filter(value: Any) -> dict[str, Any] | None:
    """Accept only simple Chroma equality filters from the query service."""

    if value is None:
        return None
    if not isinstance(value, dict) or not value:
        raise ValueError("where must be a non-empty object")
    if any(key.startswith("$") for key in value):
        raise ValueError("compound Chroma filters are not exposed by this API")
    allowed = set(KnowledgeMetadata().__dict__.keys())
    if any(key not in allowed for key in value):
        raise ValueError("where contains an unsupported metadata field")
    if any(isinstance(item, (dict, list)) for item in value.values()):
        raise ValueError("where values must be scalar")
    return value


@dataclass(frozen=True)
class KnowledgeChunk:
    """A document fragment ready for deterministic upsert into Chroma."""

    id: str
    document: str
    metadata: KnowledgeMetadata = field(default_factory=KnowledgeMetadata)

    def __post_init__(self) -> None:
        if not self.id:
            raise ValueError("KnowledgeChunk.id cannot be empty")
        if not self.document.strip():
            raise ValueError("KnowledgeChunk.document cannot be empty")
        validate_metadata(self.metadata)