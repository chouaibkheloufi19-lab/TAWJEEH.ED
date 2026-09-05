from pathlib import Path

import fitz


source = Path("attached_assets/تمارين_قراءات_بيانية_1788614577488.pdf")
output_dir = Path(".agents/outputs/تمارين_قراءات_بيانية")
output_dir.mkdir(parents=True, exist_ok=True)

document = fitz.open(source)
print(f"pages={document.page_count}")
print(f"metadata={document.metadata}")

for index, page in enumerate(document):
    pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    output_path = output_dir / f"page-{index + 1}.png"
    pixmap.save(output_path)
    text = " ".join(page.get_text("text").split())
    print(f"page={index + 1} size={page.rect.width:.0f}x{page.rect.height:.0f} text={text[:240]!r}")