# Tawjeeh Knowledge Base

This package is the first data-layer foundation for the Tawjeeh multi-agent
learning platform. It stores page-aware educational chunks in a persistent
ChromaDB collection and exposes read-only semantic search for future agents.


```bash
# Index the supplied educational library without guessing scanned text.
python main.py index-assets \
  --directory attached_assets \
  --catalog knowledge_base/catalog.json \
  --no-ocr
```

The batch command builds both the source catalog and the persistent ChromaDB
collection used by the agents. Files with a reliable text layer are indexed;
scanned files remain in the catalog as `needs_review` until their OCR can be
checked. To import one source with explicit metadata, use:

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
- `GET /knowledge/v1/catalog`

The query API is deliberately read-only. Source documents are imported from
the CLI, which keeps write access out of the public app surface.