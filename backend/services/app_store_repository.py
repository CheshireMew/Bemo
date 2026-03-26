import os
import shutil
import sqlite3
from pathlib import Path
from typing import Any

from core.paths import APP_BLOBS_DIR, APP_DB_PATH, SYNC_BLOBS_DIR, SYNC_DB_PATH
from services.note_contract import now_iso

APP_STORE_BOOTSTRAP_VERSION = 1


def ensure_app_store() -> None:
    os.makedirs(APP_BLOBS_DIR, exist_ok=True)
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS notes_current (
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
                deleted_at TEXT
            );
            CREATE TABLE IF NOT EXISTS attachment_files (
                filename TEXT PRIMARY KEY,
                blob_hash TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                size INTEGER NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )
        _bootstrap_legacy_sync_store(conn)


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(APP_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _bootstrap_legacy_sync_store(conn: sqlite3.Connection) -> None:
    if _read_user_version(conn) >= APP_STORE_BOOTSTRAP_VERSION:
        return
    if _should_import_legacy_sync_store(conn):
        _import_legacy_sync_store(conn)
    _write_user_version(conn, APP_STORE_BOOTSTRAP_VERSION)


def _should_import_legacy_sync_store(conn: sqlite3.Connection) -> bool:
    if _app_store_has_records(conn):
        return False
    if not os.path.isfile(SYNC_DB_PATH):
        return False
    with _connect_legacy_sync_store() as legacy_conn:
        return _legacy_sync_store_has_records(legacy_conn)


def _import_legacy_sync_store(conn: sqlite3.Connection) -> None:
    with _connect_legacy_sync_store() as legacy_conn:
        note_rows = _read_legacy_note_rows(legacy_conn)
        attachment_rows = _read_legacy_attachment_rows(legacy_conn)

    if note_rows:
        conn.executemany(
            """
            INSERT INTO notes_current (
                note_id, filename, title, content, tags_json, attachments_json, pinned, revision,
                created_at, updated_at, deleted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(note_id) DO UPDATE SET
                filename = excluded.filename,
                title = excluded.title,
                content = excluded.content,
                tags_json = excluded.tags_json,
                attachments_json = excluded.attachments_json,
                pinned = excluded.pinned,
                revision = excluded.revision,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at,
                deleted_at = excluded.deleted_at
            """,
            [
                (
                    str(_row_value(row, "note_id") or ""),
                    str(_row_value(row, "filename") or ""),
                    str(_row_value(row, "title") or ""),
                    str(_row_value(row, "content") or ""),
                    str(_row_value(row, "tags_json", "[]") or "[]"),
                    str(_row_value(row, "attachments_json", "[]") or "[]"),
                    max(0, int(_row_value(row, "pinned", 0) or 0)),
                    max(1, int(_row_value(row, "revision", 1) or 1)),
                    str(_row_value(row, "created_at") or now_iso()),
                    str(_row_value(row, "updated_at") or now_iso()),
                    str(_row_value(row, "deleted_at") or "") or None,
                )
                for row in note_rows
                if str(_row_value(row, "note_id") or "")
            ],
        )

    if attachment_rows:
        conn.executemany(
            """
            INSERT INTO attachment_files (filename, blob_hash, mime_type, size, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(filename) DO UPDATE SET
                blob_hash = excluded.blob_hash,
                mime_type = excluded.mime_type,
                size = excluded.size,
                updated_at = excluded.updated_at
            """,
            [
                (
                    str(_row_value(row, "filename") or ""),
                    str(_row_value(row, "blob_hash") or ""),
                    str(_row_value(row, "mime_type", "application/octet-stream") or "application/octet-stream"),
                    max(0, int(_row_value(row, "size", 0) or 0)),
                    str(_row_value(row, "updated_at") or now_iso()),
                )
                for row in attachment_rows
                if str(_row_value(row, "filename") or "") and str(_row_value(row, "blob_hash") or "")
            ],
        )
        for row in attachment_rows:
            _copy_legacy_blob(str(_row_value(row, "blob_hash") or ""))


def _read_user_version(conn: sqlite3.Connection) -> int:
    row = conn.execute("PRAGMA user_version").fetchone()
    return int(row[0]) if row else 0


def _write_user_version(conn: sqlite3.Connection, version: int) -> None:
    conn.execute(f"PRAGMA user_version = {max(0, int(version))}")


def _app_store_has_records(conn: sqlite3.Connection) -> bool:
    notes = conn.execute("SELECT 1 FROM notes_current LIMIT 1").fetchone()
    attachments = conn.execute("SELECT 1 FROM attachment_files LIMIT 1").fetchone()
    return bool(notes or attachments)


def _connect_legacy_sync_store() -> sqlite3.Connection:
    conn = sqlite3.connect(SYNC_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _legacy_sync_store_has_records(conn: sqlite3.Connection) -> bool:
    return _legacy_table_has_rows(conn, "notes_current") or _legacy_table_has_rows(conn, "attachment_files")


def _legacy_table_has_rows(conn: sqlite3.Connection, table_name: str) -> bool:
    if not _legacy_table_exists(conn, table_name):
        return False
    row = conn.execute(f"SELECT 1 FROM {table_name} LIMIT 1").fetchone()
    return bool(row)


def _legacy_table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        """
        SELECT 1
        FROM sqlite_master
        WHERE type = 'table' AND name = ?
        """,
        (table_name,),
    ).fetchone()
    return bool(row)


def _read_legacy_note_rows(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    if not _legacy_table_exists(conn, "notes_current"):
        return []
    return conn.execute("SELECT * FROM notes_current").fetchall()


def _read_legacy_attachment_rows(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    if not _legacy_table_exists(conn, "attachment_files"):
        return []
    return conn.execute("SELECT * FROM attachment_files").fetchall()


def _copy_legacy_blob(blob_hash: str) -> None:
    source = _legacy_blob_path(blob_hash)
    target = _blob_path(blob_hash)
    if not blob_hash or not source.exists() or target.exists():
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def _row_value(row: sqlite3.Row, key: str, default: Any = "") -> Any:
    return row[key] if key in row.keys() else default


def list_notes(*, deleted: bool | None = None) -> list[sqlite3.Row]:
    ensure_app_store()
    query = "SELECT * FROM notes_current"
    params: tuple[Any, ...] = ()
    if deleted is True:
        query += " WHERE deleted_at IS NOT NULL"
    elif deleted is False:
        query += " WHERE deleted_at IS NULL"
    query += " ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC"
    with connect() as conn:
        return conn.execute(query, params).fetchall()


def search_active_notes(query: str) -> list[sqlite3.Row]:
    ensure_app_store()
    needle = str(query or "").strip().lower()
    if not needle:
        return list_notes(deleted=False)

    with connect() as conn:
        return conn.execute(
            """
            SELECT *
            FROM notes_current
            WHERE deleted_at IS NULL
              AND (
                lower(title) LIKE ?
                OR lower(content) LIKE ?
                OR lower(tags_json) LIKE ?
              )
            ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
            """,
            (f"%{needle}%", f"%{needle}%", f"%{needle}%"),
        ).fetchall()


def get_note(note_id: str) -> sqlite3.Row | None:
    ensure_app_store()
    with connect() as conn:
        return conn.execute(
            "SELECT * FROM notes_current WHERE note_id = ?",
            (str(note_id or ""),),
        ).fetchone()


def upsert_note(note: dict[str, Any]) -> None:
    ensure_app_store()
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO notes_current (
                note_id, filename, title, content, tags_json, attachments_json, pinned, revision,
                created_at, updated_at, deleted_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(note_id) DO UPDATE SET
                filename = excluded.filename,
                title = excluded.title,
                content = excluded.content,
                tags_json = excluded.tags_json,
                attachments_json = excluded.attachments_json,
                pinned = excluded.pinned,
                revision = excluded.revision,
                created_at = excluded.created_at,
                updated_at = excluded.updated_at,
                deleted_at = excluded.deleted_at
            """,
            (
                str(note.get("note_id") or ""),
                str(note.get("filename") or ""),
                str(note.get("title") or ""),
                str(note.get("content") or ""),
                str(note.get("tags_json") or "[]"),
                str(note.get("attachments_json") or "[]"),
                1 if bool(note.get("pinned")) else 0,
                max(1, int(note.get("revision") or 1)),
                str(note.get("created_at") or ""),
                str(note.get("updated_at") or ""),
                str(note.get("deleted_at") or "") or None,
            ),
        )


def delete_note(note_id: str) -> None:
    ensure_app_store()
    with connect() as conn:
        conn.execute("DELETE FROM notes_current WHERE note_id = ?", (str(note_id or ""),))


def list_attachment_records() -> list[dict[str, Any]]:
    ensure_app_store()
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT filename, blob_hash, mime_type, size, updated_at
            FROM attachment_files
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


def get_attachment_record(filename: str) -> dict[str, Any] | None:
    ensure_app_store()
    with connect() as conn:
        row = conn.execute(
            """
            SELECT filename, blob_hash, mime_type, size, updated_at
            FROM attachment_files
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


def upsert_attachment_record(
    filename: str,
    blob_hash: str,
    mime_type: str,
    size: int,
    updated_at: str,
) -> None:
    ensure_app_store()
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO attachment_files (filename, blob_hash, mime_type, size, updated_at)
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
                str(updated_at or ""),
            ),
        )


def delete_attachment_record(filename: str) -> None:
    ensure_app_store()
    with connect() as conn:
        conn.execute("DELETE FROM attachment_files WHERE filename = ?", (str(filename or ""),))


def clear_all_data() -> None:
    ensure_app_store()
    with connect() as conn:
        conn.execute("DELETE FROM notes_current")
        conn.execute("DELETE FROM attachment_files")
    if os.path.isdir(APP_BLOBS_DIR):
        shutil.rmtree(APP_BLOBS_DIR)
    os.makedirs(APP_BLOBS_DIR, exist_ok=True)


def put_blob_record(blob_hash: str, data: bytes) -> None:
    path = _blob_path(blob_hash)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def get_blob_record(blob_hash: str) -> bytes:
    return _blob_path(blob_hash).read_bytes()


def has_blob_record(blob_hash: str) -> bool:
    return _blob_path(blob_hash).exists()


def delete_blob_record(blob_hash: str) -> None:
    path = _blob_path(blob_hash)
    if path.exists():
        path.unlink()


def _blob_path(blob_hash: str) -> Path:
    clean = str(blob_hash or "").replace("sha256:", "")
    if len(clean) < 2:
        clean = clean.ljust(2, "_")
    return Path(APP_BLOBS_DIR) / clean[:2] / clean


def _legacy_blob_path(blob_hash: str) -> Path:
    clean = str(blob_hash or "").replace("sha256:", "")
    if len(clean) < 2:
        clean = clean.ljust(2, "_")
    return Path(SYNC_BLOBS_DIR) / clean[:2] / clean
