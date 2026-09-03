"""Command-line entry points for the Tawjeeh knowledge base."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Sequence

from .catalog import index_assets
from .ingest import ingest_pdf
from .schema import DIFFICULTY_LEVELS, KnowledgeMetadata
from .server import serve
from .store import KnowledgeStore


def _metadata_from_args(args: argparse.Namespace) -> KnowledgeMetadata:
    return KnowledgeMetadata(
        subject=args.subject,
        curriculum_year=args.year,
        term=args.term,
        unit=args.unit,
        lesson=args.lesson,
        content_type=args.content_type,
        difficulty=args.difficulty,
        language=args.language,
        skills=args.skills,
        concepts=args.concepts,
        agent_roles=args.agent_roles,
    )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="tawjeeh-kb",
        description="Manage Tawjeeh's searchable educational knowledge base.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    ingest_parser = subparsers.add_parser(
        "ingest", help="Extract and index a PDF without duplicating its chunks."
    )
    ingest_parser.add_argument("--file", required=True, type=Path)
    ingest_parser.add_argument("--year", required=True)
    ingest_parser.add_argument("--subject", default="physics")
    ingest_parser.add_argument("--term", default="unspecified")
    ingest_parser.add_argument("--unit", default="unspecified")
    ingest_parser.add_argument("--lesson", default="unspecified")
    ingest_parser.add_argument("--content-type", default="reference")
    ingest_parser.add_argument(
        "--difficulty", choices=sorted(DIFFICULTY_LEVELS), default="mixed"
    )
    ingest_parser.add_argument("--language", default="ar")
    ingest_parser.add_argument("--skills", default="")
    ingest_parser.add_argument("--concepts", default="")
    ingest_parser.add_argument(
        "--agent-roles", default="fahim,guide,exercise"
    )

    index_parser = subparsers.add_parser(
        "index-assets",
        help="Catalog and index all educational files in a directory.",
    )
    index_parser.add_argument("--directory", type=Path, default=Path("attached_assets"))
    index_parser.add_argument(
        "--catalog", type=Path, default=Path("knowledge_base/catalog.json")
    )
    index_parser.add_argument(
        "--no-ocr",
        action="store_true",
        help="Skip OCR and leave scanned pages marked for later review.",
    )
    index_parser.add_argument("--verbose", action="store_true")

    query_parser = subparsers.add_parser(
        "query", help="Search indexed knowledge and print source citations."
    )
    query_parser.add_argument("--text", required=True)
    query_parser.add_argument("--n-results", type=int, default=5)
    query_parser.add_argument("--where", help="JSON object of scalar metadata filters")

    subparsers.add_parser("collections", help="Show collection counts.")

    serve_parser = subparsers.add_parser(
        "serve", help="Run the read-only agent query service."
    )
    serve_parser.add_argument(
        "--host", default=os.environ.get("KNOWLEDGE_BASE_HOST", "0.0.0.0")
    )
    serve_parser.add_argument(
        "--port",
        default=int(os.environ.get("KNOWLEDGE_BASE_PORT", "8001")),
        type=int,
    )
    return parser


def main(argv: Sequence[str] | None = None) -> None:
    args = _build_parser().parse_args(argv)
    store = KnowledgeStore()

    if args.command == "ingest":
        result = ingest_pdf(store, args.file, _metadata_from_args(args))
    elif args.command == "query":
        where = json.loads(args.where) if args.where else None
        result = {
            "query": args.text,
            "results": store.query(
                args.text,
                n_results=args.n_results,
                where=where,
            ),
        }
    elif args.command == "index-assets":
        result = index_assets(
            args.directory,
            catalog_path=args.catalog,
            store=store,
            verbose=args.verbose,
            ocr_empty_pages=not args.no_ocr,
        )
    elif args.command == "collections":
        result = {"collections": store.collections()}
    elif args.command == "serve":
        serve(args.host, args.port)
        return
    else:
        raise RuntimeError(f"Unsupported command: {args.command}")

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

