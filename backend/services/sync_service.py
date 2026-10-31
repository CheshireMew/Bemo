from typing import Any

from services import sync_change_apply
from services import sync_store_repository
from services.service_errors import ValidationError


def ensure_sync_store() -> None:
    sync_store_repository.ensure_sync_store()


def get_sync_info() -> dict[str, Any]:
    info = {
        "format_version": 1,
        "latest_cursor": str(sync_store_repository.get_latest_cursor()),
        "blob_prefix": "/api/sync/blobs",
    }
    if sync_store_repository.uses_app_store():
        from services.hosted_sync_service import get_store_id
        info['store_id'] = get_store_id()
    return info


def get_sync_state() -> dict[str, Any]:
    ensure_sync_store()
    return {
        "status": "completed",
        "fingerprint": None,
        "remoteNotes": sync_store_repository.list_current_note_states(),
        **get_sync_info(),
    }


def push_changes(changes: list[dict[str, Any]]) -> dict[str, Any]:
    ensure_sync_store()
    accepted: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []
    blocked_notes: set[str] = set()

    for change in changes:
        operation_id = str(change.get("operation_id") or "")
        note_id = str(change.get("entity_id") or "")
        if not operation_id:
            conflicts.append({"operation_id": "", "reason": "missing_operation_id"})
            blocked_notes.add(note_id)
            continue

        with sync_store_repository.transaction():
            existing_cursor = sync_store_repository.get_applied_operation_cursor(operation_id)
            if existing_cursor is not None:
                stored = sync_store_repository.list_changes_after(existing_cursor - 1, 1)[0]
                accepted.append({"operation_id": operation_id, "cursor": str(existing_cursor),
                                 "duplicate": True, "change": stored})
                continue

            if note_id in blocked_notes:
                conflicts.append({"operation_id": operation_id, "note_id": note_id,
                                  "reason": "dependency_conflict"})
                continue
            result = sync_change_apply.apply_remote_change(change)
            if result["status"] == "conflict":
                conflicts.append(result)
                blocked_notes.add(note_id)
                continue

            if sync_store_repository.uses_app_store():
                from services.hosted_sync_service import project_accepted_change
                project_accepted_change(result['change'])
            cursor = sync_store_repository.persist_applied_change(change, result)
            accepted.append({
                "operation_id": operation_id, "cursor": str(cursor),
                "note_id": result["note_id"], "revision": result["revision"], "change": result["change"],
            })

    return {
        "accepted": accepted,
        "conflicts": conflicts,
        "latest_cursor": get_sync_info()["latest_cursor"],
    }


def pull_changes(cursor: str | None, limit: int = 200) -> dict[str, Any]:
    ensure_sync_store()
    try:
        since = int(cursor or "0")
    except (TypeError, ValueError):
        raise ValidationError("Invalid cursor")
    changes = sync_store_repository.list_changes_after(since, limit)
    latest_cursor = since
    if changes:
        latest_cursor = int(changes[-1]["cursor"])
    return {
        "changes": changes,
        "latest_cursor": str(latest_cursor),
        "missing_blob_hashes": [],
    }


def has_blob(blob_hash: str) -> bool:
    return sync_store_repository.has_blob_record(blob_hash)


def put_blob(blob_hash: str, data: bytes) -> None:
    sync_store_repository.put_blob_record(blob_hash, data)


def get_blob(blob_hash: str) -> bytes:
    return sync_store_repository.get_blob_record(blob_hash)
