from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from services.app_attachment_service import get_attachment

router = APIRouter()


@router.get("/images/{filename:path}")
def attachment_asset_get(filename: str):
    record, data = get_attachment(filename)
    return StreamingResponse(
        iter([data]),
        media_type=str(record.get("mime_type") or "application/octet-stream"),
        headers={
            "Content-Disposition": f'inline; filename="{record["filename"]}"',
        },
    )
