import base64

from fastapi import APIRouter, Header, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from core.paths import SYNC_TOKEN
from services.image_service import save_synced_image
from services.sync_service import (
    apply_local_changes,
    ensure_sync_store,
    get_blob,
    get_sync_info,
    has_blob,
    pull_changes,
    push_changes,
    put_blob,
)

router = APIRouter()


class ChangePayload(BaseModel):
    operation_id: str
    device_id: str
    entity_id: str
    type: str
    timestamp: str | None = None
    base_revision: int | None = None
    payload: dict = Field(default_factory=dict)


class PushRequest(BaseModel):
    changes: list[ChangePayload] = Field(default_factory=list)


class LocalApplyRequest(BaseModel):
    changes: list[ChangePayload] = Field(default_factory=list)


def _require_sync_auth(authorization: str | None) -> None:
    expected = f"Bearer {SYNC_TOKEN}".strip()
    if not authorization or authorization.strip() != expected:
        raise HTTPException(status_code=401, detail="Unauthorized sync request")


@router.get("/info")
def sync_info(authorization: str | None = Header(default=None)):
    _require_sync_auth(authorization)
    ensure_sync_store()
    return get_sync_info()


@router.post("/push")
def sync_push(payload: PushRequest, authorization: str | None = Header(default=None)):
    _require_sync_auth(authorization)
    ensure_sync_store()
    return push_changes([item.model_dump() for item in payload.changes])


@router.get("/pull")
def sync_pull(cursor: str | None = None, limit: int = 200, authorization: str | None = Header(default=None)):
    _require_sync_auth(authorization)
    ensure_sync_store()
    return pull_changes(cursor, limit=limit)


@router.head("/blobs/{blob_hash:path}")
def sync_blob_head(blob_hash: str, authorization: str | None = Header(default=None)):
    _require_sync_auth(authorization)
    if has_blob(blob_hash):
        return Response(status_code=200)
    return Response(status_code=404)


@router.put("/blobs/{blob_hash:path}")
async def sync_blob_put(blob_hash: str, request: Request, authorization: str | None = Header(default=None)):
    _require_sync_auth(authorization)
    put_blob(blob_hash, await request.body())
    return {"ok": True, "blob_hash": blob_hash}


@router.get("/blobs/{blob_hash:path}")
def sync_blob_get(blob_hash: str, authorization: str | None = Header(default=None)):
    _require_sync_auth(authorization)
    if not has_blob(blob_hash):
        raise HTTPException(status_code=404, detail="Blob not found")
    return StreamingResponse(iter([get_blob(blob_hash)]), media_type="application/octet-stream")


@router.post("/local/apply")
def sync_local_apply(payload: LocalApplyRequest):
    ensure_sync_store()
    return apply_local_changes([item.model_dump() for item in payload.changes])


@router.put("/local/blobs/{filename:path}")
async def sync_local_blob_put(filename: str, request: Request):
    ensure_sync_store()
    return save_synced_image(filename=filename, data=await request.body())
