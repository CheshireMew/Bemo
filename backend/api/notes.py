import os
import yaml
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter()

DATA_DIR = os.getenv("BEMO_DATA_DIR", "./data")
NOTES_DIR = os.path.join(DATA_DIR, "notes")
IMAGES_DIR = os.path.join(DATA_DIR, "images")
TRASH_DIR = os.path.join(DATA_DIR, "trash")

# Beijing timezone offset
TZ_OFFSET = timedelta(hours=8)
TZ = timezone(TZ_OFFSET)


# ──────────────── Pydantic Models ────────────────

class NoteContent(BaseModel):
    content: str
    tags: Optional[List[str]] = None


class NotePatch(BaseModel):
    pinned: Optional[bool] = None
    tags: Optional[List[str]] = None


class NoteMeta(BaseModel):
    filename: str        # Relative path: "2026/03/14/1710384000_hello.md"
    title: str
    created_at: float    # Unix timestamp from frontmatter
    updated_at: float    # File system mtime
    content: Optional[str] = None
    tags: List[str] = []
    pinned: bool = False


# ──────────────── Helper Functions ────────────────

def _parse_frontmatter(filepath: str) -> tuple[dict, str]:
    """Parse YAML frontmatter and body from a markdown file."""
    with open(filepath, "r", encoding="utf-8") as f:
        raw = f.read()

    if not raw.startswith("---"):
        return {}, raw

    parts = raw.split("---", 2)
    if len(parts) < 3:
        return {}, raw

    try:
        meta = yaml.safe_load(parts[1]) or {}
    except yaml.YAMLError:
        meta = {}

    body = parts[2].lstrip("\n")
    return meta, body


def _build_frontmatter(created_at: str, tags: list, pinned: bool) -> str:
    """Build YAML frontmatter string."""
    meta = {
        "created_at": created_at,
        "tags": tags,
        "pinned": pinned,
    }
    return "---\n" + yaml.dump(meta, allow_unicode=True, default_flow_style=False).strip() + "\n---\n"


def _sanitize_title(title: str) -> str:
    """Remove characters that are invalid in Windows filenames."""
    invalid = '<>:"/\\|?*'
    result = title
    for ch in invalid:
        result = result.replace(ch, "_")
    return result.strip() or "untitled"


def _collect_notes_recursive(base_dir: str) -> List[dict]:
    """Recursively walk the notes directory and collect all .md files."""
    notes = []
    if not os.path.exists(base_dir):
        return notes

    for root, _dirs, files in os.walk(base_dir):
        for filename in files:
            if not filename.endswith(".md"):
                continue

            filepath = os.path.join(root, filename)
            rel_path = os.path.relpath(filepath, base_dir).replace("\\", "/")
            stat = os.stat(filepath)
            meta, body = _parse_frontmatter(filepath)

            # Extract created_at: prefer frontmatter, fallback to mtime
            created_at_val = stat.st_mtime
            if "created_at" in meta:
                try:
                    dt = datetime.fromisoformat(str(meta["created_at"]))
                    created_at_val = dt.timestamp()
                except (ValueError, TypeError):
                    pass

            # Extract title from filename: strip timestamp prefix and .md suffix
            basename = filename[:-3]
            if "_" in basename and basename.split("_")[0].isdigit():
                title = "_".join(basename.split("_")[1:])
            else:
                title = basename

            notes.append({
                "filename": rel_path,
                "title": title,
                "created_at": created_at_val,
                "updated_at": stat.st_mtime,
                "content": body,
                "tags": meta.get("tags", []) or [],
                "pinned": meta.get("pinned", False),
            })

    return notes


# ──────────────── Routes ────────────────
# IMPORTANT: specific paths (/search) MUST be before {filepath:path}

@router.get("/", response_model=List[NoteMeta])
def list_notes():
    """List all notes, pinned first, then by created_at desc."""
    notes = _collect_notes_recursive(NOTES_DIR)
    notes.sort(key=lambda x: (not x["pinned"], -x["created_at"]))
    return notes


@router.get("/search", response_model=List[NoteMeta])
def search_notes(q: str = ""):
    """Full-text search notes by keyword in content, title, and tags."""
    if not q.strip():
        return list_notes()

    keyword = q.strip().lower()
    all_notes = _collect_notes_recursive(NOTES_DIR)
    results = [
        n for n in all_notes
        if keyword in (n.get("content", "") or "").lower()
        or keyword in (n.get("title", "") or "").lower()
        or any(keyword in t.lower() for t in (n.get("tags") or []))
    ]
    results.sort(key=lambda x: (not x["pinned"], -x["created_at"]))
    return results


@router.post("/")
def create_note(note: NoteContent):
    """Create a new note with auto-generated filename in date directory."""
    now = datetime.now(TZ)
    timestamp = int(now.timestamp())

    date_dir = now.strftime("%Y/%m/%d")
    target_dir = os.path.join(NOTES_DIR, date_dir)
    os.makedirs(target_dir, exist_ok=True)

    first_line = note.content.strip().split("\n")[0][:20].strip()
    if first_line.startswith("#"):
        first_line = first_line.lstrip("#").strip()
    title = _sanitize_title(first_line) if first_line else "untitled"

    filename = f"{timestamp}_{title}.md"
    filepath = os.path.join(target_dir, filename)

    frontmatter = _build_frontmatter(now.isoformat(), note.tags or [], False)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(frontmatter + note.content)

    return {"message": "Note created", "filename": f"{date_dir}/{filename}"}


# ── Routes with {filepath:path} below ──

@router.get("/{filepath:path}")
def get_note(filepath: str):
    """Get content of a specific note by its relative path."""
    if not filepath.endswith(".md"):
        filepath += ".md"
    full_path = os.path.join(NOTES_DIR, filepath)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Note not found")
    meta, body = _parse_frontmatter(full_path)
    return {"filename": filepath, "content": body, "meta": meta}


@router.put("/{filepath:path}")
def update_note(filepath: str, note: NoteContent):
    """Update a note's content, preserving frontmatter metadata."""
    if not filepath.endswith(".md"):
        filepath += ".md"
    full_path = os.path.join(NOTES_DIR, filepath)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Note not found")

    meta, _ = _parse_frontmatter(full_path)
    created_at_str = str(meta.get("created_at", datetime.now(TZ).isoformat()))
    tags = note.tags if note.tags is not None else (meta.get("tags") or [])
    pinned = meta.get("pinned", False)

    frontmatter = _build_frontmatter(created_at_str, tags, pinned)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(frontmatter + note.content)

    return {"message": "Note updated", "filename": filepath}


@router.patch("/{filepath:path}")
def patch_note(filepath: str, patch: NotePatch):
    """Partially update a note's metadata (pinned, tags) without changing content."""
    if not filepath.endswith(".md"):
        filepath += ".md"
    full_path = os.path.join(NOTES_DIR, filepath)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Note not found")

    meta, body = _parse_frontmatter(full_path)
    created_at_str = str(meta.get("created_at", datetime.now(TZ).isoformat()))
    tags = patch.tags if patch.tags is not None else (meta.get("tags") or [])
    pinned = patch.pinned if patch.pinned is not None else meta.get("pinned", False)

    frontmatter = _build_frontmatter(created_at_str, tags, pinned)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(frontmatter + body)

    return {"message": "Note patched", "pinned": pinned, "tags": tags}


@router.delete("/{filepath:path}")
def delete_note(filepath: str):
    """Soft-delete: move note to trash directory, preserving path structure."""
    if not filepath.endswith(".md"):
        filepath += ".md"
    full_path = os.path.join(NOTES_DIR, filepath)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Note not found")

    # Move to trash, preserving relative path
    trash_path = os.path.join(TRASH_DIR, filepath)
    os.makedirs(os.path.dirname(trash_path), exist_ok=True)
    import shutil
    shutil.move(full_path, trash_path)

    # Clean up empty parent directories in notes
    _cleanup_empty_dirs(os.path.dirname(full_path), NOTES_DIR)

    return {"message": "Note moved to trash"}


def _cleanup_empty_dirs(start_dir: str, stop_dir: str):
    """Remove empty directories up to stop_dir."""
    parent = start_dir
    while parent != stop_dir and os.path.isdir(parent):
        if not os.listdir(parent):
            os.rmdir(parent)
            parent = os.path.dirname(parent)
        else:
            break


TRASH_RETENTION_DAYS = 90  # 回收站保留天数


def _auto_cleanup_trash():
    """Permanently delete trash notes older than TRASH_RETENTION_DAYS."""
    if not os.path.exists(TRASH_DIR):
        return
    import time
    cutoff = time.time() - TRASH_RETENTION_DAYS * 86400
    for root, _dirs, files in os.walk(TRASH_DIR, topdown=False):
        for f in files:
            fp = os.path.join(root, f)
            try:
                if os.stat(fp).st_mtime < cutoff:
                    os.remove(fp)
            except OSError:
                pass
        # Clean empty dirs
        if root != TRASH_DIR and not os.listdir(root):
            try:
                os.rmdir(root)
            except OSError:
                pass


# ──────────────── Trash Endpoints ────────────────

@router.get("/trash/list", response_model=List[NoteMeta])
def list_trash():
    """List all notes in the trash. Auto-cleans notes older than 90 days."""
    _auto_cleanup_trash()
    notes = _collect_notes_recursive(TRASH_DIR)
    notes.sort(key=lambda x: -x["updated_at"])
    return notes


@router.post("/trash/restore/{filepath:path}")
def restore_note(filepath: str):
    """Restore a note from trash back to notes directory."""
    if not filepath.endswith(".md"):
        filepath += ".md"
    trash_path = os.path.join(TRASH_DIR, filepath)
    if not os.path.exists(trash_path):
        raise HTTPException(status_code=404, detail="Note not found in trash")

    notes_path = os.path.join(NOTES_DIR, filepath)
    os.makedirs(os.path.dirname(notes_path), exist_ok=True)
    import shutil
    shutil.move(trash_path, notes_path)

    _cleanup_empty_dirs(os.path.dirname(trash_path), TRASH_DIR)
    return {"message": "Note restored", "filename": filepath}


@router.delete("/trash/permanent/{filepath:path}")
def permanent_delete(filepath: str):
    """Permanently delete a note from trash."""
    if not filepath.endswith(".md"):
        filepath += ".md"
    trash_path = os.path.join(TRASH_DIR, filepath)
    if not os.path.exists(trash_path):
        raise HTTPException(status_code=404, detail="Note not found in trash")

    os.remove(trash_path)
    _cleanup_empty_dirs(os.path.dirname(trash_path), TRASH_DIR)
    return {"message": "Note permanently deleted"}


@router.delete("/trash/empty")
def empty_trash():
    """Permanently delete all notes in trash."""
    import shutil
    if os.path.exists(TRASH_DIR):
        shutil.rmtree(TRASH_DIR)
        os.makedirs(TRASH_DIR, exist_ok=True)
    return {"message": "Trash emptied"}

