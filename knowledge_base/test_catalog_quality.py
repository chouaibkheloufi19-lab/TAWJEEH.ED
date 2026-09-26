"""Regression tests for keeping non-instructional link lists out of retrieval."""

from __future__ import annotations

import unittest

from .catalog import _link_listing_review_reason


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


if __name__ == "__main__":
    unittest.main()