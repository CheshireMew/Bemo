import os
import shutil
import uuid
from typing import BinaryIO

from core.paths import IMAGES_DIR
from services.service_errors import ValidationError


def save_uploaded_image(*, content_type: str | None, filename: str | None, file_obj: BinaryIO) -> dict:
    if not content_type or not content_type.startswith("image/"):
        raise ValidationError("File must be an image")

    ext = os.path.splitext(filename or "")[1] or ".png"
    unique_filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(IMAGES_DIR, unique_filename)

    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file_obj, buffer)

    return {
        "url": f"/images/{unique_filename}",
        "filename": unique_filename,
        "original_name": filename,
    }


def save_synced_image(*, filename: str, data: bytes) -> dict:
    safe_name = os.path.basename(filename)
    if not safe_name:
        raise ValidationError("Invalid synced image filename")

    filepath = os.path.join(IMAGES_DIR, safe_name)
    with open(filepath, "wb") as buffer:
        buffer.write(data)

    return {
        "url": f"/images/{safe_name}",
        "filename": safe_name,
        "original_name": safe_name,
    }
