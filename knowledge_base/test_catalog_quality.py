"""Regression tests for keeping non-instructional link lists out of retrieval."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from .catalog import _link_listing_review_reason, index_assets


class RecordingStore:
    def __init__(self) -> None:
        self.removed_from_batch: set[str] | None = None
        self.replaced: list[tuple[str, int]] = []

    def remove_sources_not_in(self, source_files: set[str]) -> int:
        self.removed_from_batch = set(source_files)
        return 1

    def replace_source(self, source_file: str, chunks: list[object]) -> int:
        self.replaced.append((source_file, len(chunks)))
        return len(chunks)


class LinkListingQualityTests(unittest.TestCase):
    def test_video_playlist_with_only_short_headings_needs_review(self) -> None:
        playlist = (
            "برنامج السنة الثانية فيزياء\n"
            "دروس المجال الأول: الميكانيك والطاقة\n"
            "العمل والطاقة الحركية\n"
            + "\n".join(
                f"https://youtu.be/video{index}?si=source"
                for index in range(20)
            )
        )

        reason = _link_listing_review_reason(playlist)

        self.assertIsNotNone(reason)
        self.assertIn("روابط فيديو", reason or "")

    def test_lesson_notes_with_video_references_remain_searchable(self) -> None:
        lesson_notes = (
            "الطاقة الحركية لجسم كتلته m وسرعته v تساوي نصف حاصل ضرب الكتلة "
            "في مربع السرعة. يبين مبرهن الطاقة الحركية أن تغير الطاقة يساوي "
            "مجموع أشغال القوى المؤثرة. نحدد الجملة المدروسة ثم نكتب المعطيات "
            "ونختار المرجع ونحسب العمل مع مراعاة اتجاه القوة والإزاحة. "
        ) * 8
        lesson_notes += "\n" + "\n".join(
            f"https://youtu.be/video{index}?si=source"
            for index in range(12)
        )

        self.assertIsNone(_link_listing_review_reason(lesson_notes))

    def test_source_without_many_links_is_not_flagged(self) -> None:
        lesson_notes = "شرح قصير للطاقة الحركية والقوة المؤثرة."

        self.assertIsNone(_link_listing_review_reason(lesson_notes))

    def test_indexing_marks_link_listing_for_review_and_clears_old_chunks(self) -> None:
        playlist = (
            "برنامج السنة الثانية فيزياء\n"
            "دروس المجال الأول: الميكانيك والطاقة\n"
            "العمل والطاقة الحركية\n"
            + "\n".join(
                f"https://youtu.be/video{index}?si=source"
                for index in range(20)
            )
        )

        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            source = root / "video-playlist.txt"
            source.write_text(playlist, encoding="utf-8")
            catalog_path = root.parent / "catalog.json"
            catalog_path.write_text(
                json.dumps(
                    {
                        "sources": [
                            {
                                "source_file": "deleted-lesson.pdf",
                                "status": "indexed",
                                "chunks": 4,
                            }
                        ]
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            store = RecordingStore()

            payload = index_assets(
                root,
                catalog_path=catalog_path,
                store=store,
                ocr_empty_pages=False,
            )

        self.assertEqual(store.removed_from_batch, {"video-playlist.txt"})
        self.assertEqual(store.replaced, [("video-playlist.txt", 0)])
        self.assertEqual(payload["stats"]["needs_review"], 1)
        self.assertEqual(payload["sources"][0]["status"], "needs_review")
        self.assertEqual(
            {record["source_file"] for record in payload["sources"]},
            {"video-playlist.txt"},
        )


if __name__ == "__main__":
    unittest.main()
