from fastapi import APIRouter, Header
from pydantic import BaseModel
from services.app_sync_service import mutate, parse_sync_context

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
def notes_create(payload: NoteContent, x_bemo_sync_context: str | None = Header(default=None)):
    attachments = [item.model_dump() for item in (payload.attachments or [])]
    return mutate(lambda: create_note(
        content=payload.content,
        tags=payload.tags,
        attachments=attachments,
        created_at=payload.created_at,
        pinned=bool(payload.pinned) if payload.pinned is not None else False,
        revision=int(payload.revision or 1),
    ), "note.create", parse_sync_context(x_bemo_sync_context))


@router.put("/{note_id}")
def notes_update(note_id: str, payload: NoteContent, x_bemo_sync_context: str | None = Header(default=None)):
    attachments = [item.model_dump() for item in (payload.attachments or [])]
    return mutate(lambda: update_note(note_id, content=payload.content, tags=payload.tags, attachments=attachments), "note.update", parse_sync_context(x_bemo_sync_context), note_id)


@router.patch("/{note_id}")
def notes_patch(note_id: str, payload: NotePatch, x_bemo_sync_context: str | None = Header(default=None)):
    return mutate(lambda: patch_note(note_id, pinned=payload.pinned, tags=payload.tags), "note.patch", parse_sync_context(x_bemo_sync_context), note_id)


@router.get("/trash")
def trash_list():
    return list_trash_notes()


@router.post("/trash/{note_id}/restore")
def trash_restore(note_id: str, x_bemo_sync_context: str | None = Header(default=None)):
    return mutate(lambda: restore_note(note_id), "note.restore", parse_sync_context(x_bemo_sync_context), note_id)


@router.delete("/trash/{note_id}")
def trash_purge(note_id: str, x_bemo_sync_context: str | None = Header(default=None)):
    mutate(lambda: purge_note(note_id), "note.purge", parse_sync_context(x_bemo_sync_context), note_id)
    return {"ok": True, "note_id": note_id}


@router.delete("/trash")
def trash_empty(x_bemo_sync_context: str | None = Header(default=None)):
    deleted = mutate(empty_trash, "note.purge", parse_sync_context(x_bemo_sync_context))
    return {"deleted_count": len(deleted), "deleted_notes": deleted}


@router.delete("/{note_id}")
def notes_trash(note_id: str, x_bemo_sync_context: str | None = Header(default=None)):
    return mutate(lambda: trash_note(note_id), "note.trash", parse_sync_context(x_bemo_sync_context), note_id)
