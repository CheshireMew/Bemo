from datetime import datetime
from typing import Any

from core.paths import NOTES_DIR, TZ, TRASH_DIR
from services.note_repository import (
    apply_note_update_by_id,
    create_note_with_metadata,
    find_note_by_id,
    generate_note_id,
    get_note,
)
from services.trash_service import move_note_to_trash


def apply_change(change: dict[str, Any]) -> dict[str, Any]:
    change_type = str(change.get("type") or "")
    note_id = str(change.get("entity_id") or "")
    operation_id = str(change.get("operation_id") or "")
    payload = change.get("payload") or {}
    base_revision = _int_or_none(change.get("base_revision"))

    if change_type == "note.create":
        existing_filename, _existing_path = find_note_by_id(NOTES_DIR, note_id)
        if existing_filename:
            return {"status": "applied", "note_id": note_id, "filename": existing_filename}
        created_at_raw = str(payload.get("created_at") or _now_iso())
        created_at = datetime.fromisoformat(created_at_raw)
        created = create_note_with_metadata(
            NOTES_DIR,
            content=str(payload.get("content") or ""),
            tags=list(payload.get("tags") or []),
            pinned=bool(payload.get("pinned", False)),
            created_at=created_at,
            note_id=note_id or generate_note_id(),
            revision=max(1, int(payload.get("revision") or 1)),
        )
        return {"status": "applied", "note_id": created["note_id"], "filename": created["filename"]}

    normalized, _full_path = find_note_by_id(NOTES_DIR, note_id)
    if not normalized:
        return {"status": "conflict", "note_id": note_id, "operation_id": operation_id, "reason": "local_note_not_found"}

    local_note = _read_local_note(note_id, normalized)
    local_revision = int(local_note["meta"]["revision"])

    if change_type == "note.update":
        remote_content = str(payload.get("content") or "")
        if base_revision is not None and local_revision > base_revision and local_note["content"] != remote_content:
            conflict_copy = create_note_with_metadata(
                NOTES_DIR,
                content=local_note["content"],
                tags=list(local_note["meta"].get("tags") or []),
                pinned=False,
                created_at=datetime.now(TZ),
                note_id=generate_note_id(),
                revision=1,
                title_override=f"冲突副本 - {_derive_local_title(local_note)}",
            )
            patched = apply_note_update_by_id(
                NOTES_DIR,
                note_id=note_id,
                content=remote_content,
                tags=list(payload.get("tags") or local_note["meta"].get("tags") or []),
                revision=max(local_revision + 1, int(payload.get("revision") or local_revision + 1)),
            )
            return {
                "status": "conflict",
                "note_id": note_id,
                "operation_id": operation_id,
                "reason": "revision_conflict",
                "conflict_copy_filename": conflict_copy["filename"],
                "applied_filename": patched["filename"],
            }
        updated = apply_note_update_by_id(
            NOTES_DIR,
            note_id=note_id,
            content=remote_content,
            tags=list(payload.get("tags") or local_note["meta"].get("tags") or []),
            revision=max(local_revision + 1, int(payload.get("revision") or local_revision + 1)),
        )
        return {"status": "applied", "note_id": note_id, "filename": updated["filename"]}

    if change_type == "note.patch":
        updated = apply_note_update_by_id(
            NOTES_DIR,
            note_id=note_id,
            tags=list(payload.get("tags")) if payload.get("tags") is not None else None,
            pinned=payload.get("pinned"),
            revision=max(local_revision + 1, int(payload.get("revision") or local_revision + 1)),
        )
        return {"status": "applied", "note_id": note_id, "filename": updated["filename"]}

    if change_type == "note.delete":
        move_note_to_trash(normalized, notes_dir=NOTES_DIR, trash_dir=TRASH_DIR)
        return {"status": "applied", "note_id": note_id, "filename": normalized}

    return {"status": "conflict", "note_id": note_id, "operation_id": operation_id, "reason": "unsupported_change_type"}


def _read_local_note(note_id: str, filename: str) -> dict[str, Any]:
    data = get_note(NOTES_DIR, filename)
    if data["meta"].get("note_id") != note_id:
        raise RuntimeError("Local note id mismatch during sync apply")
    return data


def _derive_local_title(local_note: dict[str, Any]) -> str:
    return str(local_note["meta"].get("title") or _derive_title(local_note["content"]))


def _derive_title(content: str) -> str:
    first_line = (content or "").strip().split("\n")[0][:20].strip()
    if first_line.startswith("#"):
        first_line = first_line.lstrip("#").strip()
    return first_line or "untitled"


def _now_iso() -> str:
    return datetime.now(TZ).isoformat()


def _int_or_none(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None
