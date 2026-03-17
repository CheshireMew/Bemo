from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from services.export_service import build_flomo_export_archive, build_native_export_archive
from services.image_service import save_uploaded_image
from services.import_service import import_flomo_zip, import_native_zip
from services.service_errors import ValidationError

router = APIRouter()


@router.post("/")
async def upload_image(file: UploadFile = File(...)):
    try:
        return save_uploaded_image(
            content_type=file.content_type,
            filename=file.filename,
            file_obj=file.file,
        )
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/export/zip")
async def export_zip():
    buffer, filename = build_native_export_archive()
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/flomo")
async def export_flomo():
    buffer, filename = build_flomo_export_archive()
    return StreamingResponse(
        buffer,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/zip")
async def import_zip(file: UploadFile = File(...)):
    try:
        return import_native_zip(filename=file.filename, file_obj=file.file)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/flomo")
async def import_flomo(file: UploadFile = File(...)):
    try:
        return import_flomo_zip(filename=file.filename, file_obj=file.file)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
