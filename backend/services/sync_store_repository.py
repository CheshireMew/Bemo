import json
import os
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

from core.paths import SYNC_BLOBS_DIR, SYNC_DB_PATH, TZ


def ensure_sync_store() -> None:
    os.makedirs(SYNC_BLOBS_DIR, exist_ok=True)
    with connect() as conn:
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


def get_latest_cursor() -> int:
    ensure_sync_store()
    with connect() as conn:
        row = conn.execute("SELECT COALESCE(MAX(cursor), 0) AS latest_cursor FROM changes").fetchone()
        return int(row["latest_cursor"]) if row else 0


def get_applied_operation_cursor(operation_id: str) -> int | None:
    ensure_sync_store()
    with connect() as conn:
        row = conn.execute(
            "SELECT cursor FROM applied_operations WHERE operation_id = ?",
            (operation_id,),
        ).fetchone()
        return int(row["cursor"]) if row and row["cursor"] is not None else None


def list_changes_after(cursor: int, limit: int) -> list[dict[str, Any]]:
    ensure_sync_store()
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT cursor, change_json
            FROM changes
            WHERE cursor > ?
            ORDER BY cursor ASC
            LIMIT ?
            """,
            (cursor, limit),
        ).fetchall()
    changes: list[dict[str, Any]] = []
    for row in rows:
        payload = json.loads(row["change_json"])
        payload["cursor"] = str(row["cursor"])
        changes.append(payload)
    return changes


def apply_remote_change(change: dict[str, Any]) -> dict[str, Any]:
    ensure_sync_store()
    with connect() as conn:
        return _apply_remote_change(conn, change)


def persist_applied_change(change: dict[str, Any], result: dict[str, Any]) -> int:
    ensure_sync_store()
    with connect() as conn:
        cursor = conn.execute(
            """
            INSERT INTO changes (
                operation_id, note_id, device_id, change_type, base_revision, change_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(change.get("operation_id") or ""),
                str(change.get("entity_id") or ""),
                str(change.get("device_id") or "unknown-device"),
                str(change.get("type") or ""),
                _int_or_none(change.get("base_revision")),
                json.dumps(result["change"], ensure_ascii=False),
                _now_iso(),
            ),
        ).lastrowid
        conn.execute(
            "INSERT INTO applied_operations (operation_id, cursor, applied_at) VALUES (?, ?, ?)",
            (str(change.get("operation_id") or ""), cursor, _now_iso()),
        )
        return int(cursor)


def has_blob_record(blob_hash: str) -> bool:
    return _blob_path(blob_hash).exists()


def put_blob_record(blob_hash: str, data: bytes) -> None:
    path = _blob_path(blob_hash)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def get_blob_record(blob_hash: str) -> bytes:
    return _blob_path(blob_hash).read_bytes()


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(SYNC_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


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

    if change_type not in {"note.trash", "note.delete", "note.restore", "note.purge"} and (not current or current["deleted_at"]):
        return {"status": "conflict", "operation_id": operation_id, "reason": "note_not_found"}

    current_revision = int(current["revision"] or 1) if current else 0
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
        if _has_patch_conflict(current, base_revision, payload):
            return {
                "status": "conflict",
                "operation_id": operation_id,
                "reason": "revision_conflict",
                "note_id": note_id,
                "current_revision": current_revision,
            }
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

    if change_type in {"note.trash", "note.delete"}:
        next_revision = (int(current["revision"] or 0) + 1) if current else max(1, int(payload.get("revision") or 1))
        content = str(payload.get("content") or (current["content"] if current else ""))
        tags = payload.get("tags") if payload.get("tags") is not None else (json.loads(current["tags_json"]) if current else [])
        pinned = bool(payload.get("pinned", current["pinned"] if current else False))
        created_at = str(payload.get("created_at") or (current["created_at"] if current else _now_iso()))
        title = _derive_title(content)
        conn.execute(
            """
            INSERT OR REPLACE INTO notes_current (
                note_id, filename, title, content, tags_json, pinned, revision,
                created_at, updated_at, deleted_at, last_operation_id, last_device_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                note_id,
                str(payload.get("filename") or (current["filename"] if current else "")),
                title,
                content,
                json.dumps(tags, ensure_ascii=False),
                1 if pinned else 0,
                next_revision,
                created_at,
                _now_iso(),
                _now_iso(),
                operation_id,
                device_id,
            ),
        )
        stored_change = dict(change)
        stored_change["type"] = "note.trash"
        stored_change["payload"] = {
            **payload,
            "content": content,
            "tags": tags,
            "pinned": pinned,
            "created_at": created_at,
            "revision": next_revision,
        }
        return {"status": "applied", "note_id": note_id, "revision": next_revision, "change": stored_change}

    if change_type == "note.restore":
        next_revision = (int(current["revision"] or 0) + 1) if current else max(1, int(payload.get("revision") or 1))
        content = str(payload.get("content") or (current["content"] if current else ""))
        tags = payload.get("tags") if payload.get("tags") is not None else (json.loads(current["tags_json"]) if current else [])
        pinned = bool(payload.get("pinned", current["pinned"] if current else False))
        created_at = str(payload.get("created_at") or (current["created_at"] if current else _now_iso()))
        title = _derive_title(content)
        conn.execute(
            """
            INSERT OR REPLACE INTO notes_current (
                note_id, filename, title, content, tags_json, pinned, revision,
                created_at, updated_at, deleted_at, last_operation_id, last_device_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
            """,
            (
                note_id,
                str(payload.get("filename") or (current["filename"] if current else "")),
                title,
                content,
                json.dumps(tags, ensure_ascii=False),
                1 if pinned else 0,
                next_revision,
                created_at,
                _now_iso(),
                operation_id,
                device_id,
            ),
        )
        stored_change = dict(change)
        stored_change["payload"] = {
            **payload,
            "content": content,
            "tags": tags,
            "pinned": pinned,
            "created_at": created_at,
            "revision": next_revision,
        }
        return {"status": "applied", "note_id": note_id, "revision": next_revision, "change": stored_change}

    if change_type == "note.purge":
        if current:
            next_revision = int(current["revision"] or 1) + 1
            conn.execute("DELETE FROM notes_current WHERE note_id = ?", (note_id,))
        else:
            next_revision = max(1, int(payload.get("revision") or 1))
        stored_change = dict(change)
        stored_change["payload"] = {**payload, "revision": next_revision}
        return {"status": "applied", "note_id": note_id, "revision": next_revision, "change": stored_change}

    return {"status": "conflict", "operation_id": operation_id, "reason": "unsupported_change_type"}


def _derive_title(content: str) -> str:
    first_line = (content or "").strip().split("\n")[0][:20].strip()
    if first_line.startswith("#"):
        first_line = first_line.lstrip("#").strip()
    return first_line or "untitled"


def _has_patch_conflict(current: sqlite3.Row, base_revision: int | None, payload: dict[str, Any]) -> bool:
    if base_revision is None or base_revision == int(current["revision"] or 1):
        return False

    if "pinned" in payload and bool(payload.get("pinned")) != bool(current["pinned"]):
        return True

    if "tags" in payload:
        next_tags = payload.get("tags")
        current_tags = json.loads(current["tags_json"])
        if next_tags != current_tags:
            return True

    return False


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
