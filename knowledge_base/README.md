# Tawjeeh Knowledge Base

This package is the first data-layer foundation for the Tawjeeh multi-agent
learning platform. It stores page-aware educational chunks in a persistent
ChromaDB collection and exposes read-only semantic search for future agents.

<<<<<<< HEAD
## Index the uploaded library

```bash
python main.py index-assets --directory attached_assets
```

The batch indexer:

- inventories PDFs, images, and text files without moving or deleting originals;
- extracts existing PDF text and uses Arabic/English OCR for scans and images;
- infers subject, year, stream, unit, lesson, content type, prerequisites, and agent priority;
- writes an atomic `knowledge_base/catalog.json` manifest and deterministic Chroma chunks;
- can be run again safely: unchanged sources do not duplicate, and revised sources replace stale chunks.

The educational collection gives **فهيم** primary retrieval priority through the
`agent_priority`, `agent_roles`, `prerequisites`, and `lesson_keys` metadata.

## Import one PDF
=======
## Import a physics PDF
>>>>>>> origin/main

```bash
python main.py ingest \
  --file attached_assets/physics.pdf \
  --year second_secondary \
  --term first \
  --unit mechanics \
  --content-type reference
```

The importer:

- keeps Arabic text intact while removing common PDF extraction noise;
- splits content by paragraph and bounded overlap;
- creates deterministic IDs, so re-importing the same source updates chunks;
- records the source filename, page, hash, curriculum year, unit, lesson,
  content type, difficulty, skills, concepts, and intended agent roles.

## Query from an agent

```bash
python main.py query --text "اشرح قانون نيوتن الثاني" --n-results 5
```

The service can also be run for app agents:

```bash
python main.py serve --port 8001
```

- `GET /knowledge/healthz`
- `GET /knowledge/v1/collections`
- `POST /knowledge/v1/query`
<<<<<<< HEAD
- `GET /knowledge/v1/catalog`
=======
>>>>>>> origin/main

The query API is deliberately read-only. Source documents are imported from
the CLI, which keeps write access out of the public app surface.