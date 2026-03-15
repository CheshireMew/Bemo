import os
import uuid
import shutil
from fastapi import APIRouter, File, UploadFile, HTTPException

router = APIRouter()

DATA_DIR = os.getenv("BEMO_DATA_DIR", "./data")
IMAGES_DIR = os.path.join(DATA_DIR, "images")

@router.post("/")
async def upload_image(file: UploadFile = File(...)):
    """Upload an image file and return its URL."""
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
        
    # Generate a unique filename
    ext = os.path.splitext(file.filename)[1]
    if not ext:
        ext = ".png" # fallback
        
    unique_filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(IMAGES_DIR, unique_filename)
    
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Return the URL path
    return {
        "url": f"/images/{unique_filename}",
        "filename": unique_filename,
        "original_name": file.filename
    }
