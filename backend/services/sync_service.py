import json
import os
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

from core.paths import NOTES_DIR, SYNC_BLOBS_DIR, SYNC_DB_PATH, TZ, TRASH_DIR
from services.note_repository import (
    apply_note_update_by_id,
    create_note_with_metadata,
    find_note_by_id,
    generate_note_id,
    get_note,
)
from services.trash_service import move_note_to_trash


def ensure_sync_store() -> None:
    os.makedirs(SYNC_BLOBS_DIR, exist_ok=True)
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS notes_current (
                note_id TEXT PRIMARY KEY,
                filename TEXT,
                title TEXT,
                content TEXT NOT NULL,
                tags_json TEXT NOT NULL,
                pinned INTEGER NOT NULL,
                revision INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                deleted_at TEXT,
                last_operation_id TEXT,
                last_device_id TEXT
            );
            CREATE TABLE IF NOT EXISTS changes (
                cursor INTEGER PRIMARY KEY AUTOINCREMENT,
                operation_id TEXT NOT NULL UNIQUE,
                note_id TEXT NOT NULL,
                device_id TEXT NOT NULL,
                change_type TEXT NOT NULL,
                base_revision INTEGER,
                change_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS applied_operations (
                operation_id TEXT PRIMARY KEY,
                cursor INTEGER,
                applied_at TEXT NOT NULL
            );
            """
        )


def get_sync_info() -> dict[str, Any]:
    ensure_sync_store()
    with _connect() as conn:
        row = conn.execute("SELECT COALESCE(MAX(cursor), 0) AS latest_cursor FROM changes").fetchone()
        latest_cursor = int(row["latest_cursor"]) if row else 0
    return {
        "format_version": 1,
        "latest_cursor": str(latest_cursor),
        "blob_prefix": "/api/sync/blobs",
    }


def push_changes(changes: list[dict[str, Any]]) -> dict[str, Any]:
    ensure_sync_store()
    accepted: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []

    with _connect() as conn:
        for change in changes:
            operation_id = str(change.get("operation_id") or "")
            if not operation_id:
                conflicts.append({"operation_id": "", "reason": "missing_operation_id"})
                continue

            existing = conn.execute(
                "SELECT cursor FROM applied_operations WHERE operation_id = ?",
                (operation_id,),
            ).fetchone()
            if existing:
                accepted.append({
                    "operation_id": operation_id,
                    "cursor": str(existing["cursor"] or 0),
                    "duplicate": True,
                })
                continue

            result = _apply_remote_change(conn, change)
            if result["status"] == "conflict":
                conflicts.append(result)
                continue
            stored_change = result["change"]

            cursor = conn.execute(
                """
                INSERT INTO changes (
                    operation_id, note_id, device_id, change_type, base_revision, change_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    operation_id,
                    str(change.get("entity_id") or ""),
                    str(change.get("device_id") or "unknown-device"),
                    str(change.get("type") or ""),
                    _int_or_none(change.get("base_revision")),
                    json.dumps(stored_change, ensure_ascii=False),
                    _now_iso(),
                ),
            ).lastrowid
            conn.execute(
                "INSERT INTO applied_operations (operation_id, cursor, applied_at) VALUES (?, ?, ?)",
                (operation_id, cursor, _now_iso()),
            )
            accepted.append({
                "operation_id": operation_id,
                "cursor": str(cursor),
                    "note_id": result["note_id"],
                    "revision": result["revision"],
                "change": stored_change,
            })

    return {
        "accepted": accepted,
        "conflicts": conflicts,
        "latest_cursor": get_sync_info()["latest_cursor"],
    }


def pull_changes(cursor: str | None, limit: int = 200) -> dict[str, Any]:
    ensure_sync_store()
    since = int(cursor or "0")
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT cursor, change_json
            FROM changes
            WHERE cursor > ?
            ORDER BY cursor ASC
            LIMIT ?
            """,
            (since, limit),
        ).fetchall()
    changes = []
    latest_cursor = since
    for row in rows:
        latest_cursor = int(row["cursor"])
        payload = json.loads(row["change_json"])
        payload["cursor"] = str(row["cursor"])
        changes.append(payload)
    return {
        "changes": changes,
        "latest_cursor": str(latest_cursor),
        "missing_blob_hashes": [],
    }


def has_blob(blob_hash: str) -> bool:
    return _blob_path(blob_hash).exists()


def put_blob(blob_hash: str, data: bytes) -> None:
    path = _blob_path(blob_hash)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def get_blob(blob_hash: str) -> bytes:
    return _blob_path(blob_hash).read_bytes()


def apply_local_changes(changes: list[dict[str, Any]]) -> dict[str, Any]:
    ensure_sync_store()
    applied: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []

    for change in changes:
        result = _apply_local_change(change)
        if result["status"] == "conflict":
            conflicts.append(result)
        else:
            applied.append(result)
    return {"applied": applied, "conflicts": conflicts}


def _apply_remote_change(conn: sqlite3.Connection, change: dict[str, Any]) -> dict[str, Any]:
    change_type = str(change.get("type") or "")
    note_id = str(change.get("entity_id") or "")
    device_id = str(change.get("device_id") or "unknown-device")
    operation_id = str(change.get("operation_id") or "")
    payload = change.get("payload") or {}
    current = conn.execute("SELECT * FROM notes_current WHERE note_id = ?", (note_id,)).fetchone()

    if change_type == "note.create":
        if current and not current["deleted_at"]:
            return {"status": "conflict", "operation_id": operation_id, "reason": "note_exists"}
        content = str(payload.get("content") or "")
        tags = payload.get("tags") or []
        pinned = bool(payload.get("pinned", False))
        created_at = str(payload.get("created_at") or _now_iso())
        title = _derive_title(content)
        revision = max(1, int(payload.get("revision") or 1))
        conn.execute(
            """
            INSERT OR REPLACE INTO notes_current (
                note_id, filename, title, content, tags_json, pinned, revision,
                created_at, updated_at, deleted_at, last_operation_id, last_device_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
            """,
            (
                note_id,
                str(payload.get("filename") or ""),
                title,
                content,
                json.dumps(tags, ensure_ascii=False),
                1 if pinned else 0,
                revision,
                created_at,
                _now_iso(),
                operation_id,
                device_id,
            ),
        )
        stored_change = dict(change)
        stored_change["payload"] = {**payload, "revision": revision}
        return {"status": "applied", "note_id": note_id, "revision": revision, "change": stored_change}

    if not current or current["deleted_at"]:
        return {"status": "conflict", "operation_id": operation_id, "reason": "note_not_found"}

    current_revision = int(current["revision"] or 1)
    base_revision = _int_or_none(change.get("base_revision"))

    if change_type == "note.update":
        content = str(payload.get("content") or "")
        if base_revision is not None and base_revision != current_revision and content != str(current["content"]):
            return {
                "status": "conflict",
                "operation_id": operation_id,
                "reason": "revision_conflict",
                "note_id": note_id,
                "current_revision": current_revision,
            }
        next_revision = current_revision + 1
        tags = payload.get("tags")
        tags_json = json.dumps(tags if tags is not None else json.loads(current["tags_json"]), ensure_ascii=False)
        conn.execute(
            """
            UPDATE notes_current
            SET content = ?, tags_json = ?, revision = ?, updated_at = ?, last_operation_id = ?, last_device_id = ?
            WHERE note_id = ?
            """,
            (content, tags_json, next_revision, _now_iso(), operation_id, device_id, note_id),
        )
        stored_change = dict(change)
        stored_change["payload"] = {**payload, "revision": next_revision}
        return {"status": "applied", "note_id": note_id, "revision": next_revision, "change": stored_change}

    if change_type == "note.patch":
        next_revision = current_revision + 1
        pinned = payload.get("pinned")
        tags = payload.get("tags")
        next_pinned = int(bool(pinned)) if pinned is not None else int(current["pinned"] or 0)
        next_tags_json = json.dumps(tags if tags is not None else json.loads(current["tags_json"]), ensure_ascii=False)
        conn.execute(
            """
            UPDATE notes_current
            SET pinned = ?, tags_json = ?, revision = ?, updated_at = ?, last_operation_id = ?, last_device_id = ?
            WHERE note_id = ?
            """,
            (next_pinned, next_tags_json, next_revision, _now_iso(), operation_id, device_id, note_id),
        )
        stored_change = dict(change)
        stored_change["payload"] = {**payload, "revision": next_revision}
        return {"status": "applied", "note_id": note_id, "revision": next_revision, "change": stored_change}

    if change_type == "note.delete":
        next_revision = current_revision + 1
        conn.execute(
            """
            UPDATE notes_current
            SET deleted_at = ?, revision = ?, updated_at = ?, last_operation_id = ?, last_device_id = ?
            WHERE note_id = ?
            """,
            (_now_iso(), next_revision, _now_iso(), operation_id, device_id, note_id),
        )
        stored_change = dict(change)
        stored_change["payload"] = {**payload, "revision": next_revision}
        return {"status": "applied", "note_id": note_id, "revision": next_revision, "change": stored_change}

    return {"status": "conflict", "operation_id": operation_id, "reason": "unsupported_change_type"}


def _apply_local_change(change: dict[str, Any]) -> dict[str, Any]:
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
                title_override=f"冲突副本 - {local_note['meta'].get('title') or _derive_title(local_note['content'])}",
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


def _derive_title(content: str) -> str:
    first_line = (content or "").strip().split("\n")[0][:20].strip()
    if first_line.startswith("#"):
        first_line = first_line.lstrip("#").strip()
    return first_line or "untitled"


def _blob_path(blob_hash: str) -> Path:
    clean = blob_hash.replace("sha256:", "")
    if len(clean) < 2:
        clean = clean.ljust(2, "_")
    return Path(SYNC_BLOBS_DIR) / clean[:2] / clean


def _now_iso() -> str:
    return datetime.now(TZ).isoformat()


def _int_or_none(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(SYNC_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn
