import os
import shutil
import uuid
from typing import BinaryIO

from core.paths import IMAGES_DIR, NOTES_DIR
from services.archive_io import extract_zip_or_raise, save_upload_to_temp, temporary_work_dir
from services.flomo_import_parser import FlomoAttachment, find_first_html_file, parse_flomo_memos
from services.note_repository import build_frontmatter, sanitize_title
from services.service_errors import ValidationError


def import_native_zip(*, filename: str | None, file_obj: BinaryIO) -> dict:
    if not (filename or "").lower().endswith(".zip"):
        raise ValidationError("Must be a .zip file")

    with temporary_work_dir() as temp_dir:
        zip_path = save_upload_to_temp(file_obj, temp_dir)
        extract_zip_or_raise(zip_path, temp_dir)

        imported_notes = 0
        imported_images = 0

        imported_notes += _import_native_notes(os.path.join(temp_dir, "notes"))
        imported_images += _import_native_images(os.path.join(temp_dir, "images"))

    return {
        "message": "Success",
        "imported_notes": imported_notes,
        "imported_images": imported_images,
    }


def import_flomo_zip(*, filename: str | None, file_obj: BinaryIO) -> dict:
    if not (filename or "").lower().endswith(".zip"):
        raise ValidationError("Must be a .zip file")

    with temporary_work_dir() as temp_dir:
        zip_path = save_upload_to_temp(file_obj, temp_dir)
        extract_zip_or_raise(zip_path, temp_dir)

        html_path = find_first_html_file(temp_dir)
        if not html_path:
            raise ValidationError("No HTML file found in zip")

        imported_count = 0

        for memo in parse_flomo_memos(html_path):
            created_at = memo["created_at"]
            content_text = _append_imported_attachments(memo["content_text"], memo["attachments"])

            if not content_text.strip():
                continue

            _write_imported_note(created_at, memo["tags"], content_text)
            imported_count += 1

    return {"message": "Success", "imported_count": imported_count}


def _import_native_notes(extracted_notes_dir: str) -> int:
    imported_notes = 0
    if not os.path.isdir(extracted_notes_dir):
        return imported_notes

    for root, _, files in os.walk(extracted_notes_dir):
        for fname in files:
            if not fname.endswith(".md"):
                continue
            src = os.path.join(root, fname)
            rel = os.path.relpath(src, extracted_notes_dir).replace("\\", "/")
            dest = os.path.join(NOTES_DIR, rel)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            if not os.path.exists(dest):
                shutil.copy2(src, dest)
                imported_notes += 1

    return imported_notes


def _import_native_images(extracted_images_dir: str) -> int:
    imported_images = 0
    if not os.path.isdir(extracted_images_dir):
        return imported_images

    for fname in os.listdir(extracted_images_dir):
        src = os.path.join(extracted_images_dir, fname)
        if not os.path.isfile(src):
            continue
        dest = os.path.join(IMAGES_DIR, fname)
        if not os.path.exists(dest):
            shutil.copy2(src, dest)
            imported_images += 1

    return imported_images


def _append_imported_attachments(content_text: str, attachments: list[FlomoAttachment]) -> str:
    merged_content = content_text
    for attachment in attachments:
        ext = os.path.splitext(attachment["source_path"])[1] or attachment["default_ext"]
        unique_name = f"{uuid.uuid4().hex}{ext}"
        dest_path = os.path.join(IMAGES_DIR, unique_name)
        shutil.copy2(attachment["source_path"], dest_path)
        attachment_markdown = (
            f"![image](/images/{unique_name})"
            if attachment["is_image"]
            else f"[{attachment['label']}](/images/{unique_name})"
        )
        merged_content = _append_markdown_block(merged_content, attachment_markdown)
    return merged_content


def _write_imported_note(created_at, tags: list[str], content_text: str) -> None:
    timestamp = int(created_at.timestamp())
    date_dir = created_at.strftime("%Y/%m/%d")
    target_dir = os.path.join(NOTES_DIR, date_dir)
    os.makedirs(target_dir, exist_ok=True)

    first_line = content_text.strip().split("\n")[0][:20].strip()
    if first_line.startswith("#"):
        first_line = first_line.lstrip("#").strip()
    title = sanitize_title(first_line) if first_line else "untitled"

    filename = f"{timestamp}_{title}.md"
    filepath = os.path.join(target_dir, filename)

    frontmatter = build_frontmatter(created_at.isoformat(), tags, False)
    with open(filepath, "w", encoding="utf-8") as target:
        target.write(frontmatter + content_text.strip() + "\n")

    os.utime(filepath, (timestamp, timestamp))


def _append_markdown_block(content_text: str, block: str) -> str:
    if not block:
        return content_text
    if not content_text:
        return block
    return content_text + "\n\n" + block
