import os
import shutil
import unittest
import uuid

from services.note_query_service import list_notes_sorted, search_notes
from services.note_repository import build_frontmatter


class NoteQueryServiceTests(unittest.TestCase):
    def setUp(self):
        self.test_root = os.path.join(os.path.dirname(__file__), ".tmp")
        os.makedirs(self.test_root, exist_ok=True)
        self.temp_dir = os.path.join(self.test_root, f"note-query-{uuid.uuid4().hex}")
        self.notes_dir = os.path.join(self.temp_dir, "notes")
        os.makedirs(self.notes_dir, exist_ok=True)

        self._write_note(
            "2026/03/17/100_old.md",
            title_time="2026-03-17T10:00:00+08:00",
            tags=["alpha"],
            pinned=False,
            body="old note about python",
            mtime=100,
        )
        self._write_note(
            "2026/03/17/200_new.md",
            title_time="2026-03-17T11:00:00+08:00",
            tags=["beta"],
            pinned=False,
            body="new note about java",
            mtime=200,
        )
        self._write_note(
            "2026/03/17/150_pinned.md",
            title_time="2026-03-17T10:30:00+08:00",
            tags=["search-hit"],
            pinned=True,
            body="pinned note about rust",
            mtime=150,
        )

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)
        shutil.rmtree(self.test_root, ignore_errors=True)

    def _write_note(self, rel_path: str, *, title_time: str, tags: list[str], pinned: bool, body: str, mtime: int):
        full_path = os.path.join(self.notes_dir, *rel_path.split("/"))
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "w", encoding="utf-8") as file:
            file.write(build_frontmatter(title_time, tags, pinned) + body)
        os.utime(full_path, (mtime, mtime))

    def test_list_notes_sorted_puts_pinned_first_then_created_desc(self):
        notes = list_notes_sorted(self.notes_dir)
        self.assertEqual([note["filename"] for note in notes], [
            "2026/03/17/150_pinned.md",
            "2026/03/17/200_new.md",
            "2026/03/17/100_old.md",
        ])

    def test_search_notes_matches_content_and_tags_with_same_sorting(self):
        tag_results = search_notes(self.notes_dir, "search-hit")
        self.assertEqual([note["filename"] for note in tag_results], ["2026/03/17/150_pinned.md"])

        content_results = search_notes(self.notes_dir, "note")
        self.assertEqual([note["filename"] for note in content_results], [
            "2026/03/17/150_pinned.md",
            "2026/03/17/200_new.md",
            "2026/03/17/100_old.md",
        ])
