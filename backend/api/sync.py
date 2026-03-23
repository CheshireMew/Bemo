from fastapi import APIRouter, Header, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from core.paths import MAX_SYNC_BLOB_BYTES, SYNC_TOKEN
from services.sync_service import (
    ensure_sync_store,
    get_blob,
    get_sync_info,
    has_blob,
    pull_changes,
    push_changes,
    put_blob,
)
from services.webdav_proxy_service import proxy_webdav_request

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


class WebDavProxyRequest(BaseModel):
    url: str
    method: str = "GET"
    headers: dict[str, str] = Field(default_factory=dict)
    body: str | None = None
    bodyEncoding: str | None = None


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


@router.post("/webdav/request")
async def sync_webdav_request(payload: WebDavProxyRequest, authorization: str | None = Header(default=None)):
    _require_sync_auth(authorization)
    return await proxy_webdav_request(payload.model_dump())


@router.head("/blobs/{blob_hash:path}")
def sync_blob_head(blob_hash: str, authorization: str | None = Header(default=None)):
    _require_sync_auth(authorization)
    if has_blob(blob_hash):
        return Response(status_code=200)
    return Response(status_code=404)


@router.put("/blobs/{blob_hash:path}")
async def sync_blob_put(blob_hash: str, request: Request, authorization: str | None = Header(default=None)):
    _require_sync_auth(authorization)
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_SYNC_BLOB_BYTES:
                raise HTTPException(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                    detail=f"Blob exceeds max size of {MAX_SYNC_BLOB_BYTES} bytes",
                )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid Content-Length header")

    chunks = bytearray()
    async for chunk in request.stream():
        chunks.extend(chunk)
        if len(chunks) > MAX_SYNC_BLOB_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"Blob exceeds max size of {MAX_SYNC_BLOB_BYTES} bytes",
            )

    put_blob(blob_hash, bytes(chunks))
    return {"ok": True, "blob_hash": blob_hash}


@router.get("/blobs/{blob_hash:path}")
def sync_blob_get(blob_hash: str, authorization: str | None = Header(default=None)):
    _require_sync_auth(authorization)
    if not has_blob(blob_hash):
        raise HTTPException(status_code=404, detail="Blob not found")
    return StreamingResponse(iter([get_blob(blob_hash)]), media_type="application/octet-stream")
