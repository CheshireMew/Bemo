import csv
import io
import os
import zipfile
from datetime import datetime

from core.paths import IMAGES_DIR, NOTES_DIR, TZ
from services.export_archive_io import build_zip_buffer, write_files_to_archive
from services.flomo_export_builder import collect_referenced_attachments
from services.note_repository import collect_notes_recursive


def build_native_export_archive() -> tuple[io.BytesIO, str]:
    buffer = build_zip_buffer()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        write_files_to_archive(
            archive,
            NOTES_DIR,
            "notes/",
            predicate=lambda _filepath, fname: fname.endswith(".md"),
        )

        referenced = collect_referenced_attachments(NOTES_DIR)
        write_files_to_archive(
            archive,
            IMAGES_DIR,
            "images/",
            predicate=lambda filepath, fname: os.path.isfile(filepath) and fname in referenced,
        )

    buffer.seek(0)
    filename = f'bemo_backup_{datetime.now(TZ).strftime("%Y%m%d_%H%M%S")}.zip'
    return buffer, filename


def build_flomo_export_archive() -> tuple[io.BytesIO, str]:
    all_notes = collect_notes_recursive(NOTES_DIR)
    all_notes.sort(key=lambda item: -item["created_at"])

    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer)
    writer.writerow(["content", "created_at"])

    for note in all_notes:
        created_at = _format_flomo_created_at(datetime.fromtimestamp(note["created_at"], tz=TZ))
        content = _build_flomo_csv_content(note.get("content", "") or "")
        if not content.strip():
            continue
        writer.writerow([content, created_at])

    csv_bytes = io.BytesIO(buffer.getvalue().encode("utf-8-sig"))
    csv_bytes.seek(0)
    filename = f'bemo_flomo_{datetime.now(TZ).strftime("%Y%m%d_%H%M%S")}.csv'
    return csv_bytes, filename


def _build_flomo_csv_content(content: str) -> str:
    lines: list[str] = []
    for raw_line in content.splitlines():
        stripped = raw_line.strip()

        if stripped.startswith("![") and "](/images/" in stripped:
            continue
        if stripped.startswith("[") and "](/images/" in stripped:
            continue

        lines.append(raw_line.rstrip())

    cleaned = "\n".join(lines).strip()
    return cleaned


def _format_flomo_created_at(dt: datetime) -> str:
    return f"{dt.year}/{dt.month}/{dt.day} {dt.hour}:{dt.minute:02d}"
