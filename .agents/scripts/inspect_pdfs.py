from __future__ import annotations

import json
from pathlib import Path

import fitz


ROOT = Path("attached_assets")
OUT = Path(".agents/outputs")
OUT.mkdir(parents=True, exist_ok=True)

records: list[dict] = []
for path in sorted(ROOT.rglob("*")):
    if path.suffix.lower() != ".pdf":
        continue
    with fitz.open(path) as document:
        page_samples = []
        image_pages = 0
        for index, page in enumerate(document):
            text = page.get_text("text").strip()
            images = page.get_images(full=True)
            if images:
                image_pages += 1
            if index < 3:
                page_samples.append(
                    {
                        "page": index + 1,
                        "text_chars": len(text),
                        "image_count": len(images),
                        "text": " ".join(text.split())[:1200],
                    }
                )
        metadata = document.metadata or {}
        records.append(
            {
                "file": str(path),
                "pages": len(document),
                "metadata": {
                    "title": metadata.get("title", ""),
                    "author": metadata.get("author", ""),
                    "subject": metadata.get("subject", ""),
                },
                "image_pages": image_pages,
                "page_samples": page_samples,
            }
        )

(OUT / "pdf_inventory.json").write_text(
    json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8"
)

for candidate in [
    "attached_assets/مجلة_الدوال_العددية_بكالوريا__1788339989209.pdf",
    "attached_assets/physics3as_moghni-unit01_1788341649961.pdf",
    "attached_assets/CamScanner_19-08-2026_11.17_1788341187961.pdf",
    "attached_assets/وثيقة_معماريات_ومواصفات_منصة_توجيه_التعليمية_-_النسخة_الشاملة__1787929851866.pdf",
]:
    path = Path(candidate)
    if not path.exists():
        continue
    with fitz.open(path) as document:
        for page_number in {0, min(1, len(document) - 1)}:
            page = document[page_number]
            pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
            output = OUT / f"{path.stem[:45]}-page-{page_number + 1}.png"
            pixmap.save(output)

print(f"Inspected {len(records)} PDF files")
print(f"Inventory: {OUT / 'pdf_inventory.json'}")
for record in records:
    first = record["page_samples"][0] if record["page_samples"] else {}
    print(
        f"{record['file']}: {record['pages']} pages, "
        f"image_pages={record['image_pages']}, "
        f"first_page_chars={first.get('text_chars', 0)}"
    )