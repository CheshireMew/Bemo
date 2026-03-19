import os
import shutil
import time

from services.image_reference_service import (
    collect_referenced_images,
    delete_unreferenced_images,
    extract_referenced_images_from_body,
)
from services import note_index_repository
from services.note_repository import cleanup_empty_dirs, collect_notes_recursive, normalize_note_meta, parse_frontmatter
from services.service_errors import NotFoundError

TRASH_RETENTION_DAYS = 90


def auto_cleanup_trash(trash_dir: str):
    if not os.path.exists(trash_dir):
        return
    cutoff = time.time() - TRASH_RETENTION_DAYS * 86400
    for root, _dirs, files in os.walk(trash_dir, topdown=False):
        for filename in files:
            filepath = os.path.join(root, filename)
            try:
                if os.stat(filepath).st_mtime < cutoff:
                    os.remove(filepath)
            except OSError:
                pass
        if root != trash_dir and not os.listdir(root):
            try:
                os.rmdir(root)
            except OSError:
                pass


def list_trash_notes(trash_dir: str) -> list[dict]:
    auto_cleanup_trash(trash_dir)
    notes = collect_notes_recursive(trash_dir)
    notes.sort(key=lambda item: -item["updated_at"])
    return notes


def restore_note(filepath: str, *, notes_dir: str, trash_dir: str) -> dict:
    normalized = filepath if filepath.endswith(".md") else f"{filepath}.md"
    trash_path = os.path.join(trash_dir, normalized)
    if not os.path.exists(trash_path):
        raise NotFoundError("Note not found in trash")

    meta, _body = parse_frontmatter(trash_path)
    note_id = str(normalize_note_meta(meta)["note_id"])
    notes_path = os.path.join(notes_dir, normalized)
    os.makedirs(os.path.dirname(notes_path), exist_ok=True)
    shutil.move(trash_path, notes_path)
    cleanup_empty_dirs(os.path.dirname(trash_path), trash_dir)
    note_index_repository.upsert_note_path(note_id, normalized)
    return {"message": "Note restored", "filename": normalized}


def permanent_delete(filepath: str, *, trash_dir: str, notes_dir: str, images_dir: str) -> dict:
    normalized = filepath if filepath.endswith(".md") else f"{filepath}.md"
    trash_path = os.path.join(trash_dir, normalized)
    if not os.path.exists(trash_path):
        raise NotFoundError("Note not found in trash")

    _meta, body = parse_frontmatter(trash_path)
    referenced_images = extract_referenced_images_from_body(body)
    os.remove(trash_path)
    cleanup_empty_dirs(os.path.dirname(trash_path), trash_dir)
    delete_unreferenced_images(referenced_images, notes_dir=notes_dir, trash_dir=trash_dir, images_dir=images_dir)
    return {"message": "Note permanently deleted"}


def empty_trash(*, trash_dir: str, notes_dir: str, images_dir: str) -> dict:
    referenced_images = collect_referenced_images(trash_dir)
    if os.path.exists(trash_dir):
        shutil.rmtree(trash_dir)
        os.makedirs(trash_dir, exist_ok=True)
    delete_unreferenced_images(referenced_images, notes_dir=notes_dir, trash_dir=trash_dir, images_dir=images_dir)
    return {"message": "Trash emptied"}


def move_note_to_trash(filepath: str, *, notes_dir: str, trash_dir: str) -> dict:
    normalized = filepath if filepath.endswith(".md") else f"{filepath}.md"
    full_path = os.path.join(notes_dir, normalized)
    if not os.path.exists(full_path):
        raise NotFoundError("Note not found")

    meta, _body = parse_frontmatter(full_path)
    note_id = str(normalize_note_meta(meta)["note_id"])
    trash_path = os.path.join(trash_dir, normalized)
    os.makedirs(os.path.dirname(trash_path), exist_ok=True)
    shutil.move(full_path, trash_path)
    cleanup_empty_dirs(os.path.dirname(full_path), notes_dir)
    note_index_repository.remove_note_path(note_id)
    return {"message": "Note moved to trash"}
