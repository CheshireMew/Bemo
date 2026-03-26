import os

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from api import app_storage, attachment_assets, notes_app
from api import sync
from services.service_errors import ServiceError, to_status_code

APP_MODES = {"app", "server", "desktop"}


def _normalize_app_mode(app_mode: str | None) -> str:
    mode = (app_mode or os.getenv("BEMO_APP_MODE", "app")).strip().lower() or "app"
    if mode == "desktop":
        return "app"
    if mode not in APP_MODES:
        raise RuntimeError(f"Unsupported BEMO_APP_MODE: {mode}")
    return mode


def _get_cors_origins(app_mode: str) -> list[str]:
    raw = os.getenv("BEMO_CORS_ORIGINS", "").strip()
    if raw:
        return [item.strip() for item in raw.split(",") if item.strip()]
    if app_mode == "server":
        return []
    return ["*"]


def create_app(app_mode: str | None = None) -> FastAPI:
    from core.paths import ensure_data_directories, has_configured_sync_token

    mode = _normalize_app_mode(app_mode)
    is_app_mode = mode == "app"
    is_server_mode = mode == "server"

    if is_server_mode and not has_configured_sync_token():
        raise RuntimeError("BEMO_SYNC_TOKEN must be set to a non-default value for sync-server mode")

    app = FastAPI(title="Bemo Sync Server API" if is_server_mode else "Bemo App API")

    @app.exception_handler(ServiceError)
    async def handle_service_error(_request, exc: ServiceError):
        return JSONResponse(status_code=to_status_code(exc), content={"detail": str(exc)})

    cors_origins = _get_cors_origins(mode)
    if cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=cors_origins,
            allow_credentials=not ("*" in cors_origins),
            allow_methods=["*"],
            allow_headers=["*"],
        )

    ensure_data_directories()

    app.include_router(sync.router, prefix="/api/sync", tags=["sync"])
    if is_app_mode:
        app.include_router(attachment_assets.router, tags=["app-attachments"])
        app.include_router(notes_app.router, prefix="/api/app/notes", tags=["app-notes"])
        app.include_router(app_storage.router, prefix="/api/app", tags=["app-storage"])

    @app.get("/")
    def read_root():
        return {"status": "ok", "message": "Bemo API is running", "mode": mode}

    return app
