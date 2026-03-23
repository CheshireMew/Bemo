import base64
from typing import Any

import httpx
from fastapi import HTTPException, status

from core.paths import MAX_SYNC_BLOB_BYTES

BODY_ENCODING_TEXT = "text"
BODY_ENCODING_BASE64 = "base64"


def _decode_body(body: str | None, body_encoding: str | None) -> bytes | None:
    if body is None:
        return None

    encoding = (body_encoding or BODY_ENCODING_TEXT).strip().lower() or BODY_ENCODING_TEXT
    if encoding == BODY_ENCODING_TEXT:
        return body.encode("utf-8")
    if encoding == BODY_ENCODING_BASE64:
        try:
            return base64.b64decode(body, validate=True)
        except Exception as exc:  # pragma: no cover - fast path handled in API behavior
            raise HTTPException(status_code=400, detail=f"Invalid base64 request body: {exc}") from exc
    raise HTTPException(status_code=400, detail=f"Unsupported body encoding: {encoding}")


def _normalize_headers(headers: dict[str, str]) -> dict[str, str]:
    blocked = {"host", "content-length"}
    return {
        str(key): str(value)
        for key, value in headers.items()
        if str(key).strip() and str(key).lower() not in blocked
    }


async def proxy_webdav_request(payload: dict[str, Any]) -> dict[str, Any]:
    url = str(payload.get("url") or "").strip()
    method = str(payload.get("method") or "GET").strip().upper() or "GET"
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="WebDAV proxy only supports http/https URLs")

    request_body = _decode_body(payload.get("body"), payload.get("bodyEncoding"))
    if request_body is not None and len(request_body) > MAX_SYNC_BLOB_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"WebDAV proxy body exceeds max size of {MAX_SYNC_BLOB_BYTES} bytes",
        )

    async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
        try:
            response = await client.request(
                method,
                url,
                headers=_normalize_headers(payload.get("headers") or {}),
                content=request_body,
            )
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"WebDAV upstream request failed: {exc}") from exc

    response_body = await response.aread()
    if len(response_body) > MAX_SYNC_BLOB_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"WebDAV proxy response exceeds max size of {MAX_SYNC_BLOB_BYTES} bytes",
        )

    return {
        "status": response.status_code,
        "url": str(response.url),
        "headers": dict(response.headers),
        "body": base64.b64encode(response_body).decode("ascii"),
        "bodyEncoding": BODY_ENCODING_BASE64,
    }
