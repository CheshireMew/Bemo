import os
from datetime import datetime
from typing import TypedDict

from bs4 import BeautifulSoup

from core.paths import TZ
from services.flomo_codec import extract_tags_from_text, parse_flomo_content


class FlomoAttachment(TypedDict):
    label: str
    source_path: str
    default_ext: str
    is_image: bool


class FlomoMemo(TypedDict):
    created_at: datetime
    content_text: str
    tags: list[str]
    attachments: list[FlomoAttachment]


def find_first_html_file(root_dir: str) -> str | None:
    for root, _, files in os.walk(root_dir):
        for filename in files:
            if filename.lower().endswith(".html"):
                return os.path.join(root, filename)
    return None


def parse_flomo_memos(html_path: str) -> list[FlomoMemo]:
    html_root = os.path.dirname(html_path)
    with open(html_path, "r", encoding="utf-8", errors="ignore") as source:
        soup = BeautifulSoup(source.read(), "html.parser")

    memos: list[FlomoMemo] = []
    for memo in soup.find_all("div", class_="memo"):
        memos.append(parse_flomo_memo(memo, html_root))
    return memos


def parse_flomo_memo(memo, html_root: str) -> FlomoMemo:
    content_text = parse_flomo_content(memo.find("div", class_="content"))

    audio_texts = [
        audio_content.get_text(strip=True)
        for audio_content in memo.find_all("div", class_="audio-player__content")
    ]
    if audio_texts:
        content_text = _append_sections(content_text, audio_texts)

    return {
        "created_at": _parse_created_at(memo),
        "content_text": content_text,
        "tags": extract_tags_from_text(content_text),
        "attachments": _parse_attachments(memo.find("div", class_="files"), html_root),
    }


def _parse_created_at(memo) -> datetime:
    time_el = memo.find("div", class_="time")
    if not time_el:
        return datetime.now(TZ)

    time_str = time_el.get_text(strip=True)
    try:
        parsed_time = datetime.strptime(time_str, "%Y-%m-%d %H:%M:%S")
        return parsed_time.replace(tzinfo=TZ)
    except ValueError:
        return datetime.now(TZ)


def _parse_attachments(files_el, html_root: str) -> list[FlomoAttachment]:
    if not files_el:
        return []

    attachments: list[FlomoAttachment] = []
    attachments.extend(_collect_attachments(files_el, "img", "src", "image", ".png", html_root, True))
    attachments.extend(
        _collect_attachments(files_el, "audio", "src", "音频附件", ".bin", html_root, False)
    )
    attachments.extend(
        _collect_attachments(files_el, "a", "href", "文件附件", ".bin", html_root, False)
    )
    return attachments


def _collect_attachments(
    files_el,
    tag_name: str,
    attr_name: str,
    label: str,
    default_ext: str,
    html_root: str,
    is_image: bool,
) -> list[FlomoAttachment]:
    attachments: list[FlomoAttachment] = []
    for media in files_el.find_all(tag_name):
        src = media.get(attr_name)
        if not src or src.startswith("http") or src.startswith("data:"):
            continue
        source_path = _resolve_local_attachment_path(html_root, src)
        if source_path:
            attachments.append(
                {
                    "label": label,
                    "source_path": source_path,
                    "default_ext": default_ext,
                    "is_image": is_image,
                }
            )
    return attachments


def _resolve_local_attachment_path(html_root: str, src: str) -> str | None:
    normalized_src = src.split("?")[0].split("#")[0]
    local_path = os.path.normpath(os.path.join(html_root, normalized_src))
    if not os.path.exists(local_path):
        return None
    return local_path


def _append_sections(content_text: str, sections: list[str]) -> str:
    cleaned_sections = [section for section in sections if section]
    if not cleaned_sections:
        return content_text
    if not content_text:
        return "\n\n".join(cleaned_sections)
    return content_text + "\n\n" + "\n\n".join(cleaned_sections)
