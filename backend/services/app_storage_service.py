import json
import re
from typing import Any
from urllib.parse import unquote

from services import app_store_repository
from services.note_contract import derive_note_title, normalize_note_tags, normalize_note_timestamp_iso, now_iso
from services.note_store_service import list_active_notes, list_trash_notes
from services.service_errors import ValidationError

ATTACHMENT_URL_PATTERN = re.compile(r"/images/([^)\s\"'`>]+)")


def build_backup_payload() -> dict[str, Any]:
    notes = list_active_notes()
    trash = list_trash_notes()
    referenced = _collect_referenced_filenames(notes + trash)
    attachment_records = {
        str(record["filename"]): record
        for record in app_store_repository.list_attachment_records()
        if str(record.get("filename") or "") in referenced
    }

    attachments: list[dict[str, Any]] = []
    for filename in sorted(referenced):
        record = attachment_records.get(filename)
        if not record:
            continue
        blob_hash = str(record.get("blob_hash") or "")
        if not blob_hash or not app_store_repository.has_blob_record(blob_hash):
            continue
        attachments.append(
            {
                "filename": filename,
                "mime_type": str(record.get("mime_type") or "application/octet-stream"),
                "data": list(app_store_repository.get_blob_record(blob_hash)),
            }
        )

    return {
        "format": "bemo-backup",
        "version": 3,
        "exported_at": now_iso(),
        "notes": notes,
        "trash": trash,
        "attachments": attachments,
    }


def apply_backup_payload(payload: dict[str, Any]) -> dict[str, int]:
    if payload.get("format") != "bemo-backup" or payload.get("version") not in {1, 2, 3}:
        raise ValidationError("Unsupported backup payload")

    notes = _normalize_notes(payload.get("notes"))
    trash = _normalize_notes(payload.get("trash"))
    attachments = _normalize_backup_attachments(payload.get("attachments"))

    wipe_app_storage()

    attachment_index: dict[str, dict[str, str]] = {}
    for item in attachments:
        blob = bytes(item["data"])
        blob_hash = _blob_hash(blob)
        app_store_repository.put_blob_record(blob_hash, blob)
        app_store_repository.upsert_attachment_record(
            item["filename"],
            blob_hash,
            item["mime_type"],
            len(blob),
            now_iso(),
        )
        attachment_index[item["filename"]] = {
            "filename": item["filename"],
            "blob_hash": blob_hash,
            "mime_type": item["mime_type"],
        }

    for note in notes:
        _upsert_note_snapshot(note, attachment_index, deleted=False)
    for note in trash:
        _upsert_note_snapshot(note, attachment_index, deleted=True)

    return {
        "imported_notes": len(notes) + len(trash),
        "imported_images": len(attachments),
    }


def get_attachment_summary() -> dict[str, int]:
    rows = app_store_repository.list_notes()

    active: set[str] = set()
    trash: set[str] = set()
    total_refs = 0

    for row in rows:
        filenames = _collect_referenced_filenames_from_row(row["content"], row["attachments_json"])
        total_refs += len(filenames)
        if row["deleted_at"]:
            trash.update(filenames)
        else:
            active.update(filenames)

    stored = app_store_repository.list_attachment_records()
    return {
        "activeAttachments": len(active),
        "trashAttachments": len(trash),
        "totalReferencedAttachments": len(active | trash),
        "totalAttachmentRefs": total_refs,
        "storedAttachments": len(stored),
    }


def cleanup_orphan_attachments() -> dict[str, Any]:
    referenced = _collect_backend_referenced_filenames()
    records = app_store_repository.list_attachment_records()
    deleted_files: list[str] = []

    for record in records:
        filename = str(record.get("filename") or "")
        if not filename or filename in referenced:
            continue
        deleted_files.append(filename)
        app_store_repository.delete_attachment_record(filename)

    remaining_blob_hashes = {
        str(record.get("blob_hash") or "")
        for record in app_store_repository.list_attachment_records()
        if str(record.get("blob_hash") or "")
    }
    for record in records:
        filename = str(record.get("filename") or "")
        blob_hash = str(record.get("blob_hash") or "")
        if filename not in deleted_files or not blob_hash or blob_hash in remaining_blob_hashes:
            continue
        app_store_repository.delete_blob_record(blob_hash)

    return {
        "deleted_count": len(deleted_files),
        "deleted_files": deleted_files,
    }


def wipe_app_storage() -> None:
    app_store_repository.clear_all_data()


def _normalize_notes(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _normalize_backup_attachments(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []

    attachments: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        filename = str(item.get("filename") or "").strip()
        mime_type = str(item.get("mime_type") or "application/octet-stream").strip() or "application/octet-stream"
        data = item.get("data")
        if not filename or not isinstance(data, list):
            continue
        try:
            bytes(data)
        except ValueError:
            continue
        attachments.append(
            {
                "filename": filename,
                "mime_type": mime_type,
                "data": data,
            }
        )
    return attachments


def _upsert_note_snapshot(
    note: dict[str, Any],
    attachment_index: dict[str, dict[str, str]],
    *,
    deleted: bool,
) -> None:
    note_id = str(note.get("note_id") or "").strip()
    if not note_id:
        return

    content = str(note.get("content") or "")
    tags = normalize_note_tags(note.get("tags"))
    created_at = normalize_note_timestamp_iso(note.get("created_at"))
    updated_at = normalize_note_timestamp_iso(note.get("updated_at"), fallback=created_at)
    attachments = [
        attachment_index[filename]
        for filename in _collect_referenced_filenames([note])
        if filename in attachment_index
    ]
    app_store_repository.upsert_note(
        {
            "note_id": note_id,
            "filename": str(note.get("filename") or ""),
            "title": str(note.get("title") or derive_note_title(content)),
            "content": content,
            "tags_json": json.dumps(tags, ensure_ascii=False),
            "attachments_json": json.dumps(attachments, ensure_ascii=False),
            "pinned": bool(note.get("pinned")),
            "revision": max(1, _int_or_default(note.get("revision"), 1)),
            "created_at": created_at,
            "updated_at": updated_at,
            "deleted_at": updated_at if deleted else None,
        }
    )


def _collect_backend_referenced_filenames() -> set[str]:
    referenced: set[str] = set()
    for row in app_store_repository.list_notes():
        referenced.update(_collect_referenced_filenames_from_row(row["content"], row["attachments_json"]))
    return referenced


def _collect_referenced_filenames(notes: list[dict[str, Any]]) -> set[str]:
    referenced: set[str] = set()
    for note in notes:
        referenced.update(_collect_referenced_filenames_from_row(note.get("content"), note.get("attachments")))
    return referenced


def _collect_referenced_filenames_from_row(content: Any, attachments_source: Any) -> set[str]:
    filenames: set[str] = set()
    for match in ATTACHMENT_URL_PATTERN.findall(str(content or "")):
        filenames.add(unquote(str(match)))

    if isinstance(attachments_source, str):
        try:
            attachments_source = json.loads(attachments_source)
        except json.JSONDecodeError:
            attachments_source = []

    if isinstance(attachments_source, list):
        for item in attachments_source:
            if not isinstance(item, dict):
                continue
            filename = str(item.get("filename") or "").strip()
            if filename:
                filenames.add(filename)

    return filenames


def _blob_hash(data: bytes) -> str:
    import hashlib

    return f"sha256:{hashlib.sha256(data).hexdigest()}"


def _int_or_default(value: Any, fallback: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback
