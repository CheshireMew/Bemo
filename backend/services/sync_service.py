from typing import Any

from services import sync_store_repository
from services.service_errors import ValidationError


def ensure_sync_store() -> None:
    sync_store_repository.ensure_sync_store()


def get_sync_info() -> dict[str, Any]:
    return {
        "format_version": 1,
        "latest_cursor": str(sync_store_repository.get_latest_cursor()),
        "blob_prefix": "/api/sync/blobs",
    }


def push_changes(changes: list[dict[str, Any]]) -> dict[str, Any]:
    ensure_sync_store()
    accepted: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []

    for change in changes:
        operation_id = str(change.get("operation_id") or "")
        if not operation_id:
            conflicts.append({"operation_id": "", "reason": "missing_operation_id"})
            continue

        existing_cursor = sync_store_repository.get_applied_operation_cursor(operation_id)
        if existing_cursor is not None:
            accepted.append({
                "operation_id": operation_id,
                "cursor": str(existing_cursor),
                "duplicate": True,
            })
            continue

        result = sync_store_repository.apply_remote_change(change)
        if result["status"] == "conflict":
            conflicts.append(result)
            continue

        cursor = sync_store_repository.persist_applied_change(change, result)
        accepted.append({
            "operation_id": operation_id,
            "cursor": str(cursor),
            "note_id": result["note_id"],
            "revision": result["revision"],
            "change": result["change"],
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
