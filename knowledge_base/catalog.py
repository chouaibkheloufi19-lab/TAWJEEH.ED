"""Stable catalog and batch indexing for Tawjeeh educational uploads."""

from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any, Iterable

from .ingest import ExtractedPage, extract_file_chunks, extract_file_pages, normalize_text
from .schema import KnowledgeMetadata
from .store import KnowledgeStore

SUPPORTED_EXTENSIONS = frozenset({".pdf", ".png", ".jpg", ".jpeg", ".webp", ".txt"})
DISPLAY_SUBJECTS = {
    "mathematics": "الرياضيات",
    "physics": "الفيزياء",
    "physical_sciences": "العلوم الفيزيائية",
    "mixed": "متعدد المواد",
    "unspecified": "غير محدد",
}

TOPICS: tuple[tuple[str, tuple[str, ...], str, str], ...] = (
    ("functions", ("الدوال", "الدالة", "fonction", "functions", "اشتقاق", "مشتقة", "نهاية", "lim"), "الدوال العددية", "الدوال"),
    ("numbers_calculus", ("الأعداد والحساب", "الاعداد والحساب", "أعداد", "حساب", "عددية", "النسب", "المعادلات"), "الأعداد والحساب", "الأعداد والحساب"),
    ("geometry", ("الهندسة", "هندسة", "متجه", "vectors", "مثلث", "الدائرة"), "الهندسة", "الهندسة"),
    ("probability", ("الاحتمالات", "احتمال", "التعداد", "إحصاء", "احصاء"), "الاحتمالات والإحصاء", "الاحتمالات"),
    ("mechanics", ("الميكانيك", "الحركة", "نيوتن", "القوة", "الطاقة الحركية", "السقوط"), "الميكانيك", "الميكانيك"),
    ("chemical_transformations", ("التحول الكيميائي", "تحول كيميائي", "تفاعل", "اليود", "الناقلية", "المعايرة"), "التحولات الكيميائية", "التحولات الكيميائية"),
    ("gases", ("الضغط", "غاز", "الغازات", "الغاز", "ضغط غاز"), "الغازات والضغط", "الغازات"),
    ("electricity", ("الكهرباء", "الدارة", "التيار", "التوتر", "المكثفة"), "الكهرباء", "الكهرباء"),
)


def _haystack(path: Path, text: str) -> str:
    return f"{path.stem} {text[:12000]}".casefold()


def _has_any(value: str, words: Iterable[str]) -> bool:
    return any(word.casefold() in value for word in words)


def _infer_subject(path: Path, text: str) -> str:
    value = _haystack(path, text)
    filename = path.name.casefold()
    if _has_any(filename, ("math", "mathem", "رياضيات", "دوال", "اشتقاق")):
        return "mathematics"
    if _has_any(filename, ("physic", "physics", "فيزياء", "علوم_فيزيائية", "العلوم_الفيزيائية")):
        return "physics"
    math_words = ("رياضيات", "math", "mathem", "دوال", "اشتقاق", "نهايات", "احتمالات", "الجبر")
    physics_words = (
        "فيزياء",
        "physic",
        "علوم فيزيائية",
        "ناقلية",
        "ضغط غاز",
        "تحول كيميائي",
        "ميكانيك",
        "نيوتن",
    )
    math = _has_any(value, math_words)
    physics = _has_any(value, physics_words)
    if math and physics:
        return "physical_sciences"
    if math:
        return "mathematics"
    if physics:
        return "physics"
    # The first CamScanner batch was explicitly identified by the uploader as
    # baccalaureate mathematics material, so keep that source family grouped.
    if "camscanner" in value:
        return "mathematics"
    return "unspecified"


def _infer_year(path: Path, text: str) -> str:
    value = _haystack(path, text)
    if _has_any(value, ("3as", "3as", "3 ثانوي", "الثالثة", "بكالوريا", "bac", "3as")):
        return "third_secondary"
    if _has_any(value, ("2as", "2 ثانوي", "الثانية", "2as")):
        return "second_secondary"
    if _has_any(value, ("1as", "1 ثانوي", "الأولى", "1as")):
        return "first_secondary"
    if _has_any(value, ("camscanner", "الدورة التأسيسية", "المكتسبات القبلية", "مكتسبات قبلية")):
        return "third_secondary"
    return "unspecified"


def _infer_stream(path: Path, text: str) -> str:
    value = _haystack(path, text)
    if _has_any(value, ("شعبة رياضيات", "شعبة الرياضيات", "رياضيات")):
        return "mathematics"
    if _has_any(value, ("تقني رياضي", "هندسة")):
        return "technical_mathematics"
    if _has_any(value, ("علوم تجريبية", "علوم")):
        return "experimental_sciences"
    return "all"


def _infer_topic(path: Path, text: str, subject: str) -> tuple[str, str, str, list[str]]:
    value = _haystack(path, text)
    for key, words, unit, lesson in TOPICS:
        if subject == "mathematics" and key in {
            "mechanics",
            "chemical_transformations",
            "gases",
            "electricity",
        }:
            continue
        if subject in {"physics", "physical_sciences"} and key in {
            "functions",
            "numbers_calculus",
            "geometry",
            "probability",
        }:
            continue
        if _has_any(value, words):
            concepts = [word for word in words[:4] if word.casefold() in value]
            return key, unit, lesson, concepts or [lesson]
    if subject == "mathematics":
        return "mathematics_general", "الرياضيات", "مراجعة عامة", ["مراجعة عامة"]
    if subject in {"physics", "physical_sciences"}:
        return "physical_sciences_general", "العلوم الفيزيائية", "مراجعة عامة", ["مراجعة عامة"]
    return "general", "غير محدد", "مراجعة عامة", ["مراجعة عامة"]


def _infer_content_type(path: Path, text: str) -> str:
    value = _haystack(path, text)
    if _has_any(value, ("حل الاختبار", "حل تمرين", "بالحل", "مع الحل", "تصحيح")):
        return "solution"
    if _has_any(value, ("اختبار", "بكالوريا", "موضوع", "فرض", "امتحان")):
        return "assessment"
    if _has_any(value, ("تمرين", "تمارين", "سلسلة", "مسألة")):
        return "exercise"
    if _has_any(value, ("برنامج", "تدرجات")):
        return "program"
    if _has_any(value, ("درس", "حصة", "دورة تأسيسية")):
        return "lesson"
    if _has_any(value, ("ملخص", "مطوية", "مراجعة", "مجلة", "مكتسبات")):
        return "summary"
    return "reference"


def _title(path: Path, subject: str, lesson: str) -> str:
    value = re.sub(r"_\d{10,}$", "", path.stem)
    value = re.sub(r"[-_]+", " ", value).strip()
    if value and not value.lower().startswith(("camscanner", "screenshot", "photo", "image", "img")):
        return value[:160]
    subject_label = DISPLAY_SUBJECTS.get(subject, "مادة تعليمية")
    return f"{subject_label} · {lesson}"


def infer_profile(path: Path, text: str) -> dict[str, Any]:
    subject = _infer_subject(path, text)
    curriculum_year = _infer_year(path, text)
    topic_key, unit, lesson, concepts = _infer_topic(path, text, subject)
    content_type = _infer_content_type(path, text)
    stream = _infer_stream(path, text)
    prerequisite = "مراجعة المكتسبات القبلية" if "مكتسب" in _haystack(path, text) else ""
    return {
        "subject": DISPLAY_SUBJECTS.get(subject, "غير محدد"),
        "subject_id": subject,
        "curriculum_year": curriculum_year,
        "stream": stream,
        "term": "unspecified",
        "unit": unit,
        "lesson": lesson,
        "lesson_key": topic_key,
        "content_type": content_type,
        "difficulty": "mixed",
        "language": "ar",
        "skills": ",".join(concepts),
        "concepts": ",".join(concepts),
        "prerequisites": prerequisite,
        "lesson_keys": topic_key,
        "agent_roles": "fahim,guide,exercise",
        "agent_priority": "fahim",
        "title": _title(path, subject, lesson),
    }


def _summary(text: str, title: str) -> str:
    lines = [line.strip() for line in normalize_text(text).splitlines() if line.strip()]
    candidate = next((line for line in lines if len(line) >= 25), "")
    if not candidate:
        candidate = f"محتوى تعليمي مصنّف ضمن {title}."
    return candidate[:360]


def _catalog_card(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record["source_id"],
        "title": record["title"],
        "summary": record["summary"],
        "subject": record["subject"],
        "curriculum_year": record["curriculum_year"],
        "unit": record["unit"],
        "lesson": record["lesson"],
        "type": record["content_type"],
        "difficulty": record["difficulty"],
        "source": record["source_file"],
        "page": record["first_page"],
        "tags": record["tags"],
    }


def load_catalog(path: str | Path = "knowledge_base/catalog.json") -> dict[str, Any]:
    catalog_path = Path(path)
    if not catalog_path.is_file():
        return {"version": 1, "generated_at": None, "sources": [], "stats": {}}
    return json.loads(catalog_path.read_text(encoding="utf-8"))


def write_catalog(payload: dict[str, Any], path: str | Path) -> None:
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile("w", encoding="utf-8", dir=destination.parent, delete=False) as temporary:
        json.dump(payload, temporary, ensure_ascii=False, indent=2)
        temporary.write("\n")
        temp_name = temporary.name
    Path(temp_name).replace(destination)


def index_assets(
    assets_dir: str | Path,
    *,
    catalog_path: str | Path = "knowledge_base/catalog.json",
    store: KnowledgeStore | None = None,
    verbose: bool = False,
    ocr_empty_pages: bool = True,
) -> dict[str, Any]:
    """Index all supported educational uploads and atomically write their catalog."""

    root = Path(assets_dir)
    if not root.is_dir():
        raise FileNotFoundError(f"Assets directory not found: {root}")
    knowledge_store = store or KnowledgeStore()
    previous = load_catalog(catalog_path)
    records: list[dict[str, Any]] = []
    seen_hashes: dict[str, str] = {}

    for path in sorted(root.iterdir(), key=lambda item: item.name.casefold()):
        if not path.is_file():
            continue
        suffix = path.suffix.lower()
        if suffix not in SUPPORTED_EXTENSIONS:
            records.append(
                {
                    "source_id": hashlib.sha256(path.read_bytes()).hexdigest(),
                    "source_file": path.name,
                    "asset_path": str(path),
                    "source_type": suffix.lstrip(".") or "unknown",
                    "status": "excluded_media",
                    "reason": "غير مخصص للفهرسة التعليمية",
                }
            )
            continue

        source_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        record: dict[str, Any] = {
            "source_id": source_hash,
            "source_file": path.name,
            "asset_path": str(path),
            "source_type": suffix.lstrip("."),
            "bytes": path.stat().st_size,
            "sha256": source_hash,
        }
        try:
            if verbose:
                print(f"[index] {path.name}", file=sys.stderr, flush=True)
            canonical_name = seen_hashes.get(source_hash)
            if canonical_name:
                knowledge_store.replace_source(path.name, [])
                record.update(
                    status="duplicate_source",
                    canonical_source=canonical_name,
                    reason="نسخة مطابقة لمصدر مفهرس؛ حُفظت في الكتالوج دون تكرار المقاطع",
                )
                records.append(record)
                continue
            seen_hashes[source_hash] = path.name
            pages = extract_file_pages(path, ocr_empty_pages=ocr_empty_pages)
            full_text = "\n\n".join(page.text for page in pages if page.text)
            profile = infer_profile(path, full_text)
            if "معماريات" in path.name and "توجيه" in path.name:
                record.update(profile, status="excluded_reference", reason="وثيقة تقنية للمنصة وليست محتوى دراسيًا")
                records.append(record)
                continue

            metadata = KnowledgeMetadata(
                subject=profile["subject"],
                curriculum_year=profile["curriculum_year"],
                term=profile["term"],
                unit=profile["unit"],
                lesson=profile["lesson"],
                content_type=profile["content_type"],
                difficulty=profile["difficulty"],
                language=profile["language"],
                skills=profile["skills"],
                concepts=profile["concepts"],
                agent_roles=profile["agent_roles"],
                agent_priority=profile["agent_priority"],
                prerequisites=profile["prerequisites"],
                lesson_keys=profile["lesson_keys"],
            )
            chunks = extract_file_chunks(path, metadata, pages=pages)
            knowledge_store.replace_source(path.name, chunks)
            method_counts: dict[str, int] = {}
            for page in pages:
                method_counts[page.method] = method_counts.get(page.method, 0) + 1
            record.update(profile)
            record.update(
                {
                    "status": "indexed" if chunks else "needs_review",
                    "review_reason": (
                        ""
                        if chunks
                        else "لا يوجد نص قابل للاستخراج؛ يحتاج المصدر إلى OCR أو مراجعة يدوية"
                    ),
                    "pages": len(pages),
                    "chunks": len(chunks),
                    "first_page": next((page.number for page in pages if page.text), 0),
                    "extraction_method": (
                        "ocr"
                        if method_counts.get("ocr")
                        else "text"
                        if method_counts.get("text")
                        else "none"
                    ),
                    "extraction_methods": method_counts,
                    "summary": _summary(full_text, profile["title"]),
                    "tags": [profile["lesson"], profile["unit"], profile["content_type"]],
                    "indexed_source_hash": source_hash,
                },
            )
        except Exception as error:  # keep the batch moving and expose the failure in the catalog
            if verbose:
                print(f"[error] {path.name}: {error}", file=sys.stderr, flush=True)
            record.update(status="error", error=str(error))
        records.append(record)

    processed_names = {record["source_file"] for record in records}
    prior_records = [
        record
        for record in previous.get("sources", [])
        if record.get("source_file") not in processed_names
    ]
    all_records = prior_records + records
    counts: dict[str, int] = {}
    for record in all_records:
        status = record.get("status", "unknown")
        counts[status] = counts.get(status, 0) + 1
    indexed_sources = [record for record in all_records if record.get("status") == "indexed"]
    payload = {
        "version": 2,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "assets_root": str(root),
        "stats": {
            **counts,
            "total_assets": len(all_records),
            "indexed_chunks": sum(record.get("chunks", 0) for record in indexed_sources),
        },
        "sources": all_records,
        "cards": [_catalog_card(record) for record in indexed_sources],
    }
    write_catalog(payload, catalog_path)
    return payload