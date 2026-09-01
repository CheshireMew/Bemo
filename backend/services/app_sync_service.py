"""App-store synchronization persistence. Domain conflict decisions stay in the frontend."""
import hashlib
import json
import uuid
from typing import Any, Callable

from services import app_store_repository as repository
from services.app_storage_service import _normalize_notes, _upsert_note_snapshot
from services.note_contract import app_note_from_row, now_iso, normalize_note_timestamp_iso
from services.service_errors import ConflictError, ValidationError


def _ensure_tables():
    with repository.connect() as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS sync_outbox (operation_id TEXT PRIMARY KEY, target TEXT NOT NULL, change_json TEXT NOT NULL)")
        conn.execute("CREATE TABLE IF NOT EXISTS sync_inbox (operation_id TEXT PRIMARY KEY, result_json TEXT NOT NULL)")


def parse_sync_context(value: str | None):
    if not value:
        return None
    try:
        context = json.loads(value)
        if context["target"] not in {"server", "webdav"} or not isinstance(context["device_id"], str) or not context["device_id"]:
            raise ValueError()
        return {"target": context["target"], "device_id": context["device_id"]}
    except (ValueError, KeyError, TypeError):
        raise ValidationError("Invalid synchronization context")


def mutate(action: Callable, change_type: str, context: dict | None, note_id: str | None = None):
    with repository.transaction():
        _ensure_tables()
        current = repository.get_note(note_id) if note_id else None
        result = action()
        if context:
            notes = result if isinstance(result, list) else [result if change_type != "note.purge" else app_note_from_row(current)]
            for note in notes:
                revision = int(note["revision"])
                is_purge = change_type == "note.purge"
                change = {
                    "operation_id": f"op_{uuid.uuid4().hex}", "device_id": context["device_id"],
                    "entity_id": note["note_id"], "type": change_type,
                    "target": context["target"], "timestamp": now_iso(),
                    "base_revision": 0 if change_type == 'note.create' else revision if is_purge else max(0, revision - 1),
                    "payload": {"filename": note["filename"], "revision": revision + 1} if is_purge else {
                        **note, "created_at": normalize_note_timestamp_iso(note['created_at']),
                        "updated_at": normalize_note_timestamp_iso(note['updated_at']),
                    },
                }
                queue_change(change)
        return result


def queue_change(change: dict[str, Any]):
    _ensure_tables()
    with repository.connect() as conn:
        conn.execute("INSERT OR IGNORE INTO sync_outbox VALUES (?, ?, ?)", (change["operation_id"], change["target"], json.dumps(change)))


def list_outbox(target: str):
    repository.ensure_app_store()
    _ensure_tables()
    with repository.connect() as conn:
        return [json.loads(row[0]) for row in conn.execute("SELECT change_json FROM sync_outbox WHERE target = ? ORDER BY rowid", (target,))]


def acknowledge_outbox(operation_id: str):
    repository.ensure_app_store()
    _ensure_tables()
    with repository.connect() as conn:
        conn.execute("DELETE FROM sync_outbox WHERE operation_id = ?", (operation_id,))


def _snapshot():
    rows = sorted((dict(row) for row in repository.list_notes()), key=lambda row: row["note_id"])
    token = hashlib.sha256(json.dumps(rows, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    return token, rows


def read_replica(operation_ids: list[str]):
    with repository.transaction():
        _ensure_tables()
        token, rows = _snapshot()
        receipts = {}
        with repository.connect() as conn:
            for operation_id in operation_ids:
                row = conn.execute("SELECT result_json FROM sync_inbox WHERE operation_id = ?", (operation_id,)).fetchone()
                if row:
                    receipts[operation_id] = json.loads(row[0])
        return {"token": token, "notes": [app_note_from_row(r) for r in rows if not r["deleted_at"]],
                "trash": [app_note_from_row(r) for r in rows if r["deleted_at"]], "receipts": receipts}


def commit_replica(payload: dict[str, Any]):
    notes, trash = _normalize_notes(payload.get("notes")), _normalize_notes(payload.get("trash"))
    ids = [n["note_id"] for n in notes + trash]
    if len(ids) != len(set(ids)):
        raise ValidationError("Duplicate note ID in replica")
    with repository.transaction():
        _ensure_tables()
        token, rows = _snapshot()
        if token != payload.get("token"):
            raise ConflictError("主存储在同步期间发生变化，请重试。")
        attachment_index = {r["filename"]: r for r in repository.list_attachment_records()}
        by_id = {n["note_id"]: (n, deleted) for deleted, items in [(False, notes), (True, trash)] for n in items}
        existing = {r["note_id"]: r for r in rows}
        for note_id in existing.keys() - by_id.keys():
            repository.delete_note(note_id)
        for note_id, (note, deleted) in by_id.items():
            previous = existing.get(note_id)
            previous_note = app_note_from_row(previous) if previous else {}
            if previous and all(previous_note.get(key) == value for key, value in note.items()) and bool(previous["deleted_at"]) == deleted:
                continue
            _upsert_note_snapshot(note, attachment_index, deleted=deleted)
        with repository.connect() as conn:
            for operation_id, result in payload.get("receipts", {}).items():
                conn.execute("INSERT OR IGNORE INTO sync_inbox VALUES (?, ?)", (operation_id, json.dumps(result)))
        for change in payload.get("outbox", []):
            queue_change(change)
    return {"ok": True}
