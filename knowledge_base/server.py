"""Read-only HTTP query service for Tawjeeh agents."""

from __future__ import annotations

import json
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
<<<<<<< HEAD
from urllib.parse import parse_qs, urlparse

from .catalog import load_catalog
=======
from urllib.parse import urlparse

>>>>>>> origin/main
from .store import KnowledgeStore


def _json_bytes(payload: Any) -> bytes:
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


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
<<<<<<< HEAD
            elif route == "/v1/catalog":
                catalog = load_catalog()
                params = parse_qs(urlparse(self.path).query)
                requested_subject = params.get("subject", [None])[0]
                requested_year = params.get("curriculum_year", [None])[0]
                source_records = [
                    item
                    for item in catalog.get("sources", [])
                    if item.get("status") == "indexed"
                ]
                if requested_subject:
                    source_records = [
                        item
                        for item in source_records
                        if item.get("subject") == requested_subject
                    ]
                if requested_year:
                    source_records = [
                        item
                        for item in source_records
                        if item.get("curriculum_year") == requested_year
                    ]
                sources = [
                    {
                        "id": item["source_id"],
                        "title": item["title"],
                        "summary": item["summary"],
                        "subject": item["subject"],
                        "unit": item["unit"],
                        "lesson": item["lesson"],
                        "type": item["content_type"],
                        "difficulty": item["difficulty"],
                        "source": item["source_file"],
                        "page": item["first_page"],
                        "tags": item["tags"],
                    }
                    for item in source_records
                ]
                if requested_subject:
                    sources = [
                        item for item in sources if item.get("subject") == requested_subject
                    ]
                self._send(
                    HTTPStatus.OK,
                    {
                        "version": catalog.get("version", 1),
                        "stats": catalog.get("stats", {}),
                        "sources": sources,
                        "count": len(sources),
                    },
                )
=======
>>>>>>> origin/main
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
            results = self._store().query(
                query,
                n_results=n_results,
                where=where,
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