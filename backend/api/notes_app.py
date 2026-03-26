from fastapi import APIRouter
from pydantic import BaseModel

from services.note_store_service import (
    create_note,
    empty_trash,
    list_active_notes,
    list_trash_notes,
    patch_note,
    purge_note,
    restore_note,
    search_active_notes,
    trash_note,
    update_note,
)

router = APIRouter()


class NoteAttachment(BaseModel):
    filename: str
    blob_hash: str
    mime_type: str | None = None


class NoteContent(BaseModel):
    content: str
    tags: list[str] | None = None
    attachments: list[NoteAttachment] | None = None
    created_at: str | None = None
    pinned: bool | None = None
    revision: int | None = None


class NotePatch(BaseModel):
    pinned: bool | None = None
    tags: list[str] | None = None


@router.get("/")
def notes_list():
    return list_active_notes()


@router.get("/search")
def notes_search(q: str = ""):
    return search_active_notes(q)


@router.post("/")
def notes_create(payload: NoteContent):
    attachments = [item.model_dump() for item in (payload.attachments or [])]
    return create_note(
        content=payload.content,
        tags=payload.tags,
        attachments=attachments,
        created_at=payload.created_at,
        pinned=bool(payload.pinned) if payload.pinned is not None else False,
        revision=int(payload.revision or 1),
    )


@router.put("/{note_id}")
def notes_update(note_id: str, payload: NoteContent):
    attachments = [item.model_dump() for item in (payload.attachments or [])]
    return update_note(note_id, content=payload.content, tags=payload.tags, attachments=attachments)


@router.patch("/{note_id}")
def notes_patch(note_id: str, payload: NotePatch):
    return patch_note(note_id, pinned=payload.pinned, tags=payload.tags)


@router.delete("/{note_id}")
def notes_trash(note_id: str):
    return trash_note(note_id)


@router.get("/trash")
def trash_list():
    return list_trash_notes()


@router.post("/trash/{note_id}/restore")
def trash_restore(note_id: str):
    return restore_note(note_id)


@router.delete("/trash/{note_id}")
def trash_purge(note_id: str):
    purge_note(note_id)
    return {"ok": True, "note_id": note_id}


@router.delete("/trash")
def trash_empty():
    return {"deleted_count": empty_trash()}
