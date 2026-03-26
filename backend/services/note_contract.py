import json
from datetime import datetime
from typing import Any

from core.paths import TZ


def derive_note_title(content: str) -> str:
    first_line = str(content or "").strip().split("\n")[0][:20].strip()
    if first_line.startswith("#"):
        first_line = first_line.lstrip("#").strip()
    return first_line or "untitled"


def normalize_note_tags(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(tag).strip() for tag in value if str(tag).strip()]


def normalize_note_attachments(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []

    attachments: list[dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        filename = str(item.get("filename") or "").strip()
        blob_hash = str(item.get("blob_hash") or "").strip()
        mime_type = str(item.get("mime_type") or "application/octet-stream").strip() or "application/octet-stream"
        if not filename or not blob_hash:
            continue
        attachments.append(
            {
                "filename": filename,
                "blob_hash": blob_hash,
                "mime_type": mime_type,
            }
        )
    return attachments


def normalize_note_timestamp_iso(value: Any, fallback: str | None = None) -> str:
    if isinstance(value, str) and value.strip():
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).isoformat()
        except ValueError:
            pass
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(int(value), TZ).isoformat()
    return fallback or now_iso()


def iso_to_seconds(value: Any) -> int:
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str) and value:
        try:
            return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp())
        except ValueError:
            pass
    return int(datetime.now(TZ).timestamp())


def seconds_to_iso(value: int) -> str:
    return datetime.fromtimestamp(int(value), TZ).isoformat()


def now_iso() -> str:
    return datetime.now(TZ).isoformat()


def app_note_from_row(row: Any) -> dict[str, Any]:
    tags = normalize_note_tags(json.loads(row["tags_json"] or "[]"))
    return {
        "note_id": str(row["note_id"]),
        "revision": int(row["revision"] or 1),
        "filename": str(row["filename"] or ""),
        "title": str(row["title"] or derive_note_title(str(row["content"] or ""))),
        "created_at": iso_to_seconds(row["created_at"]),
        "updated_at": iso_to_seconds(row["updated_at"]),
        "content": str(row["content"] or ""),
        "tags": tags,
        "attachments": normalize_note_attachments(json.loads(row["attachments_json"] or "[]")),
        "pinned": bool(row["pinned"]),
        "deleted_at": str(row["deleted_at"] or ""),
    }
