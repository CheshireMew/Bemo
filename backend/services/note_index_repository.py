import os
import sqlite3

from core.paths import NOTE_INDEX_DB_PATH

ACTIVE_SCOPE = "notes"


def ensure_note_index() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS note_path_index (
                note_id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                scope TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_note_path_index_scope_filename ON note_path_index(scope, filename)"
        )


def upsert_note_path(note_id: str, filename: str, scope: str = ACTIVE_SCOPE) -> None:
    ensure_note_index()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO note_path_index (note_id, filename, scope, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(note_id) DO UPDATE SET
                filename = excluded.filename,
                scope = excluded.scope,
                updated_at = CURRENT_TIMESTAMP
            """,
            (note_id, filename, scope),
        )


def remove_note_path(note_id: str) -> None:
    ensure_note_index()
    with _connect() as conn:
        conn.execute("DELETE FROM note_path_index WHERE note_id = ?", (note_id,))


def remove_note_path_by_filename(filename: str, scope: str = ACTIVE_SCOPE) -> None:
    ensure_note_index()
    with _connect() as conn:
        conn.execute(
            "DELETE FROM note_path_index WHERE filename = ? AND scope = ?",
            (filename, scope),
        )


def get_note_path(note_id: str, scope: str = ACTIVE_SCOPE) -> str | None:
    ensure_note_index()
    with _connect() as conn:
        row = conn.execute(
            "SELECT filename FROM note_path_index WHERE note_id = ? AND scope = ?",
            (note_id, scope),
        ).fetchone()
    return str(row["filename"]) if row else None


def _connect() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(NOTE_INDEX_DB_PATH), exist_ok=True)
    conn = sqlite3.connect(NOTE_INDEX_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn
