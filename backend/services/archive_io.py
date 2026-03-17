import os
import shutil
import uuid
import zipfile
from typing import BinaryIO
from contextlib import contextmanager

from core.paths import DATA_DIR
from services.service_errors import ValidationError


@contextmanager
def temporary_work_dir():
    temp_root = os.path.join(DATA_DIR, ".tmp")
    os.makedirs(temp_root, exist_ok=True)
    work_dir = os.path.join(temp_root, f"import-{uuid.uuid4().hex}")
    os.makedirs(work_dir, exist_ok=True)
    try:
        yield work_dir
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def save_upload_to_temp(file_obj: BinaryIO, temp_dir: str) -> str:
    zip_path = os.path.join(temp_dir, "upload.zip")
    with open(zip_path, "wb") as target:
        shutil.copyfileobj(file_obj, target)
    return zip_path


def extract_zip_or_raise(zip_path: str, temp_dir: str) -> None:
    try:
        with zipfile.ZipFile(zip_path, "r") as archive:
            archive.extractall(temp_dir)
    except zipfile.BadZipFile:
        raise ValidationError("Invalid zip file")
