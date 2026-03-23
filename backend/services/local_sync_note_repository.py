import os
from datetime import datetime
from typing import Any

from core.paths import IMAGES_DIR, NOTES_DIR, TRASH_DIR, TZ
from services import note_index_repository
from services.note_repository import (
    apply_note_update_by_id,
    cleanup_empty_dirs,
    create_note_with_metadata,
    find_note_by_id,
    generate_note_id,
    get_note,
)
from services.trash_service import move_note_to_trash, permanent_delete, restore_note


def apply_change(change: dict[str, Any]) -> dict[str, Any]:
    change_type = str(change.get("type") or "")
    note_id = str(change.get("entity_id") or "")
    operation_id = str(change.get("operation_id") or "")
    payload = change.get("payload") or {}
    base_revision = _int_or_none(change.get("base_revision"))

    active_filename, _active_path = find_note_by_id(NOTES_DIR, note_id)
    trash_filename, _trash_path = find_note_by_id(TRASH_DIR, note_id)

    if change_type == "note.create":
        if active_filename:
            return {"status": "applied", "note_id": note_id, "filename": active_filename}
        if trash_filename:
            restore_note(trash_filename, notes_dir=NOTES_DIR, trash_dir=TRASH_DIR)
            updated = _apply_active_snapshot(note_id, payload)
            return {"status": "applied", "note_id": note_id, "filename": updated["filename"]}
        created = _create_note_in_dir(NOTES_DIR, note_id, payload)
        return {"status": "applied", "note_id": created["note_id"], "filename": created["filename"]}

    if change_type == "note.update":
        if not active_filename:
            return {"status": "conflict", "note_id": note_id, "operation_id": operation_id, "reason": "local_note_not_found"}

        local_note = _read_local_note(NOTES_DIR, note_id, active_filename)
        local_revision = int(local_note["meta"]["revision"])
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
            patched = _apply_active_snapshot(note_id, payload)
            return {
                "status": "conflict",
                "note_id": note_id,
                "operation_id": operation_id,
                "reason": "revision_conflict",
                "conflict_copy_filename": conflict_copy["filename"],
                "applied_filename": patched["filename"],
            }

        updated = _apply_active_snapshot(note_id, payload)
        return {"status": "applied", "note_id": note_id, "filename": updated["filename"]}

    if change_type == "note.patch":
        if not active_filename:
            return {"status": "conflict", "note_id": note_id, "operation_id": operation_id, "reason": "local_note_not_found"}

        local_note = _read_local_note(NOTES_DIR, note_id, active_filename)
        local_revision = int(local_note["meta"]["revision"])
        if _has_patch_conflict(local_note["meta"], base_revision, payload):
            return {
                "status": "conflict",
                "note_id": note_id,
                "operation_id": operation_id,
                "reason": "revision_conflict",
            }

        updated = apply_note_update_by_id(
            NOTES_DIR,
            note_id=note_id,
            tags=list(payload.get("tags")) if payload.get("tags") is not None else None,
            pinned=payload.get("pinned"),
            revision=max(local_revision + 1, int(payload.get("revision") or local_revision + 1)),
        )
        return {"status": "applied", "note_id": note_id, "filename": updated["filename"]}

    if change_type in {"note.trash", "note.delete"}:
        if active_filename:
            local_note = _read_local_note(NOTES_DIR, note_id, active_filename)
            local_revision = int(local_note["meta"]["revision"])
            if base_revision is not None and local_revision > base_revision:
                return {
                    "status": "conflict",
                    "note_id": note_id,
                    "operation_id": operation_id,
                    "reason": "revision_conflict",
                }
            move_note_to_trash(active_filename, notes_dir=NOTES_DIR, trash_dir=TRASH_DIR)
            trash_filename, _trash_path = find_note_by_id(TRASH_DIR, note_id)

        if trash_filename:
            if change_type == "note.delete" and not payload:
                return {"status": "applied", "note_id": note_id, "filename": trash_filename}
            updated = _apply_trash_snapshot(note_id, payload)
            return {"status": "applied", "note_id": note_id, "filename": updated["filename"]}

        if change_type == "note.delete":
            return {"status": "applied", "note_id": note_id, "operation_id": operation_id, "noop": True}

        created = _create_note_in_dir(TRASH_DIR, note_id, payload)
        return {"status": "applied", "note_id": note_id, "filename": created["filename"]}

    if change_type == "note.restore":
        if trash_filename:
            restore_note(trash_filename, notes_dir=NOTES_DIR, trash_dir=TRASH_DIR)
            active_filename, _active_path = find_note_by_id(NOTES_DIR, note_id)
        if active_filename:
            updated = _apply_active_snapshot(note_id, payload)
            return {"status": "applied", "note_id": note_id, "filename": updated["filename"]}
        created = _create_note_in_dir(NOTES_DIR, note_id, payload)
        return {"status": "applied", "note_id": note_id, "filename": created["filename"]}

    if change_type == "note.purge":
        if trash_filename:
            permanent_delete(trash_filename, trash_dir=TRASH_DIR, notes_dir=NOTES_DIR, images_dir=IMAGES_DIR)
            return {"status": "applied", "note_id": note_id, "filename": trash_filename}
        if active_filename:
            full_path = os.path.join(NOTES_DIR, active_filename)
            if os.path.exists(full_path):
                os.remove(full_path)
                cleanup_empty_dirs(os.path.dirname(full_path), NOTES_DIR)
                note_index_repository.remove_note_path(note_id)
            return {"status": "applied", "note_id": note_id, "filename": active_filename}
        return {"status": "applied", "note_id": note_id, "operation_id": operation_id, "noop": True}

    return {"status": "conflict", "note_id": note_id, "operation_id": operation_id, "reason": "unsupported_change_type"}


def _apply_active_snapshot(note_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    revision = max(1, int(payload.get("revision") or 1))
    existing_filename, _existing_path = find_note_by_id(NOTES_DIR, note_id)
    if existing_filename:
        return apply_note_update_by_id(
            NOTES_DIR,
            note_id=note_id,
            content=str(payload.get("content") or ""),
            tags=list(payload.get("tags") or []),
            pinned=bool(payload.get("pinned", False)),
            revision=revision,
        )
    return _create_note_in_dir(NOTES_DIR, note_id, payload)


def _apply_trash_snapshot(note_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    revision = max(1, int(payload.get("revision") or 1))
    existing_filename, _existing_path = find_note_by_id(TRASH_DIR, note_id)
    if existing_filename:
        return apply_note_update_by_id(
            TRASH_DIR,
            note_id=note_id,
            content=str(payload.get("content") or ""),
            tags=list(payload.get("tags") or []),
            pinned=bool(payload.get("pinned", False)),
            revision=revision,
        )
    return _create_note_in_dir(TRASH_DIR, note_id, payload)


def _create_note_in_dir(base_dir: str, note_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    created_at_raw = str(payload.get("created_at") or _now_iso())
    created_at = datetime.fromisoformat(created_at_raw)
    return create_note_with_metadata(
        base_dir,
        content=str(payload.get("content") or ""),
        tags=list(payload.get("tags") or []),
        pinned=bool(payload.get("pinned", False)),
        created_at=created_at,
        note_id=note_id or generate_note_id(),
        revision=max(1, int(payload.get("revision") or 1)),
    )


def _read_local_note(base_dir: str, note_id: str, filename: str) -> dict[str, Any]:
    data = get_note(base_dir, filename)
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


def _has_patch_conflict(local_meta: dict[str, Any], base_revision: int | None, payload: dict[str, Any]) -> bool:
    local_revision = int(local_meta.get("revision") or 1)
    if base_revision is None or local_revision <= base_revision:
        return False
    if "pinned" in payload and bool(payload.get("pinned")) != bool(local_meta.get("pinned", False)):
        return True
    if "tags" in payload and list(payload.get("tags") or []) != list(local_meta.get("tags") or []):
        return True
    return False
