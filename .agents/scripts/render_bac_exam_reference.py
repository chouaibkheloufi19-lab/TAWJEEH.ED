from pathlib import Path

import pymupdf


source = Path(
    "attached_assets/تمارين_الدوال_العددية_في_البكالوريا_للشعب_العلمية_1788340024738.pdf"
)
output_dir = Path(".agents/outputs")
output_dir.mkdir(parents=True, exist_ok=True)

document = pymupdf.open(source)
for page_number, page in enumerate(document, start=1):
    image_path = output_dir / f"bac-exam-reference-page-{page_number}.png"
    page.get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5), alpha=False).save(image_path)
    print(image_path)