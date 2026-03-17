import os
import re

from services.note_repository import parse_frontmatter


IMAGE_REF_PATTERN = re.compile(r"!\[.*?\]\(/images/([^)]+)\)|\[.*?\]\(/images/([^)]+)\)")


def extract_referenced_images_from_body(body: str) -> set[str]:
    referenced: set[str] = set()
    for match in IMAGE_REF_PATTERN.finditer(body or ""):
        filename = match.group(1) or match.group(2)
        if filename:
            referenced.add(filename)
    return referenced


def collect_referenced_images(base_dir: str) -> set[str]:
    referenced: set[str] = set()
    if not os.path.exists(base_dir):
        return referenced

    for root, _dirs, files in os.walk(base_dir):
        for filename in files:
            if not filename.endswith(".md"):
                continue
            filepath = os.path.join(root, filename)
            try:
                _meta, body = parse_frontmatter(filepath)
            except OSError:
                continue
            referenced.update(extract_referenced_images_from_body(body))

    return referenced


def delete_unreferenced_images(candidates: set[str], *, notes_dir: str, trash_dir: str, images_dir: str):
    if not candidates:
        return

    still_referenced = collect_referenced_images(notes_dir) | collect_referenced_images(trash_dir)
    removable = candidates - still_referenced

    for filename in removable:
        image_path = os.path.join(images_dir, filename)
        try:
            if os.path.exists(image_path) and os.path.isfile(image_path):
                os.remove(image_path)
        except OSError:
            pass


def cleanup_orphan_images(*, notes_dir: str, trash_dir: str, images_dir: str) -> dict:
    if not os.path.exists(images_dir):
        return {"message": "No images directory", "deleted_count": 0, "deleted_files": []}

    still_referenced = collect_referenced_images(notes_dir) | collect_referenced_images(trash_dir)
    deleted_files: list[str] = []

    for filename in os.listdir(images_dir):
        image_path = os.path.join(images_dir, filename)
        if not os.path.isfile(image_path):
            continue
        if filename in still_referenced:
            continue
        try:
            os.remove(image_path)
            deleted_files.append(filename)
        except OSError:
            pass

    return {
        "message": "Cleanup complete",
        "deleted_count": len(deleted_files),
        "deleted_files": deleted_files,
    }
