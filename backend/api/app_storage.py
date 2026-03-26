from fastapi import APIRouter, File, UploadFile

from services.app_attachment_service import register_attachment
from services.app_storage_service import (
    apply_backup_payload,
    build_backup_payload,
    cleanup_orphan_attachments,
    get_attachment_summary,
    wipe_app_storage,
)

router = APIRouter()


@router.post("/attachments")
async def attachments_upload(file: UploadFile = File(...)):
    data = await file.read()
    return register_attachment(file.filename or "attachment.bin", data, file.content_type)


@router.get("/storage/backup")
def storage_backup_export():
    return build_backup_payload()


@router.post("/storage/backup")
def storage_backup_import(payload: dict):
    return apply_backup_payload(payload)


@router.get("/storage/attachment-summary")
def storage_attachment_summary():
    return get_attachment_summary()


@router.post("/storage/cleanup-orphans")
def storage_cleanup_orphans():
    return cleanup_orphan_attachments()


@router.delete("/storage")
def storage_clear():
    wipe_app_storage()
    return {"ok": True}
