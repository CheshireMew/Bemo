from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.paths import DATA_DIR, IMAGES_DIR, NOTES_DIR, TRASH_DIR, TZ, TZ_OFFSET
from services.image_reference_service import (
    cleanup_orphan_images as cleanup_orphan_image_files,
    collect_referenced_images,
    delete_unreferenced_images,
    extract_referenced_images_from_body,
)
from services.note_query_service import list_notes_sorted, search_notes as search_notes_by_query
from services.note_repository import (
    build_frontmatter,
    cleanup_empty_dirs,
    collect_notes_recursive,
    create_note as create_note_record,
    get_note as get_note_record,
    parse_frontmatter,
    patch_note as patch_note_record,
    sanitize_title,
    update_note as update_note_record,
)
from services.service_errors import NotFoundError
from services.trash_service import (
    empty_trash as empty_trash_notes,
    list_trash_notes,
    move_note_to_trash,
    permanent_delete as permanently_delete_from_trash,
    restore_note as restore_note_from_trash,
)

router = APIRouter()


class NoteContent(BaseModel):
    content: str
    tags: Optional[List[str]] = None


class NotePatch(BaseModel):
    pinned: Optional[bool] = None
    tags: Optional[List[str]] = None


class NoteMeta(BaseModel):
    note_id: str = ""
    revision: int = 1
    filename: str
    title: str
    created_at: float
    updated_at: float
    content: Optional[str] = None
    tags: List[str] = []
    pinned: bool = False


def _parse_frontmatter(filepath: str) -> tuple[dict, str]:
    return parse_frontmatter(filepath)


def _build_frontmatter(created_at: str, tags: list, pinned: bool) -> str:
    return build_frontmatter(created_at, tags, pinned)


def _sanitize_title(title: str) -> str:
    return sanitize_title(title)


def _collect_notes_recursive(base_dir: str) -> List[dict]:
    return collect_notes_recursive(base_dir)


def _extract_referenced_images_from_body(body: str) -> set[str]:
    return extract_referenced_images_from_body(body)


def _collect_referenced_images(base_dir: str) -> set[str]:
    return collect_referenced_images(base_dir)


def _delete_unreferenced_images(candidates: set[str]):
    return delete_unreferenced_images(candidates, notes_dir=NOTES_DIR, trash_dir=TRASH_DIR, images_dir=IMAGES_DIR)


@router.get("/", response_model=List[NoteMeta])
def list_notes():
    return list_notes_sorted(NOTES_DIR)


@router.get("/search", response_model=List[NoteMeta])
def search_notes(q: str = ""):
    return search_notes_by_query(NOTES_DIR, q)


@router.post("/maintenance/cleanup-orphan-images")
def cleanup_orphan_images():
    return cleanup_orphan_image_files(notes_dir=NOTES_DIR, trash_dir=TRASH_DIR, images_dir=IMAGES_DIR)


@router.post("/")
def create_note(note: NoteContent):
    return create_note_record(NOTES_DIR, TZ, note.content, note.tags)


@router.get("/trash/list", response_model=List[NoteMeta])
def list_trash():
    return list_trash_notes(TRASH_DIR)


@router.post("/trash/restore/{filepath:path}")
def restore_note(filepath: str):
    try:
        return restore_note_from_trash(filepath, notes_dir=NOTES_DIR, trash_dir=TRASH_DIR)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.delete("/trash/permanent/{filepath:path}")
def permanent_delete(filepath: str):
    try:
        return permanently_delete_from_trash(
            filepath,
            trash_dir=TRASH_DIR,
            notes_dir=NOTES_DIR,
            images_dir=IMAGES_DIR,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.delete("/trash/empty")
def empty_trash():
    return empty_trash_notes(trash_dir=TRASH_DIR, notes_dir=NOTES_DIR, images_dir=IMAGES_DIR)


@router.get("/{filepath:path}")
def get_note(filepath: str):
    try:
        return get_note_record(NOTES_DIR, filepath)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.put("/{filepath:path}")
def update_note(filepath: str, note: NoteContent):
    try:
        return update_note_record(NOTES_DIR, filepath, content=note.content, tags=note.tags, tz=TZ)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.patch("/{filepath:path}")
def patch_note(filepath: str, patch: NotePatch):
    try:
        return patch_note_record(NOTES_DIR, filepath, pinned=patch.pinned, tags=patch.tags, tz=TZ)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.delete("/{filepath:path}")
def delete_note(filepath: str):
    try:
        return move_note_to_trash(filepath, notes_dir=NOTES_DIR, trash_dir=TRASH_DIR)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
