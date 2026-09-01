"""Persistent ChromaDB access for Tawjeeh's educational content."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import chromadb
from chromadb.config import Settings

from .schema import COLLECTION_NAME, KnowledgeChunk, coerce_filter

DEFAULT_DB_PATH = Path(os.environ.get("TAWJEEH_CHROMA_PATH", ".chroma"))


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
                "schema_version": "1",
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

        result = self.collection.query(
            query_texts=[cleaned_query],
            n_results=n_results,
            where=coerce_filter(where),
            include=["documents", "metadatas", "distances"],
        )
        ids = result.get("ids", [[]])[0]
        documents = result.get("documents", [[]])[0]
        metadatas = result.get("metadatas", [[]])[0]
        distances = result.get("distances", [[]])[0]
        return [
            {
                "id": ids[index],
                "document": documents[index],
                "metadata": metadatas[index],
                "distance": distances[index] if index < len(distances) else None,
            }
            for index in range(len(ids))
        ]

    def collections(self) -> list[dict[str, Any]]:
        return [
            {
                "name": collection.name,
                "count": collection.count(),
                "metadata": collection.metadata,
            }
            for collection in self.client.list_collections()
        ]