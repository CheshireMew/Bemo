import os
import re
from datetime import datetime
from typing import TypedDict

from services.flomo_codec import get_flomo_html_template, markdown_to_flomo_html

IMAGE_ATTACHMENT_PATTERN = re.compile(r"!\[.*?\]\(/images/([^)]+)\)")
FILE_ATTACHMENT_PATTERN = re.compile(r"\[([^\]]*)\]\(/images/([^)]+)\)")
_AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".ogg", ".aac", ".flac", ".opus"}


class FlomoExportMemo(TypedDict):
    html: str
    attachments: list[tuple[str, str]]


def collect_referenced_attachments(notes_dir: str) -> set[str]:
    referenced = set()
    for root, _, files in os.walk(notes_dir):
        for fname in files:
            if not fname.endswith(".md"):
                continue
            try:
                with open(os.path.join(root, fname), "r", encoding="utf-8") as file:
                    content = file.read()
                for match in IMAGE_ATTACHMENT_PATTERN.finditer(content):
                    referenced.add(match.group(1))
                for match in FILE_ATTACHMENT_PATTERN.finditer(content):
                    referenced.add(match.group(2))
            except OSError:
                pass
    return referenced


def build_flomo_export_document(
    notes: list[dict],
    *,
    images_dir: str,
    export_tz,
) -> tuple[str, list[tuple[str, str]]]:
    memos_html = []
    attachment_files: list[tuple[str, str]] = []

    for note in notes:
        memo = build_flomo_export_memo(note, images_dir=images_dir, export_tz=export_tz)
        memos_html.append(memo["html"])
        attachment_files.extend(memo["attachments"])

    full_html = get_flomo_html_template().format(
        export_date=datetime.now(export_tz).strftime("%Y-%m-%d"),
        count=len(notes),
        memos_html="\n".join(memos_html),
    )
    return full_html, attachment_files


def build_flomo_export_memo(note: dict, *, images_dir: str, export_tz) -> FlomoExportMemo:
    dt = datetime.fromtimestamp(note["created_at"], tz=export_tz)
    time_str = dt.strftime("%Y-%m-%d %H:%M:%S")

    content = note.get("content", "") or ""
    html_content = markdown_to_flomo_html(content)
    files_html, attachment_files = _build_files_html(content, images_dir=images_dir)

    memo_html = f"""    <div class="memo">
      <div class="time">{time_str}</div>
      <div class="content">{html_content}</div>
      <div class="files">
        {files_html}
      </div>
    </div>
  """
    return {"html": memo_html, "attachments": attachment_files}


def _build_files_html(content: str, *, images_dir: str) -> tuple[str, list[tuple[str, str]]]:
    files_html_parts = []
    attachment_files = []

    for match in IMAGE_ATTACHMENT_PATTERN.finditer(content):
        img_name = match.group(1)
        local_path = os.path.join(images_dir, img_name)
        if not os.path.exists(local_path):
            continue
        files_html_parts.append(f'<img src="file/{img_name}" />')
        attachment_files.append((f"file/{img_name}", local_path))

    for match in FILE_ATTACHMENT_PATTERN.finditer(content):
        label = match.group(1).strip()
        file_name = match.group(2)
        local_path = os.path.join(images_dir, file_name)
        if not os.path.exists(local_path):
            continue

        extension = os.path.splitext(file_name)[1].lower()
        if extension in _AUDIO_EXTENSIONS or "音频" in label.lower():
            files_html_parts.append(f'<audio src="file/{file_name}"></audio>')
        else:
            link_text = label or "文件附件"
            files_html_parts.append(f'<a href="file/{file_name}">{link_text}</a>')
        attachment_files.append((f"file/{file_name}", local_path))

    return "\n".join(files_html_parts), attachment_files
