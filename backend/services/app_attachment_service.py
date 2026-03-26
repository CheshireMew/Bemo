import hashlib
from urllib.parse import quote

from services import app_store_repository
from services.note_contract import now_iso
from services.service_errors import NotFoundError, ValidationError


def register_attachment(filename: str, data: bytes, mime_type: str | None = None) -> dict:
    clean_filename = _normalize_filename(filename)
    if not clean_filename:
        raise ValidationError("Attachment filename is required")

    blob_bytes = bytes(data or b"")
    blob_hash = f"sha256:{hashlib.sha256(blob_bytes).hexdigest()}"
    normalized_mime = str(mime_type or "application/octet-stream").strip() or "application/octet-stream"

    app_store_repository.put_blob_record(blob_hash, blob_bytes)
    app_store_repository.upsert_attachment_record(
        clean_filename,
        blob_hash,
        normalized_mime,
        len(blob_bytes),
        now_iso(),
    )

    return {
        "filename": clean_filename,
        "blob_hash": blob_hash,
        "mime_type": normalized_mime,
        "size": len(blob_bytes),
        "url": f"/images/{quote(clean_filename)}",
    }


def get_attachment(filename: str) -> tuple[dict, bytes]:
    clean_filename = _normalize_filename(filename)
    record = app_store_repository.get_attachment_record(clean_filename)
    if not record:
        raise NotFoundError("Attachment not found")

    blob_hash = str(record.get("blob_hash") or "")
    if not blob_hash or not app_store_repository.has_blob_record(blob_hash):
        raise NotFoundError("Attachment blob not found")

    return record, app_store_repository.get_blob_record(blob_hash)


def list_attachments() -> list[dict]:
    return app_store_repository.list_attachment_records()


def _normalize_filename(filename: str | None) -> str:
    return str(filename or "").strip().replace("\\", "/").split("/")[-1]
