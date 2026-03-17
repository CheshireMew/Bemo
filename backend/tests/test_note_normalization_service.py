import shutil
import unittest
from pathlib import Path

from services.note_normalization_service import (
    normalize_markdown_spacing,
    normalize_note_file,
    normalize_note_tree,
)


class NoteNormalizationServiceTests(unittest.TestCase):
    def make_temp_dir(self, name: str) -> Path:
        temp_dir = Path(__file__).resolve().parent / ".tmp" / name
        shutil.rmtree(temp_dir, ignore_errors=True)
        temp_dir.mkdir(parents=True, exist_ok=True)
        self.addCleanup(lambda: shutil.rmtree(temp_dir, ignore_errors=True))
        return temp_dir

    def test_normalize_markdown_spacing_collapses_extra_blank_lines(self):
        source = "first\n\n\nsecond\n\n\n\nthird"
        self.assertEqual(normalize_markdown_spacing(source), "first\n\nsecond\n\nthird")

    def test_normalize_markdown_spacing_preserves_fenced_code_blocks(self):
        source = "before\n\n\n```txt\nline1\n\n\nline2\n```\n\n\nafter"
        self.assertEqual(
            normalize_markdown_spacing(source),
            "before\n\n```txt\nline1\n\n\nline2\n```\n\nafter",
        )

    def test_normalize_note_file_preserves_frontmatter(self):
        temp_dir = self.make_temp_dir("normalize_note_file")

        note_path = temp_dir / "note.md"
        note_path.write_text("---\ntags:\n- demo\n---\nfirst\n\n\nsecond\n", encoding="utf-8")

        changed = normalize_note_file(note_path)

        self.assertTrue(changed)
        self.assertEqual(
            note_path.read_text(encoding="utf-8"),
            "---\ntags:\n- demo\n---\nfirst\n\nsecond",
        )

    def test_normalize_note_tree_returns_scan_and_change_counts(self):
        temp_dir = self.make_temp_dir("normalize_note_tree")

        changed_path = temp_dir / "a.md"
        unchanged_path = temp_dir / "b.md"
        changed_path.write_text("alpha\n\n\nbeta", encoding="utf-8")
        unchanged_path.write_text("alpha\n\nbeta", encoding="utf-8")

        scanned, changed = normalize_note_tree(temp_dir)

        self.assertEqual(scanned, 2)
        self.assertEqual(changed, 1)


if __name__ == "__main__":
    unittest.main()
