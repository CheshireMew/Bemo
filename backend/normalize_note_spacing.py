from __future__ import annotations

import argparse
import sys
from pathlib import Path

from core.paths import NOTES_DIR, TRASH_DIR
from services.note_normalization_service import normalize_note_tree


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Normalize note paragraph spacing by collapsing 3+ blank lines to a single empty paragraph.",
    )
    parser.add_argument(
        "--path",
        action="append",
        dest="paths",
        help="Optional note directory to normalize. Defaults to the live notes directory.",
    )
    parser.add_argument(
        "--include-trash",
        action="store_true",
        help="Also normalize markdown files under the trash directory.",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    targets = [Path(path).resolve() for path in (args.paths or [NOTES_DIR])]
    if args.include_trash:
        targets.append(Path(TRASH_DIR).resolve())

    seen: set[Path] = set()
    total_scanned = 0
    total_changed = 0

    for target in targets:
        if target in seen:
            continue
        seen.add(target)

        scanned, changed = normalize_note_tree(target)
        total_scanned += scanned
        total_changed += changed
        print(f"{target}: scanned {scanned}, changed {changed}")

    print(f"Done. scanned={total_scanned} changed={total_changed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
