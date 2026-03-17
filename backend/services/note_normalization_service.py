from __future__ import annotations

from pathlib import Path
import re


def normalize_markdown_spacing(value: str) -> str:
    segments = value.split("```")
    normalized_segments: list[str] = []

    for index, segment in enumerate(segments):
        if index % 2 == 1:
            normalized_segments.append(segment)
            continue

        normalized_segments.append(
            re.sub(
                r"\n{3,}",
                "\n\n",
                segment
                .replace("\r\n", "\n")
                .replace("\r", "\n")
                .replace(" \n", "\n")
                .replace("\t\n", "\n")
                .replace("\u00a0\n", "\n"),
            )
        )

    return "```".join(normalized_segments).strip()


def normalize_note_file(path: Path) -> bool:
    raw = path.read_text(encoding="utf-8")

    if raw.startswith("---"):
        parts = raw.split("---", 2)
        if len(parts) >= 3:
            prefix = f"---{parts[1]}---\n"
            body = parts[2].lstrip("\n")
            normalized_body = normalize_markdown_spacing(body)
            normalized_raw = prefix + normalized_body
        else:
            normalized_raw = normalize_markdown_spacing(raw)
    else:
        normalized_raw = normalize_markdown_spacing(raw)

    if normalized_raw == raw:
        return False

    path.write_text(normalized_raw, encoding="utf-8")
    return True


def normalize_note_tree(root: Path) -> tuple[int, int]:
    scanned = 0
    changed = 0

    if not root.exists():
        return scanned, changed

    for path in root.rglob("*.md"):
        scanned += 1
        if normalize_note_file(path):
            changed += 1

    return scanned, changed
