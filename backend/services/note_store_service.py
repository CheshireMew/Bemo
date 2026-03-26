import json
import uuid
from typing import Any

from services import app_store_repository
from services.note_contract import (
    app_note_from_row,
    derive_note_title,
    normalize_note_attachments,
    normalize_note_tags,
    normalize_note_timestamp_iso,
    now_iso,
)
from services.service_errors import NotFoundError, ValidationError


def list_active_notes() -> list[dict[str, Any]]:
    return [_row_to_note(row) for row in app_store_repository.list_notes(deleted=False)]


def list_trash_notes() -> list[dict[str, Any]]:
    return [_row_to_note(row) for row in app_store_repository.list_notes(deleted=True)]


def search_active_notes(query: str) -> list[dict[str, Any]]:
    return [_row_to_note(row) for row in app_store_repository.search_active_notes(query)]


def create_note(
    *,
    content: str,
    tags: list[str] | None = None,
    attachments: list[dict[str, str]] | None = None,
    created_at: str | None = None,
    pinned: bool = False,
    revision: int = 1,
) -> dict[str, Any]:
    created_at_iso = normalize_note_timestamp_iso(created_at)
    updated_at_iso = now_iso()
    note = {
        "note_id": _note_id(),
        "filename": _build_filename(content),
        "title": derive_note_title(content),
        "content": str(content or ""),
        "tags_json": json.dumps(normalize_note_tags(tags), ensure_ascii=False),
        "attachments_json": json.dumps(normalize_note_attachments(attachments), ensure_ascii=False),
        "pinned": bool(pinned),
        "revision": max(1, int(revision or 1)),
        "created_at": created_at_iso,
        "updated_at": updated_at_iso,
        "deleted_at": None,
    }
    app_store_repository.upsert_note(note)
    return _require_note_any(str(note["note_id"]))


def update_note(
    note_id: str,
    *,
    content: str,
    tags: list[str] | None = None,
    attachments: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    current = _require_note(note_id)
    note = _row_payload_from_note(current)
    note.update(
        {
            "title": derive_note_title(content),
            "content": str(content or ""),
            "tags_json": json.dumps(normalize_note_tags(tags), ensure_ascii=False),
            "attachments_json": json.dumps(normalize_note_attachments(attachments), ensure_ascii=False),
            "revision": current["revision"] + 1,
            "updated_at": now_iso(),
            "deleted_at": None,
        }
    )
    app_store_repository.upsert_note(note)
    return _require_note(note_id)


def patch_note(note_id: str, *, pinned: bool | None = None, tags: list[str] | None = None) -> dict[str, Any]:
    current = _require_note(note_id)
    note = _row_payload_from_note(current)
    note.update(
        {
            "pinned": current["pinned"] if pinned is None else bool(pinned),
            "tags_json": json.dumps(
                current["tags"] if tags is None else normalize_note_tags(tags),
                ensure_ascii=False,
            ),
            "revision": current["revision"] + 1,
            "updated_at": now_iso(),
            "deleted_at": None,
        }
    )
    app_store_repository.upsert_note(note)
    return _require_note(note_id)


def trash_note(note_id: str) -> dict[str, Any]:
    current = _require_note(note_id)
    note = _row_payload_from_note(current)
    note.update(
        {
            "revision": current["revision"] + 1,
            "updated_at": now_iso(),
            "deleted_at": now_iso(),
        }
    )
    app_store_repository.upsert_note(note)
    return _require_note(note_id, expect_deleted=True)


def restore_note(note_id: str) -> dict[str, Any]:
    current = _require_note(note_id, expect_deleted=True)
    note = _row_payload_from_note(current)
    note.update(
        {
            "revision": current["revision"] + 1,
            "updated_at": now_iso(),
            "deleted_at": None,
        }
    )
    app_store_repository.upsert_note(note)
    return _require_note(note_id)


def purge_note(note_id: str) -> None:
    _require_note_any(note_id)
    app_store_repository.delete_note(note_id)


def empty_trash() -> int:
    trash = list_trash_notes()
    for note in trash:
        app_store_repository.delete_note(str(note["note_id"]))
    return len(trash)


def _require_note(note_id: str, *, expect_deleted: bool = False) -> dict[str, Any]:
    note = _find_note(note_id)
    if not note:
        raise NotFoundError("Note not found")
    is_deleted = bool(note["deleted_at"])
    if expect_deleted and not is_deleted:
        raise ValidationError("Note is not in trash")
    if not expect_deleted and is_deleted:
        raise ValidationError("Note is in trash")
    return note


def _require_note_any(note_id: str) -> dict[str, Any]:
    note = _find_note(note_id)
    if not note:
        raise NotFoundError("Note not found")
    return note


def _find_note(note_id: str) -> dict[str, Any] | None:
    row = app_store_repository.get_note(note_id)
    return _row_to_note(row) if row else None


def _row_payload_from_note(note: dict[str, Any]) -> dict[str, Any]:
    return {
        "note_id": str(note["note_id"]),
        "filename": str(note["filename"] or ""),
        "title": str(note["title"] or derive_note_title(str(note["content"] or ""))),
        "content": str(note["content"] or ""),
        "tags_json": json.dumps(normalize_note_tags(note["tags"]), ensure_ascii=False),
        "attachments_json": json.dumps(normalize_note_attachments(note.get("attachments")), ensure_ascii=False),
        "pinned": bool(note["pinned"]),
        "revision": int(note["revision"] or 1),
        "created_at": normalize_note_timestamp_iso(note["created_at"]),
        "updated_at": normalize_note_timestamp_iso(note["updated_at"]),
        "deleted_at": normalize_note_timestamp_iso(note["deleted_at"]) if note.get("deleted_at") else None,
    }


def _row_to_note(row: Any) -> dict[str, Any]:
    return app_note_from_row(row)


def _slugify_title(content: str) -> str:
    raw = derive_note_title(content)
    cleaned = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "-" for ch in raw)
    cleaned = "-".join(part for part in cleaned.split("-") if part).lower()
    return cleaned or "note"


def _build_filename(content: str) -> str:
    return f"{_unix_timestamp_seconds()}-{_slugify_title(content)}.md"


def _note_id() -> str:
    return f"app_{uuid.uuid4().hex}"


def _unix_timestamp_seconds() -> int:
    import time

    return int(time.time())
