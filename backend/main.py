from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from api import notes, uploads

app = FastAPI(title="Bemo Notes API")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development, allow all
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure data directories exist
DATA_DIR = os.getenv("BEMO_DATA_DIR", "./data")
NOTES_DIR = os.path.join(DATA_DIR, "notes")
IMAGES_DIR = os.path.join(DATA_DIR, "images")
TRASH_DIR = os.path.join(DATA_DIR, "trash")

os.makedirs(NOTES_DIR, exist_ok=True)
os.makedirs(IMAGES_DIR, exist_ok=True)
os.makedirs(TRASH_DIR, exist_ok=True)

# Mount static files for images
app.mount("/images", StaticFiles(directory=IMAGES_DIR), name="images")

# Setup routers
app.include_router(notes.router, prefix="/api/notes", tags=["notes"])
app.include_router(uploads.router, prefix="/api/uploads", tags=["uploads"])

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Bemo API is running"}
