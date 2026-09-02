"""Read-only HTTP query service for Tawjeeh agents."""

from __future__ import annotations

import json
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlparse

from .catalog import load_catalog
from .store import KnowledgeStore


def _json_bytes(payload: Any) -> bytes:
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


def _catalog_cards(
    *,
    subject: str | None = None,
    curriculum_year: str | None = None,
) -> list[dict[str, Any]]:
    payload = load_catalog()
    cards = payload.get("cards", [])
    if not isinstance(cards, list):
        return []

    normalized_subject = (subject or "").strip()
    subject_aliases = {
        "العلوم": {"العلوم", "العلوم الفيزيائية", "الفيزياء"},
        "الفيزياء": {"العلوم", "العلوم الفيزيائية", "الفيزياء"},
    }
    allowed_subjects = subject_aliases.get(
        normalized_subject,
        {normalized_subject} if normalized_subject else None,
    )
    filtered: list[dict[str, Any]] = []
    for card in cards:
        if not isinstance(card, dict):
            continue
        if allowed_subjects is not None and card.get("subject") not in allowed_subjects:
            continue
        if curriculum_year and card.get("curriculum_year") not in {
            curriculum_year,
            "unspecified",
        }:
            continue
        filtered.append(card)
    return filtered


def _catalog_search(query: str, cards: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    terms = [term.casefold() for term in query.split() if term.strip()]
    ranked: list[tuple[int, dict[str, Any]]] = []
    for card in cards:
        haystack = " ".join(
            str(card.get(key, ""))
            for key in ("title", "summary", "subject", "unit", "lesson", "tags")
        ).casefold()
        score = sum(1 for term in terms if term in haystack)
        if score:
            ranked.append((score, card))
    ranked.sort(key=lambda item: (-item[0], str(item[1].get("title", ""))))
    results: list[dict[str, Any]] = []
    for _, card in ranked[:limit]:
        results.append(
            {
                "id": str(card.get("id", "")),
                "document": str(card.get("summary", "")),
                "metadata": {
                    "subject": str(card.get("subject", "")),
                    "unit": str(card.get("unit", "")),
                    "lesson": str(card.get("lesson", "")),
                    "content_type": str(card.get("type", "reference")),
                    "source_file": str(card.get("source", "")),
                    "source_page": str(card.get("page", 0)),
                    "concepts": ",".join(str(tag) for tag in card.get("tags", [])),
                },
            }
        )
    return results


class KnowledgeRequestHandler(BaseHTTPRequestHandler):
    server_version = "TawjeehKnowledge/1.0"

    def _route(self) -> str:
        path = urlparse(self.path).path.rstrip("/") or "/"
        base_path = os.environ.get("KNOWLEDGE_BASE_PATH", "/knowledge").rstrip("/")
        if base_path and path.startswith(base_path):
            path = path[len(base_path) :] or "/"
        return path

    def _store(self) -> KnowledgeStore:
        return KnowledgeStore()

    def _send(self, status: int, payload: Any) -> None:
        body = _json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        try:
            store = self._store()
            route = self._route()
            if route == "/":
                self._send(
                    HTTPStatus.OK,
                    {
                        "service": "tawjeeh-knowledge-base",
                        "status": "ok",
                        "message": "Tawjeeh knowledge base API is running.",
                        "endpoints": {
                            "health": "/knowledge/healthz",
                            "collections": "/knowledge/v1/collections",
                            "query": "POST /knowledge/v1/query",
                        },
                    },
                )
            elif route == "/healthz":
                self._send(
                    HTTPStatus.OK,
                    {
                        "status": "ok",
                        "service": "tawjeeh-knowledge-base",
                        "collection": store.collection_name,
                        "count": store.count(),
                    },
                )
            elif route == "/v1/collections":
                self._send(HTTPStatus.OK, {"collections": store.collections()})
            elif route == "/v1/catalog":
                query = parse_qs(urlparse(self.path).query)
                subject = query.get("subject", [None])[0]
                curriculum_year = query.get("curriculum_year", [None])[0]
                cards = _catalog_cards(
                    subject=subject,
                    curriculum_year=curriculum_year,
                )
                self._send(
                    HTTPStatus.OK,
                    {
                        "sources": cards,
                        "stats": load_catalog().get("stats", {}),
                    },
                )
            else:
                self._send(HTTPStatus.NOT_FOUND, {"error": "route_not_found"})
        except Exception as error:
            self._send(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(error)})

    def do_POST(self) -> None:  # noqa: N802
        if self._route() != "/v1/query":
            self._send(HTTPStatus.NOT_FOUND, {"error": "route_not_found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(body, dict):
                raise ValueError("request body must be an object")
            query = body.get("query")
            n_results = body.get("n_results", 5)
            where = body.get("where")
            if not isinstance(query, str):
                raise ValueError("query must be a string")
            if not isinstance(n_results, int):
                raise ValueError("n_results must be an integer")
            store = self._store()
            if store.count():
                results = store.query(
                    query,
                    n_results=n_results,
                    where=where,
                )
            else:
                subject = where.get("subject") if isinstance(where, dict) else None
                results = _catalog_search(
                    query,
                    _catalog_cards(subject=subject),
                    n_results,
                )
            self._send(
                HTTPStatus.OK,
                {
                    "query": query,
                    "results": results,
                    "count": len(results),
                },
            )
        except (ValueError, json.JSONDecodeError) as error:
            self._send(HTTPStatus.BAD_REQUEST, {"error": str(error)})
        except Exception as error:
            self._send(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(error)})

    def log_message(self, _format: str, *_args: object) -> None:
        return


def serve(host: str = "0.0.0.0", port: int = 8001) -> None:
    server = ThreadingHTTPServer((host, port), KnowledgeRequestHandler)
    print(f"Tawjeeh knowledge service listening on {host}:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()