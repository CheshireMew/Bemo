import os
import uuid
from datetime import datetime

import yaml

from services import note_index_repository
from services.service_errors import NotFoundError


def parse_frontmatter(filepath: str) -> tuple[dict, str]:
    with open(filepath, "r", encoding="utf-8") as file:
        raw = file.read()

    if not raw.startswith("---"):
        return {}, raw

    parts = raw.split("---", 2)
    if len(parts) < 3:
        return {}, raw

    try:
        meta = yaml.safe_load(parts[1]) or {}
    except yaml.YAMLError:
        meta = {}

    body = parts[2].lstrip("\n")
    return meta, body


def build_frontmatter(created_at: str, tags: list, pinned: bool) -> str:
    return build_note_frontmatter(
        note_id=generate_note_id(),
        revision=1,
        created_at=created_at,
        tags=tags,
        pinned=pinned,
    )


def generate_note_id() -> str:
    return f"note_{uuid.uuid4().hex}"


def build_note_frontmatter(*, note_id: str, revision: int, created_at: str, tags: list, pinned: bool) -> str:
    meta = {
        "note_id": note_id,
        "revision": revision,
        "created_at": created_at,
        "tags": tags,
        "pinned": pinned,
    }
    return "---\n" + yaml.dump(meta, allow_unicode=True, default_flow_style=False).strip() + "\n---\n"


def sanitize_title(title: str) -> str:
    invalid = '<>:"/\\|?*'
    result = title
    for ch in invalid:
        result = result.replace(ch, "_")
    return result.strip() or "untitled"


def collect_notes_recursive(base_dir: str) -> list[dict]:
    notes = []
    if not os.path.exists(base_dir):
        return notes

    for root, _dirs, files in os.walk(base_dir):
        for filename in files:
            if not filename.endswith(".md"):
                continue

            filepath = os.path.join(root, filename)
            rel_path = os.path.relpath(filepath, base_dir).replace("\\", "/")
            stat = os.stat(filepath)
            meta, body = parse_frontmatter(filepath)
            normalized_meta = normalize_note_meta(meta)

            created_at_val = stat.st_mtime
            if normalized_meta.get("created_at"):
                try:
                    dt = datetime.fromisoformat(str(normalized_meta["created_at"]))
                    created_at_val = dt.timestamp()
                except (ValueError, TypeError):
                    pass

            basename = filename[:-3]
            if "_" in basename and basename.split("_")[0].isdigit():
                title = "_".join(basename.split("_")[1:])
            else:
                title = basename

            notes.append({
                "note_id": normalized_meta["note_id"],
                "revision": normalized_meta["revision"],
                "filename": rel_path,
                "title": title,
                "created_at": created_at_val,
                "updated_at": stat.st_mtime,
                "content": body,
                "tags": normalized_meta["tags"],
                "pinned": normalized_meta["pinned"],
            })

    return notes


def resolve_markdown_path(base_dir: str, filepath: str) -> str:
    normalized = filepath if filepath.endswith(".md") else f"{filepath}.md"
    full_path = os.path.join(base_dir, normalized)
    if not os.path.exists(full_path):
        raise NotFoundError("Note not found")
    return normalized, full_path


def find_note_by_id(base_dir: str, note_id: str) -> tuple[str, str] | tuple[None, None]:
    indexed_filename = note_index_repository.get_note_path(note_id)
    if indexed_filename:
        full_path = os.path.join(base_dir, indexed_filename)
        if os.path.exists(full_path):
            return indexed_filename, full_path
        note_index_repository.remove_note_path(note_id)

    for note in collect_notes_recursive(base_dir):
        if note.get("note_id") == note_id:
            normalized = note["filename"]
            full_path = os.path.join(base_dir, normalized)
            if os.path.exists(full_path):
                note_index_repository.upsert_note_path(note_id, normalized)
                return normalized, full_path
    return None, None


def create_note(notes_dir: str, tz, content: str, tags: list[str] | None) -> dict:
    now = datetime.now(tz)
    return create_note_with_metadata(
        notes_dir,
        content=content,
        tags=tags or [],
        pinned=False,
        created_at=now,
        note_id=generate_note_id(),
        revision=1,
    )


def get_note(notes_dir: str, filepath: str) -> dict:
    normalized, full_path = resolve_markdown_path(notes_dir, filepath)
    meta, body = parse_frontmatter(full_path)
    meta = normalize_note_meta(meta)
    return {"filename": normalized, "content": body, "meta": meta}


def update_note(notes_dir: str, filepath: str, *, content: str, tags: list[str] | None, tz) -> dict:
    normalized, full_path = resolve_markdown_path(notes_dir, filepath)
    meta, _ = parse_frontmatter(full_path)
    normalized_meta = normalize_note_meta(meta)
    created_at_str = str(meta.get("created_at", datetime.now(tz).isoformat()))
    next_tags = tags if tags is not None else (meta.get("tags") or [])
    pinned = meta.get("pinned", False)
    next_revision = normalized_meta["revision"] + 1

    frontmatter = build_note_frontmatter(
        note_id=normalized_meta["note_id"],
        revision=next_revision,
        created_at=created_at_str,
        tags=next_tags,
        pinned=pinned,
    )
    with open(full_path, "w", encoding="utf-8") as file:
        file.write(frontmatter + content)

    return {
        "message": "Note updated",
        "filename": normalized,
        "note_id": normalized_meta["note_id"],
        "revision": next_revision,
    }


def patch_note(notes_dir: str, filepath: str, *, pinned: bool | None, tags: list[str] | None, tz) -> dict:
    normalized, full_path = resolve_markdown_path(notes_dir, filepath)
    meta, body = parse_frontmatter(full_path)
    normalized_meta = normalize_note_meta(meta)
    created_at_str = str(meta.get("created_at", datetime.now(tz).isoformat()))
    next_tags = tags if tags is not None else (meta.get("tags") or [])
    next_pinned = pinned if pinned is not None else meta.get("pinned", False)
    next_revision = normalized_meta["revision"] + 1

    frontmatter = build_note_frontmatter(
        note_id=normalized_meta["note_id"],
        revision=next_revision,
        created_at=created_at_str,
        tags=next_tags,
        pinned=next_pinned,
    )
    with open(full_path, "w", encoding="utf-8") as file:
        file.write(frontmatter + body)

    return {
        "message": "Note patched",
        "note_id": normalized_meta["note_id"],
        "revision": next_revision,
        "pinned": next_pinned,
        "tags": next_tags,
    }


def create_note_with_metadata(
    notes_dir: str,
    *,
    content: str,
    tags: list[str],
    pinned: bool,
    created_at: datetime,
    note_id: str,
    revision: int,
    title_override: str | None = None,
) -> dict:
    timestamp = int(created_at.timestamp())
    date_dir = created_at.strftime("%Y/%m/%d")
    target_dir = os.path.join(notes_dir, date_dir)
    os.makedirs(target_dir, exist_ok=True)

    first_line = content.strip().split("\n")[0][:20].strip()
    if first_line.startswith("#"):
        first_line = first_line.lstrip("#").strip()
    title = sanitize_title(title_override or first_line) if (title_override or first_line) else "untitled"

    filename = f"{timestamp}_{title}.md"
    filepath = os.path.join(target_dir, filename)
    if os.path.exists(filepath):
        filename = f"{timestamp}_{title}_{note_id[-8:]}.md"
        filepath = os.path.join(target_dir, filename)

    frontmatter = build_note_frontmatter(
        note_id=note_id,
        revision=revision,
        created_at=created_at.isoformat(),
        tags=tags,
        pinned=pinned,
    )
    with open(filepath, "w", encoding="utf-8") as file:
        file.write(frontmatter + content)

    relative_filename = f"{date_dir}/{filename}"
    note_index_repository.upsert_note_path(note_id, relative_filename)

    return {
        "message": "Note created",
        "filename": relative_filename,
        "note_id": note_id,
        "revision": revision,
    }


def apply_note_update_by_id(
    notes_dir: str,
    *,
    note_id: str,
    content: str | None = None,
    tags: list[str] | None = None,
    pinned: bool | None = None,
    revision: int | None = None,
) -> dict:
    normalized, full_path = find_note_by_id(notes_dir, note_id)
    if not normalized or not full_path:
        raise NotFoundError("Note not found")

    meta, body = parse_frontmatter(full_path)
    normalized_meta = normalize_note_meta(meta)
    next_tags = tags if tags is not None else normalized_meta["tags"]
    next_pinned = normalized_meta["pinned"] if pinned is None else pinned
    next_revision = revision if revision is not None else normalized_meta["revision"] + 1
    next_content = body if content is None else content
    created_at = str(normalized_meta.get("created_at") or datetime.now().isoformat())

    frontmatter = build_note_frontmatter(
        note_id=normalized_meta["note_id"],
        revision=next_revision,
        created_at=created_at,
        tags=next_tags,
        pinned=next_pinned,
    )
    with open(full_path, "w", encoding="utf-8") as file:
        file.write(frontmatter + next_content)

    note_index_repository.upsert_note_path(normalized_meta["note_id"], normalized)

    return {
        "filename": normalized,
        "note_id": normalized_meta["note_id"],
        "revision": next_revision,
        "content": next_content,
        "tags": next_tags,
        "pinned": next_pinned,
    }


def normalize_note_meta(meta: dict) -> dict:
    created_at = meta.get("created_at")
    tags = meta.get("tags", []) or []
    pinned = bool(meta.get("pinned", False))
    note_id = str(meta.get("note_id") or generate_note_id())
    revision = _parse_revision(meta.get("revision"))
    return {
        "note_id": note_id,
        "revision": revision,
        "created_at": created_at,
        "tags": tags,
        "pinned": pinned,
    }


def _parse_revision(value) -> int:
    try:
        parsed = int(value)
        return parsed if parsed > 0 else 1
    except (TypeError, ValueError):
        return 1


def cleanup_empty_dirs(start_dir: str, stop_dir: str):
    parent = start_dir
    while parent != stop_dir and os.path.isdir(parent):
        if not os.listdir(parent):
            os.rmdir(parent)
            parent = os.path.dirname(parent)
        else:
            break
