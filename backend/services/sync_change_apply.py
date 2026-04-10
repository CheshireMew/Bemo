import json
import sqlite3
from typing import Any

from services.note_contract import (
    derive_note_title,
    normalize_note_attachments,
    normalize_note_tags,
    now_iso,
)
from services.sync_store_repository import connect, ensure_sync_store, has_blob_record, get_blob_record
from services import app_store_repository


def apply_remote_change(change: dict[str, Any]) -> dict[str, Any]:
    ensure_sync_store()
    with connect() as conn:
        return _apply_remote_change(conn, change)


def _apply_remote_change(conn: sqlite3.Connection, change: dict[str, Any]) -> dict[str, Any]:
    change_type = str(change.get("type") or "")
    note_id = str(change.get("entity_id") or "")
    device_id = str(change.get("device_id") or "unknown-device")
    operation_id = str(change.get("operation_id") or "")
    payload = change.get("payload") or {}
    current = conn.execute("SELECT * FROM notes_current WHERE note_id = ?", (note_id,)).fetchone()

    if change_type == "note.create":
        return _apply_create(conn, note_id, device_id, operation_id, payload, change, current)

    if change_type not in {"note.trash", "note.delete", "note.restore", "note.purge"} and (not current or current["deleted_at"]):
        return {"status": "conflict", "operation_id": operation_id, "reason": "note_not_found"}

    current_revision = int(current["revision"] or 1) if current else 0
    base_revision = _int_or_none(change.get("base_revision"))

    if change_type == "note.update":
        return _apply_update(conn, note_id, device_id, operation_id, payload, change, current, current_revision, base_revision)
    if change_type == "note.patch":
        return _apply_patch(conn, note_id, device_id, operation_id, payload, change, current, current_revision, base_revision)
    if change_type in {"note.trash", "note.delete"}:
        return _apply_trash(conn, note_id, device_id, operation_id, payload, change, current, current_revision, base_revision)
    if change_type == "note.restore":
        return _apply_restore(conn, note_id, device_id, operation_id, payload, change, current)
    if change_type == "note.purge":
        return _apply_purge(conn, note_id, payload, change, current)

    return {"status": "conflict", "operation_id": operation_id, "reason": "unsupported_change_type"}


def _apply_create(
    conn: sqlite3.Connection,
    note_id: str,
    device_id: str,
    operation_id: str,
    payload: dict[str, Any],
    change: dict[str, Any],
    current: sqlite3.Row | None,
) -> dict[str, Any]:
    if current and not current["deleted_at"]:
        return {"status": "conflict", "operation_id": operation_id, "reason": "note_exists"}
    revision = max(1, int(payload.get("revision") or 1))
    normalized = _normalize_note_payload(payload, current)
    conn.execute(
        """
        INSERT OR REPLACE INTO notes_current (
            note_id, filename, title, content, tags_json, attachments_json, pinned, revision,
            created_at, updated_at, deleted_at, last_operation_id, last_device_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
        """,
        (
            note_id,
            normalized["filename"],
            normalized["title"],
            normalized["content"],
            json.dumps(normalized["tags"], ensure_ascii=False),
            json.dumps(normalized["attachments"], ensure_ascii=False),
            1 if normalized["pinned"] else 0,
            revision,
            normalized["created_at"],
            now_iso(),
            operation_id,
            device_id,
        ),
    )
    return _applied_result(change, note_id, revision, {**normalized, "revision": revision})


def _apply_update(
    conn: sqlite3.Connection,
    note_id: str,
    device_id: str,
    operation_id: str,
    payload: dict[str, Any],
    change: dict[str, Any],
    current: sqlite3.Row,
    current_revision: int,
    base_revision: int | None,
) -> dict[str, Any]:
    normalized = _normalize_note_payload(payload, current)
    current_tags = _current_tags(current)
    next_tags = normalized["tags"]
    if (
        base_revision is not None
        and base_revision != current_revision
        and (
            normalized["content"] != str(current["content"])
            or next_tags != current_tags
        )
    ):
        return _revision_conflict(operation_id, note_id, current_revision)

    next_revision = current_revision + 1
    conn.execute(
        """
        UPDATE notes_current
        SET content = ?, tags_json = ?, attachments_json = ?, revision = ?, updated_at = ?, last_operation_id = ?, last_device_id = ?
        WHERE note_id = ?
        """,
        (
            normalized["content"],
            json.dumps(next_tags, ensure_ascii=False),
            json.dumps(normalized["attachments"], ensure_ascii=False),
            next_revision,
            now_iso(),
            operation_id,
            device_id,
            note_id,
        ),
    )
    return _applied_result(change, note_id, next_revision, {**normalized, "revision": next_revision})


def _apply_patch(
    conn: sqlite3.Connection,
    note_id: str,
    device_id: str,
    operation_id: str,
    payload: dict[str, Any],
    change: dict[str, Any],
    current: sqlite3.Row,
    current_revision: int,
    base_revision: int | None,
) -> dict[str, Any]:
    if _has_patch_conflict(current, base_revision, payload):
        return _revision_conflict(operation_id, note_id, current_revision)

    next_revision = current_revision + 1
    normalized = _normalize_note_payload(payload, current)
    conn.execute(
        """
        UPDATE notes_current
        SET pinned = ?, tags_json = ?, revision = ?, updated_at = ?, last_operation_id = ?, last_device_id = ?
        WHERE note_id = ?
        """,
        (
            1 if normalized["pinned"] else 0,
            json.dumps(normalized["tags"], ensure_ascii=False),
            next_revision,
            now_iso(),
            operation_id,
            device_id,
            note_id,
        ),
    )
    return _applied_result(change, note_id, next_revision, {**normalized, "revision": next_revision})


def _apply_trash(
    conn: sqlite3.Connection,
    note_id: str,
    device_id: str,
    operation_id: str,
    payload: dict[str, Any],
    change: dict[str, Any],
    current: sqlite3.Row | None,
    current_revision: int,
    base_revision: int | None,
) -> dict[str, Any]:
    if current and base_revision is not None and current_revision > base_revision:
        return _revision_conflict(operation_id, note_id, current_revision)

    next_revision = (int(current["revision"] or 0) + 1) if current else max(1, int(payload.get("revision") or 1))
    normalized = _normalize_note_payload(payload, current)
    conn.execute(
        """
        INSERT OR REPLACE INTO notes_current (
            note_id, filename, title, content, tags_json, attachments_json, pinned, revision,
            created_at, updated_at, deleted_at, last_operation_id, last_device_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            note_id,
            normalized["filename"],
            normalized["title"],
            normalized["content"],
            json.dumps(normalized["tags"], ensure_ascii=False),
            json.dumps(normalized["attachments"], ensure_ascii=False),
            1 if normalized["pinned"] else 0,
            next_revision,
            normalized["created_at"],
            now_iso(),
            now_iso(),
            operation_id,
            device_id,
        ),
    )
    return _applied_result(
        {**change, "type": "note.trash"},
        note_id,
        next_revision,
        {
            **payload,
            **normalized,
            "revision": next_revision,
        },
    )


def _apply_restore(
    conn: sqlite3.Connection,
    note_id: str,
    device_id: str,
    operation_id: str,
    payload: dict[str, Any],
    change: dict[str, Any],
    current: sqlite3.Row | None,
) -> dict[str, Any]:
    next_revision = (int(current["revision"] or 0) + 1) if current else max(1, int(payload.get("revision") or 1))
    normalized = _normalize_note_payload(payload, current)
    conn.execute(
        """
        INSERT OR REPLACE INTO notes_current (
            note_id, filename, title, content, tags_json, attachments_json, pinned, revision,
            created_at, updated_at, deleted_at, last_operation_id, last_device_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
        """,
        (
            note_id,
            normalized["filename"],
            normalized["title"],
            normalized["content"],
            json.dumps(normalized["tags"], ensure_ascii=False),
            json.dumps(normalized["attachments"], ensure_ascii=False),
            1 if normalized["pinned"] else 0,
            next_revision,
            normalized["created_at"],
            now_iso(),
            operation_id,
            device_id,
        ),
    )
    return _applied_result(change, note_id, next_revision, {
        **payload,
        **normalized,
        "revision": next_revision,
    })


def _apply_purge(
    conn: sqlite3.Connection,
    note_id: str,
    payload: dict[str, Any],
    change: dict[str, Any],
    current: sqlite3.Row | None,
) -> dict[str, Any]:
    if current:
        next_revision = int(current["revision"] or 1) + 1
        conn.execute("DELETE FROM notes_current WHERE note_id = ?", (note_id,))
    else:
        next_revision = max(1, int(payload.get("revision") or 1))
    return _applied_result(change, note_id, next_revision, {
        **payload,
        "revision": next_revision,
    })


def _normalize_note_payload(payload: dict[str, Any], current: sqlite3.Row | None) -> dict[str, Any]:
    content = str(payload.get("content") or (current["content"] if current else ""))
    tags = normalize_note_tags(payload.get("tags")) if payload.get("tags") is not None else _current_tags(current)
    attachments = (
        normalize_note_attachments(payload.get("attachments"))
        if payload.get("attachments") is not None
        else _current_attachments(current)
    )
    pinned = bool(payload.get("pinned", current["pinned"] if current else False))
    created_at = str(payload.get("created_at") or (current["created_at"] if current else now_iso()))
    return {
        "filename": str(payload.get("filename") or (current["filename"] if current else "")),
        "title": derive_note_title(content),
        "content": content,
        "tags": tags,
        "attachments": attachments,
        "pinned": pinned,
        "created_at": created_at,
    }


def _applied_result(
    change: dict[str, Any],
    note_id: str,
    revision: int,
    payload: dict[str, Any],
) -> dict[str, Any]:
    _project_to_app_store(str(change.get("type") or ""), note_id, payload, revision)
    stored_change = dict(change)
    stored_change["payload"] = payload
    return {"status": "applied", "note_id": note_id, "revision": revision, "change": stored_change}


def _project_to_app_store(
    change_type: str,
    note_id: str,
    payload: dict[str, Any],
    revision: int,
) -> None:
    if not note_id:
        return
    if change_type == "note.purge":
        app_store_repository.delete_note(note_id)
        return

    attachments = normalize_note_attachments(payload.get("attachments"))
    _ensure_app_attachments(attachments)

    content = str(payload.get("content") or "")
    created_at = str(payload.get("created_at") or now_iso())
    deleted_at = now_iso() if change_type == "note.trash" else None
    app_store_repository.upsert_note(
        {
            "note_id": note_id,
            "filename": str(payload.get("filename") or ""),
            "title": derive_note_title(content),
            "content": content,
            "tags_json": json.dumps(normalize_note_tags(payload.get("tags")), ensure_ascii=False),
            "attachments_json": json.dumps(attachments, ensure_ascii=False),
            "pinned": bool(payload.get("pinned")),
            "revision": revision,
            "created_at": created_at,
            "updated_at": now_iso(),
            "deleted_at": deleted_at,
        }
    )


def _ensure_app_attachments(attachments: list[dict[str, Any]] | None) -> None:
    if not attachments:
        return
    for item in attachments:
        filename = str(item.get("filename") or "")
        blob_hash = str(item.get("blob_hash") or "")
        mime_type = str(item.get("mime_type") or "application/octet-stream")
        if not filename or not blob_hash:
            continue

        if not app_store_repository.has_blob_record(blob_hash):
            if has_blob_record(blob_hash):
                data = get_blob_record(blob_hash)
                app_store_repository.put_blob_record(blob_hash, data)

        record = app_store_repository.get_attachment_record(filename)
        size = 0
        if not record or record.get("blob_hash") != blob_hash:
            if app_store_repository.has_blob_record(blob_hash):
                data = app_store_repository.get_blob_record(blob_hash)
                size = len(data)
            app_store_repository.upsert_attachment_record(
                filename, blob_hash, mime_type, size, now_iso()
            )


def _revision_conflict(operation_id: str, note_id: str, current_revision: int) -> dict[str, Any]:
    return {
        "status": "conflict",
        "operation_id": operation_id,
        "reason": "revision_conflict",
        "note_id": note_id,
        "current_revision": current_revision,
    }


def _current_tags(current: sqlite3.Row | None) -> list[str]:
    if not current:
        return []
    return normalize_note_tags(json.loads(current["tags_json"] or "[]"))


def _current_attachments(current: sqlite3.Row | None) -> list[dict[str, str]]:
    if not current:
        return []
    return normalize_note_attachments(json.loads(current["attachments_json"] or "[]"))


def _has_patch_conflict(current: sqlite3.Row, base_revision: int | None, payload: dict[str, Any]) -> bool:
    if base_revision is None or base_revision == int(current["revision"] or 1):
        return False
    if "pinned" in payload and bool(payload.get("pinned")) != bool(current["pinned"]):
        return True
    if "tags" not in payload:
        return False
    return payload.get("tags") != json.loads(current["tags_json"])


def _int_or_none(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None
