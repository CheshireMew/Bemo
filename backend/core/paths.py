import os
from datetime import timedelta, timezone

DATA_DIR = os.getenv("BEMO_DATA_DIR", "./data")
NOTES_DIR = os.path.join(DATA_DIR, "notes")
IMAGES_DIR = os.path.join(DATA_DIR, "images")
TRASH_DIR = os.path.join(DATA_DIR, "trash")
AI_SETTINGS_PATH = os.path.join(DATA_DIR, "ai_settings.json")
AI_CONVERSATIONS_PATH = os.path.join(DATA_DIR, "ai_conversations.json")
SYNC_DB_PATH = os.path.join(DATA_DIR, "sync.db")
SYNC_BLOBS_DIR = os.path.join(DATA_DIR, "sync_blobs")
SYNC_TOKEN = os.getenv("BEMO_SYNC_TOKEN", "bemo-dev-token")

TZ_OFFSET = timedelta(hours=8)
TZ = timezone(TZ_OFFSET)


def ensure_data_directories() -> None:
    os.makedirs(NOTES_DIR, exist_ok=True)
    os.makedirs(IMAGES_DIR, exist_ok=True)
    os.makedirs(TRASH_DIR, exist_ok=True)
    os.makedirs(SYNC_BLOBS_DIR, exist_ok=True)
