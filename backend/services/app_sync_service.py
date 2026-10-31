"""App-store synchronization persistence. Domain conflict decisions stay in the frontend."""
import hashlib
import json
import uuid
from typing import Any, Callable

from services import app_store_repository as repository
from services.app_storage_service import _normalize_notes, _upsert_note_snapshot
from services.note_contract import app_note_from_row, now_iso, normalize_note_timestamp_iso
from services.service_errors import ConflictError, ValidationError
from services.sync_contract import sync_state_prefix, sync_note_key


def _ensure_tables():
    with repository.connect() as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS sync_outbox (operation_id TEXT PRIMARY KEY, target TEXT NOT NULL, change_json TEXT NOT NULL)")
        conn.execute("CREATE TABLE IF NOT EXISTS sync_inbox (operation_id TEXT PRIMARY KEY, result_json TEXT NOT NULL)")
        conn.execute("CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        conn.execute("CREATE TABLE IF NOT EXISTS sync_target_owners (target TEXT PRIMARY KEY, target_id TEXT NOT NULL)")


def parse_sync_context(value: str | None):
    if not value:
        return None
    try:
        context = json.loads(value)
        if context["target"] not in {"server", "webdav"} or not isinstance(context["device_id"], str) or not context["device_id"]:
            raise ValueError()
        target_id = context.get('target_id')
        if target_id is not None and not isinstance(target_id, str):
            raise ValueError()
        return {"target": context["target"], "device_id": context["device_id"], "target_id": target_id}
    except (ValueError, KeyError, TypeError):
        raise ValidationError("Invalid synchronization context")


def mutate(action: Callable, change_type: str, context: dict | None, note_id: str | None = None):
    with repository.transaction():
        _ensure_tables()
        current = repository.get_note(note_id) if note_id else None
        result = action()
        from services.hosted_sync_service import publish_app_changes
        publish_app_changes()
        if context:
            notes = result if isinstance(result, list) else [result if change_type != "note.purge" else app_note_from_row(current)]
            for note in notes:
                revision = int(note["revision"])
                is_purge = change_type == "note.purge"
                change = {
                    "operation_id": f"op_{uuid.uuid4().hex}", "device_id": context["device_id"],
                    "entity_id": note["note_id"], "type": change_type,
                    "target": context["target"], "target_id": context.get('target_id'), "timestamp": now_iso(),
                    "base_revision": 0 if change_type == 'note.create' else revision if is_purge else max(0, revision - 1),
                    "payload": {"filename": note["filename"], "revision": revision + 1} if is_purge else {
                        **{key: value for key, value in note.items() if key != 'edit_version'}, "created_at": normalize_note_timestamp_iso(note['created_at']),
                        "updated_at": normalize_note_timestamp_iso(note['updated_at']),
                    },
                }
                queue_change(change)
        return result


def queue_change(change: dict[str, Any]):
    _ensure_tables()
    with repository.connect() as conn:
        conn.execute("INSERT OR IGNORE INTO sync_outbox VALUES (?, ?, ?)", (change["operation_id"], change["target"], json.dumps(change)))


def list_outbox(target: str, target_id: str | None = None):
    repository.ensure_app_store()
    _ensure_tables()
    with repository.connect() as conn:
        changes = [json.loads(row[0]) for row in conn.execute("SELECT change_json FROM sync_outbox WHERE target = ? ORDER BY rowid", (target,))]
        return [change for change in changes if target_id is None or change.get('target_id') == target_id]


def claim_legacy_target(target: str, target_id: str):
    with repository.transaction():
        _ensure_tables()
        with repository.connect() as conn:
            conn.execute("INSERT OR IGNORE INTO sync_target_owners VALUES (?, ?)", (target, target_id))
            owner = conn.execute("SELECT target_id FROM sync_target_owners WHERE target = ?", (target,)).fetchone()[0]
            if owner == target_id:
                for change in list_outbox(target):
                    if not change.get('target_id'):
                        change['target_id'] = target_id
                        conn.execute("UPDATE sync_outbox SET change_json = ? WHERE operation_id = ?", (json.dumps(change), change['operation_id']))
                        if change.get('payload', {}).get('workspace_replacement') and change['payload'].get('desired_scope') == 'purged':
                            conn.execute('INSERT OR REPLACE INTO sync_state VALUES (?, ?)',
                                (sync_note_key(target_id, 'deleted', change['entity_id']), '1'))


def read_sync_state(key: str):
    repository.ensure_app_store()
    _ensure_tables()
    with repository.connect() as conn:
        row = conn.execute("SELECT value FROM sync_state WHERE key = ?", (key,)).fetchone()
        return {"value": row[0] if row else None}


def list_sync_state(prefix: str):
    repository.ensure_app_store()
    _ensure_tables()
    with repository.connect() as conn:
        return [{'key': row[0], 'value': row[1]} for row in conn.execute('SELECT key, value FROM sync_state') if row[0].startswith(prefix)]


def write_sync_state(key: str, value: str | None):
    repository.ensure_app_store()
    _ensure_tables()
    with repository.connect() as conn:
        if value is None:
            conn.execute("DELETE FROM sync_state WHERE key = ?", (key,))
        else:
            conn.execute("INSERT INTO sync_state VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", (key, value))
    return {"ok": True}


def record_receipts(receipts: dict):
    with repository.transaction():
        _ensure_tables()
        with repository.connect() as conn:
            for key, result in receipts.items():
                conn.execute("INSERT OR IGNORE INTO sync_inbox VALUES (?, ?)", (key, json.dumps(result)))
    return {"ok": True}


def acknowledge_outbox(operation_id: str):
    repository.ensure_app_store()
    _ensure_tables()
    with repository.connect() as conn:
        conn.execute("DELETE FROM sync_outbox WHERE operation_id = ?", (operation_id,))


def _snapshot():
    rows = sorted((dict(row) for row in repository.list_notes()), key=lambda row: row["note_id"])
    token = hashlib.sha256(json.dumps(rows, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    return token, rows


def read_replica(operation_ids: list[str], target_id: str | None = None):
    with repository.transaction():
        _ensure_tables()
        token, rows = _snapshot()
        receipts = {}
        with repository.connect() as conn:
            for operation_id in operation_ids:
                row = conn.execute("SELECT result_json FROM sync_inbox WHERE operation_id = ?", (operation_id,)).fetchone()
                if row:
                    receipts[operation_id] = json.loads(row[0])
        deleted_ids, applied_cursors = [], {}
        if target_id:
            from urllib.parse import unquote
            prefix = sync_state_prefix(target_id)
            for state in list_sync_state(prefix):
                name = state['key'][len(prefix):]
                if name.startswith('deleted:'):
                    deleted_ids.append(unquote(name[len('deleted:'):]))
                elif name.startswith('baseline:'):
                    baseline = json.loads(state['value'])
                    if baseline.get('cursor'):
                        applied_cursors[baseline['note_id']] = baseline['cursor']
        return {"token": token, "notes": [app_note_from_row(r) for r in rows if not r["deleted_at"]],
                "trash": [app_note_from_row(r) for r in rows if r["deleted_at"]], "receipts": receipts,
                'workspace_epoch': read_sync_state('workspace_epoch')['value'] or '0',
                'deleted_ids': deleted_ids, 'applied_cursors': applied_cursors}


def commit_replica(payload: dict[str, Any]):
    notes, trash = _normalize_notes(payload.get("notes")), _normalize_notes(payload.get("trash"))
    ids = [n["note_id"] for n in notes + trash]
    if len(ids) != len(set(ids)):
        raise ValidationError("Duplicate note ID in replica")
    with repository.transaction():
        _ensure_tables()
        if payload.get('workspace_epoch') != (read_sync_state('workspace_epoch')['value'] or '0'):
            raise ConflictError('工作区已被替换，原同步操作已停止，请重新同步。')
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
        from services.hosted_sync_service import publish_app_changes
        publish_app_changes()
    return {"ok": True}
