import os

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from api import sync
from services.service_errors import ServiceError, to_status_code

LEGACY_PATH_PREFIXES = (
    "/api/notes",
    "/api/uploads",
    "/api/settings",
    "/api/ai",
    "/api/sync/local",
    "/images",
)


def _get_cors_origins(app_mode: str) -> list[str]:
    raw = os.getenv("BEMO_CORS_ORIGINS", "").strip()
    if raw:
        return [item.strip() for item in raw.split(",") if item.strip()]
    if app_mode == "server":
        return []
    return ["*"]


def create_app(app_mode: str | None = None) -> FastAPI:
    from core.paths import ensure_data_directories, has_configured_sync_token

    mode = (app_mode or os.getenv("BEMO_APP_MODE", "desktop")).strip().lower() or "desktop"
    is_server_mode = mode == "server"

    if is_server_mode and not has_configured_sync_token():
        raise RuntimeError("BEMO_SYNC_TOKEN must be set to a non-default value for sync-server mode")

    app = FastAPI(title="Bemo Sync Server API" if is_server_mode else "Bemo Notes API")

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
    if not is_server_mode:
        from fastapi.staticfiles import StaticFiles
        from _archive_legacy.api import (
            ai_legacy as ai,
            notes_legacy as notes,
            settings_legacy as settings,
            sync_local_legacy as sync_local,
            uploads_legacy as uploads,
        )
        from core.paths import IMAGES_DIR

        @app.middleware("http")
        async def add_legacy_api_headers(request, call_next):
            response = await call_next(request)
            path = request.url.path
            if path.startswith(LEGACY_PATH_PREFIXES):
                response.headers["X-Bemo-Legacy-API"] = "deprecated"
                response.headers["Warning"] = (
                    '299 Bemo "Legacy backend API; frontend-owned path preferred."'
                )
            return response

        app.mount("/images", StaticFiles(directory=IMAGES_DIR), name="images")
        app.include_router(notes.router, prefix="/api/notes", tags=["notes"])
        app.include_router(uploads.router, prefix="/api/uploads", tags=["uploads"])
        app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
        app.include_router(ai.router, prefix="/api/ai", tags=["ai"])
        app.include_router(sync_local.router, prefix="/api/sync/local", tags=["sync-local"])

    @app.get("/")
    def read_root():
        return {"status": "ok", "message": "Bemo API is running", "mode": mode}

    return app
