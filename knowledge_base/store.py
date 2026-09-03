"""Persistent ChromaDB access for Tawjeeh's educational content."""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

import chromadb
from chromadb.config import Settings

from .schema import COLLECTION_NAME, KnowledgeChunk, coerce_filter

DEFAULT_DB_PATH = Path(os.environ.get("TAWJEEH_CHROMA_PATH", ".chroma"))
ARABIC_QUERY_TERM = re.compile(r"[\w\u0600-\u06FF]+", re.UNICODE)


def _lexical_score(query: str, result: dict[str, Any]) -> tuple[int, int]:
    """Score exact query terms without replacing semantic retrieval."""

    terms = [
        term
        for term in ARABIC_QUERY_TERM.findall(query.casefold())
        if len(term) > 1
    ]
    if not terms:
        return (0, 0)
    metadata = result.get("metadata") or {}
    searchable = " ".join(
        [
            str(result.get("document", "")),
            str(metadata.get("concepts", "")),
            str(metadata.get("lesson", "")),
            str(metadata.get("unit", "")),
        ]
    ).casefold()
    matches = sum(1 for term in terms if term in searchable)
    phrase_match = int(query.casefold().strip() in searchable)
    return (matches, phrase_match)


class KnowledgeStore:
    """Small, explicit wrapper around one Chroma collection."""

    def __init__(
        self,
        path: str | Path = DEFAULT_DB_PATH,
        collection_name: str = COLLECTION_NAME,
    ) -> None:
        self.path = Path(path)
        self.path.mkdir(parents=True, exist_ok=True)
        self.client = chromadb.PersistentClient(
            path=str(self.path),
            settings=Settings(anonymized_telemetry=False),
        )
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={
                "description": "Tawjeeh educational knowledge chunks",
                "schema_version": "2",
                "hnsw:space": "cosine",
            },
        )

    @property
    def collection_name(self) -> str:
        return self.collection.name

    def count(self) -> int:
        return self.collection.count()

    def upsert(self, chunks: list[KnowledgeChunk]) -> int:
        if not chunks:
            return 0
        self.collection.upsert(
            ids=[chunk.id for chunk in chunks],
            documents=[chunk.document for chunk in chunks],
            metadatas=[chunk.metadata.as_chroma_metadata() for chunk in chunks],
        )
        return len(chunks)

    def replace_source(self, source_file: str, chunks: list[KnowledgeChunk]) -> int:
        """Replace all chunks for one source without leaving stale pages behind."""

        existing = self.collection.get(where={"source_file": source_file})
        existing_ids = existing.get("ids", [])
        if existing_ids:
            self.collection.delete(ids=existing_ids)
        return self.upsert(chunks)

    def query(
        self,
        query: str,
        *,
        n_results: int = 5,
        where: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        cleaned_query = query.strip()
        if not cleaned_query:
            raise ValueError("query cannot be empty")
        if n_results < 1 or n_results > 50:
            raise ValueError("n_results must be between 1 and 50")

        candidate_count = min(max(n_results * 8, 20), 50)
        normalized_where = coerce_filter(where)
        # Chroma's current query validator accepts one equality operator per
        # filter object. Preserve the public simple-filter API while translating
        # multiple equality fields to the native conjunction form.
        if normalized_where and len(normalized_where) > 1:
            normalized_where = {
                "$and": [{key: value} for key, value in normalized_where.items()]
            }
        result = self.collection.query(
            query_texts=[cleaned_query],
            n_results=candidate_count,
            where=normalized_where,
            include=["documents", "metadatas", "distances"],
        )
        ids = result.get("ids", [[]])[0]
        documents = result.get("documents", [[]])[0]
        metadatas = result.get("metadatas", [[]])[0]
        distances = result.get("distances", [[]])[0]
        results = [
            {
                "id": ids[index],
                "document": documents[index],
                "metadata": metadatas[index],
                "distance": distances[index] if index < len(distances) else None,
            }
            for index in range(len(ids))
        ]
        if not results:
            return []

        scored = [(result, _lexical_score(cleaned_query, result)) for result in results]
        if any(score[0] for _, score in scored):
            scored.sort(
                key=lambda item: (
                    -item[1][1],
                    -item[1][0],
                    item[0].get("distance")
                    if item[0].get("distance") is not None
                    else float("inf"),
                )
            )
        return [result for result, _ in scored[:n_results]]

    def collections(self) -> list[dict[str, Any]]:
        return [
            {
                "name": collection.name,
                "count": collection.count(),
                "metadata": collection.metadata,
            }
            for collection in self.client.list_collections()
        ]