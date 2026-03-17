from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from core.paths import IMAGES_DIR, ensure_data_directories
from api import notes, uploads, settings, ai, sync

app = FastAPI(title="Bemo Notes API")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development, allow all
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ensure_data_directories()

# Mount static files for images
app.mount("/images", StaticFiles(directory=IMAGES_DIR), name="images")

# Setup routers
app.include_router(notes.router, prefix="/api/notes", tags=["notes"])
app.include_router(uploads.router, prefix="/api/uploads", tags=["uploads"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(ai.router, prefix="/api/ai", tags=["ai"])
app.include_router(sync.router, prefix="/api/sync", tags=["sync"])

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Bemo API is running"}
