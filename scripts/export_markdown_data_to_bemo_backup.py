import argparse
import json
import mimetypes
import pathlib
import re
import sys
from datetime import datetime, timezone


ATTACHMENT_URL_PATTERN = re.compile(r"/images/([^)\s\"'`>]+)")
REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent


def parse_frontmatter(filepath: pathlib.Path) -> tuple[dict, str]:
    raw = filepath.read_text(encoding="utf-8")
    if not raw.startswith("---"):
        return {}, raw

    parts = raw.split("---", 2)
    if len(parts) < 3:
        return {}, raw

    try:
        import yaml
    except ImportError as exc:
        raise RuntimeError("PyYAML is required to run this script.") from exc

    try:
        meta = yaml.safe_load(parts[1]) or {}
    except yaml.YAMLError:
        meta = {}

    body = parts[2].lstrip("\n")
    return meta, body


def normalize_note_meta(meta: dict) -> dict:
    created_at = meta.get("created_at")
    tags = meta.get("tags", []) or []
    pinned = bool(meta.get("pinned", False))
    note_id = str(meta.get("note_id") or "")
    revision = parse_revision(meta.get("revision"))
    return {
        "note_id": note_id,
        "revision": revision,
        "created_at": created_at,
        "tags": tags if isinstance(tags, list) else [],
        "pinned": pinned,
    }


def parse_revision(value) -> int:
    try:
        parsed = int(value)
        return parsed if parsed > 0 else 1
    except (TypeError, ValueError):
        return 1


def collect_notes_recursive(base_dir: pathlib.Path) -> list[dict]:
    notes: list[dict] = []
    if not base_dir.exists():
        return notes

    for filepath in sorted(base_dir.rglob("*.md")):
        rel_path = filepath.relative_to(base_dir).as_posix()
        stat = filepath.stat()
        meta, body = parse_frontmatter(filepath)
        normalized_meta = normalize_note_meta(meta)

        created_at_val = stat.st_mtime
        created_at_raw = normalized_meta.get("created_at")
        if created_at_raw:
            try:
                created_at_val = datetime.fromisoformat(str(created_at_raw)).timestamp()
            except (TypeError, ValueError):
                pass

        basename = filepath.stem
        if "_" in basename and basename.split("_", 1)[0].isdigit():
            title = basename.split("_", 1)[1]
        else:
            title = basename

        notes.append({
            "note_id": normalized_meta["note_id"] or f"note_{filepath.stem}",
            "revision": normalized_meta["revision"],
            "filename": rel_path,
            "title": title,
            "created_at": int(created_at_val),
            "updated_at": int(stat.st_mtime),
            "content": body,
            "tags": [str(tag) for tag in normalized_meta["tags"]],
            "pinned": normalized_meta["pinned"],
        })

    return notes


def collect_referenced_attachments(notes: list[dict]) -> set[str]:
    filenames: set[str] = set()
    for note in notes:
        content = str(note.get("content") or "")
        for match in ATTACHMENT_URL_PATTERN.findall(content):
            filenames.add(pathlib.PurePosixPath(match).name)
    return filenames


def serialize_attachments(images_dir: pathlib.Path, filenames: set[str]) -> tuple[list[dict], list[str]]:
    attachments: list[dict] = []
    missing: list[str] = []

    for filename in sorted(filenames):
        filepath = images_dir / filename
        if not filepath.exists():
            missing.append(filename)
            continue

        mime_type, _ = mimetypes.guess_type(filepath.name)
        attachments.append({
            "filename": filepath.name,
            "mime_type": mime_type or "application/octet-stream",
            "data": list(filepath.read_bytes()),
        })

    return attachments, missing


def build_backup_payload(data_dir: pathlib.Path) -> tuple[dict, list[str]]:
    notes_dir = data_dir / "notes"
    trash_dir = data_dir / "trash"
    images_dir = data_dir / "images"

    notes = collect_notes_recursive(notes_dir)
    trash = collect_notes_recursive(trash_dir)
    referenced = collect_referenced_attachments(notes + trash)
    attachments, missing = serialize_attachments(images_dir, referenced)

    payload = {
        "format": "bemo-backup",
        "version": 2,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "notes": notes,
        "trash": trash,
        "attachments": attachments,
    }
    return payload, missing


def default_output_path(data_dir: pathlib.Path) -> pathlib.Path:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return data_dir / f"bemo_manual_migration_{stamp}.json"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Export legacy markdown notes/trash/images into a Bemo JSON backup.",
    )
    parser.add_argument(
        "--data-dir",
        default=str(REPO_ROOT / "backend" / "data"),
        help="Legacy data directory containing notes/, trash/, and images/.",
    )
    parser.add_argument(
        "--output",
        default="",
        help="Target JSON backup path. Defaults to <data-dir>/bemo_manual_migration_<timestamp>.json",
    )
    args = parser.parse_args(argv)

    raw_data_dir = pathlib.Path(args.data_dir)
    data_dir = raw_data_dir if raw_data_dir.is_absolute() else (REPO_ROOT / raw_data_dir).resolve()
    if not data_dir.exists():
        print(f"Data directory does not exist: {data_dir}", file=sys.stderr)
        return 1

    output_path = pathlib.Path(args.output).resolve() if args.output else default_output_path(data_dir)
    payload, missing = build_backup_payload(data_dir)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Exported backup: {output_path}")
    print(f"Notes: {len(payload['notes'])}")
    print(f"Trash: {len(payload['trash'])}")
    print(f"Attachments: {len(payload['attachments'])}")
    if missing:
        print("Missing attachments referenced by notes:", file=sys.stderr)
        for filename in missing:
            print(f"  - {filename}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
