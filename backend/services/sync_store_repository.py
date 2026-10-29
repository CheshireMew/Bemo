import json
import os
import sqlite3
from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path
from typing import Any

from core.paths import SYNC_BLOBS_DIR, SYNC_DB_PATH, APP_BLOBS_DIR
from services.note_contract import now_iso

_transaction_connection: ContextVar[sqlite3.Connection | None] = ContextVar("sync_transaction", default=None)
_app_store: ContextVar[bool] = ContextVar("sync_app_store", default=False)


@contextmanager
def use_app_store(enabled: bool = True):
    connection_token = _transaction_connection.set(None) if enabled != _app_store.get() else None
    token = _app_store.set(enabled)
    try:
        yield
    finally:
        _app_store.reset(token)
        if connection_token is not None:
            _transaction_connection.reset(connection_token)


def uses_app_store() -> bool:
    return _app_store.get()


def table_prefix() -> str:
    return "hosted_sync_" if uses_app_store() else ""


def ensure_sync_store() -> None:
    if _transaction_connection.get() is not None:
        return
    if uses_app_store():
        from services import app_store_repository
        if app_store_repository.current_transaction_connection() is not None:
            return
    os.makedirs(SYNC_BLOBS_DIR, exist_ok=True)
    with connect() as conn:
        conn.executescript(
            f"""
            CREATE TABLE IF NOT EXISTS {table_prefix()}notes_current (
                note_id TEXT PRIMARY KEY,
                filename TEXT,
                title TEXT,
                content TEXT NOT NULL,
                tags_json TEXT NOT NULL,
                attachments_json TEXT NOT NULL DEFAULT '[]',
                pinned INTEGER NOT NULL,
                revision INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                deleted_at TEXT,
                purged INTEGER NOT NULL DEFAULT 0,
                last_operation_id TEXT,
                last_device_id TEXT
            );
            CREATE TABLE IF NOT EXISTS {table_prefix()}changes (
                cursor INTEGER PRIMARY KEY AUTOINCREMENT,
                operation_id TEXT NOT NULL UNIQUE,
                note_id TEXT NOT NULL,
                device_id TEXT NOT NULL,
                change_type TEXT NOT NULL,
                base_revision INTEGER,
                change_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS {table_prefix()}applied_operations (
                operation_id TEXT PRIMARY KEY,
                cursor INTEGER,
                applied_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS {table_prefix()}attachment_files (
                filename TEXT PRIMARY KEY,
                blob_hash TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                size INTEGER NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )
        _ensure_notes_current_schema(conn)


def get_latest_cursor() -> int:
    ensure_sync_store()
    with connect() as conn:
        row = conn.execute(f"SELECT COALESCE(MAX(cursor), 0) AS latest_cursor FROM {table_prefix()}changes").fetchone()
        return int(row["latest_cursor"]) if row else 0


def get_applied_operation_cursor(operation_id: str) -> int | None:
    ensure_sync_store()
    with connect() as conn:
        row = conn.execute(
            f"SELECT cursor FROM {table_prefix()}applied_operations WHERE operation_id = ?",
            (operation_id,),
        ).fetchone()
        return int(row["cursor"]) if row and row["cursor"] is not None else None


def list_changes_after(cursor: int, limit: int) -> list[dict[str, Any]]:
    ensure_sync_store()
    with connect() as conn:
        rows = conn.execute(
            f"""
            SELECT cursor, change_json
            FROM {table_prefix()}changes
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


def list_current_note_states() -> list[dict[str, Any]]:
    ensure_sync_store()
    with connect() as conn:
        rows = conn.execute(
            f"""
            SELECT note_id, revision, deleted_at, purged
            FROM {table_prefix()}notes_current
            ORDER BY datetime(updated_at) DESC, note_id ASC
            """
        ).fetchall()
    states: list[dict[str, Any]] = []
    for row in rows:
        note_id = str(row["note_id"] or "")
        if not note_id:
            continue
        states.append(
            {
                "note_id": note_id,
                "scope": "purged" if row["purged"] else "trash" if row["deleted_at"] else "active",
                "revision": int(row["revision"] or 1),
            }
        )
    return states


def persist_applied_change(change: dict[str, Any], result: dict[str, Any]) -> int:
    ensure_sync_store()
    with connect() as conn:
        cursor = conn.execute(
            f"""
            INSERT INTO {table_prefix()}changes (
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
                now_iso(),
            ),
        ).lastrowid
        conn.execute(
            f"INSERT INTO {table_prefix()}applied_operations (operation_id, cursor, applied_at) VALUES (?, ?, ?)",
            (str(change.get("operation_id") or ""), cursor, now_iso()),
        )
        return int(cursor)


def has_blob_record(blob_hash: str) -> bool:
    return _blob_path(blob_hash).exists()


def put_blob_record(blob_hash: str, data: bytes) -> None:
    if uses_app_store():
        import hashlib
        from services import app_store_repository
        from services.service_errors import ValidationError
        if blob_hash != f'sha256:{hashlib.sha256(data).hexdigest()}':
            raise ValidationError('同步附件内容与哈希不一致。')
        app_store_repository.put_blob_record(blob_hash, data)
        return
    path = _blob_path(blob_hash)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def get_blob_record(blob_hash: str) -> bytes:
    return _blob_path(blob_hash).read_bytes()


def delete_blob_record(blob_hash: str) -> None:
    path = _blob_path(blob_hash)
    if path.exists():
        path.unlink()


def upsert_attachment_record(
    filename: str,
    blob_hash: str,
    mime_type: str,
    size: int,
) -> None:
    ensure_sync_store()
    with connect() as conn:
        conn.execute(
            f"""
            INSERT INTO {table_prefix()}attachment_files (filename, blob_hash, mime_type, size, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(filename) DO UPDATE SET
                blob_hash = excluded.blob_hash,
                mime_type = excluded.mime_type,
                size = excluded.size,
                updated_at = excluded.updated_at
            """,
            (
                str(filename or ""),
                str(blob_hash or ""),
                str(mime_type or "application/octet-stream"),
                max(0, int(size or 0)),
                now_iso(),
            ),
        )


def get_attachment_record(filename: str) -> dict[str, Any] | None:
    ensure_sync_store()
    with connect() as conn:
        row = conn.execute(
            f"""
            SELECT filename, blob_hash, mime_type, size, updated_at
            FROM {table_prefix()}attachment_files
            WHERE filename = ?
            """,
            (str(filename or ""),),
        ).fetchone()
    if not row:
        return None
    return {
        "filename": str(row["filename"] or ""),
        "blob_hash": str(row["blob_hash"] or ""),
        "mime_type": str(row["mime_type"] or "application/octet-stream"),
        "size": int(row["size"] or 0),
        "updated_at": str(row["updated_at"] or ""),
    }


def list_attachment_records() -> list[dict[str, Any]]:
    ensure_sync_store()
    with connect() as conn:
        rows = conn.execute(
            f"""
            SELECT filename, blob_hash, mime_type, size, updated_at
            FROM {table_prefix()}attachment_files
            ORDER BY datetime(updated_at) DESC, filename ASC
            """
        ).fetchall()
    return [
        {
            "filename": str(row["filename"] or ""),
            "blob_hash": str(row["blob_hash"] or ""),
            "mime_type": str(row["mime_type"] or "application/octet-stream"),
            "size": int(row["size"] or 0),
            "updated_at": str(row["updated_at"] or ""),
        }
        for row in rows
    ]


def delete_attachment_record(filename: str) -> None:
    ensure_sync_store()
    with connect() as conn:
        conn.execute(f"DELETE FROM {table_prefix()}attachment_files WHERE filename = ?", (str(filename or ""),))


def clear_attachment_records() -> None:
    ensure_sync_store()
    with connect() as conn:
        conn.execute(f"DELETE FROM {table_prefix()}attachment_files")


@contextmanager
def connect():
    current = _transaction_connection.get()
    if current is not None:
        yield current
        return
    if uses_app_store():
        from services import app_store_repository
        with app_store_repository.connect() as conn:
            yield conn
        return
    conn = sqlite3.connect(SYNC_DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        with conn:
            yield conn
    finally:
        conn.close()


@contextmanager
def transaction():
    """Serialize revision checks and commit the note, log and receipt together."""
    if _transaction_connection.get() is not None:
        yield
        return
    ensure_sync_store()
    if uses_app_store():
        from services import app_store_repository
        with app_store_repository.transaction():
            with app_store_repository.connect() as conn:
                token = _transaction_connection.set(conn)
                try:
                    yield
                finally:
                    _transaction_connection.reset(token)
        return
    with connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        token = _transaction_connection.set(conn)
        try:
            yield
        finally:
            _transaction_connection.reset(token)


def _ensure_notes_current_schema(conn: sqlite3.Connection) -> None:
    columns = {
        str(row["name"])
        for row in conn.execute(f"PRAGMA table_info({table_prefix()}notes_current)").fetchall()
    }
    if "attachments_json" not in columns:
        conn.execute(
            f"ALTER TABLE {table_prefix()}notes_current ADD COLUMN attachments_json TEXT NOT NULL DEFAULT '[]'"
        )
    if uses_app_store() and 'app_revision' not in columns:
        conn.execute(f'ALTER TABLE {table_prefix()}notes_current ADD COLUMN app_revision INTEGER')
        conn.execute(f'UPDATE {table_prefix()}notes_current SET app_revision = revision')
    if "purged" not in columns:
        conn.execute(f"ALTER TABLE {table_prefix()}notes_current ADD COLUMN purged INTEGER NOT NULL DEFAULT 0")
        # Old servers removed purged rows but retained the operation history.
        rows = conn.execute(f"""SELECT c.note_id, c.change_json FROM {table_prefix()}changes c
            WHERE c.cursor = (SELECT MAX(last.cursor) FROM {table_prefix()}changes last WHERE last.note_id = c.note_id)
            AND c.change_type = 'note.purge' AND NOT EXISTS
            (SELECT 1 FROM {table_prefix()}notes_current n WHERE n.note_id = c.note_id)""").fetchall()
        for row in rows:
            change = json.loads(row["change_json"])
            conn.execute(f"""INSERT INTO {table_prefix()}notes_current
                (note_id, content, tags_json, pinned, revision, created_at, updated_at, deleted_at, purged)
                VALUES (?, '', '[]', 0, ?, ?, ?, ?, 1)""",
                (row["note_id"], max(1, int(change.get('payload', {}).get('revision') or 1)), now_iso(), now_iso(), now_iso()))


def _blob_path(blob_hash: str) -> Path:
    clean = blob_hash.replace("sha256:", "")
    if len(clean) < 2:
        clean = clean.ljust(2, "_")
    return Path(APP_BLOBS_DIR if uses_app_store() else SYNC_BLOBS_DIR) / clean[:2] / clean
def _int_or_none(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None
