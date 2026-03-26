import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any


DEFAULT_SYNC_DIRECTORY = Path(r"C:\Users\Dylan\Nutstore\1\bemo-sync")


def _strip_markdown(value: str) -> str:
    text = re.sub(r"```[\s\S]*?```", " ", value)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"!\[[^\]]*]\(([^)]+)\)", " ", text)
    text = re.sub(r"\[([^\]]+)]\(([^)]+)\)", r"\1", text)
    text = re.sub(r"[*_~>#-]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _derive_title(content: str, fallback: str) -> str:
    for line in str(content or "").splitlines():
        normalized = _strip_markdown(re.sub(r"^#+\s*", "", line).strip())
        if normalized:
            return normalized
    return fallback


def _to_timestamp_seconds(value: Any) -> int:
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str) and value:
        try:
            return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp())
        except ValueError:
            pass
    return int(datetime.now().timestamp())


def _blob_path(sync_dir: Path, blob_hash: str) -> Path | None:
    if ":" not in blob_hash:
        return None
    algorithm, digest = blob_hash.split(":", 1)
    digest = digest.strip()
    if not algorithm or len(digest) < 2:
        return None
    return sync_dir / "blobs" / algorithm / digest[:2] / digest


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def build_backup_payload_from_sync_directory(sync_dir_raw: str | None = None) -> dict[str, Any]:
    sync_dir = Path(sync_dir_raw).expanduser() if sync_dir_raw else DEFAULT_SYNC_DIRECTORY
    sync_dir = sync_dir.resolve()

    manifest_path = sync_dir / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"manifest.json not found under {sync_dir}")

    manifest = _read_json(manifest_path)
    latest_snapshot_name = manifest.get("latest_snapshot")
    if not isinstance(latest_snapshot_name, str) or not latest_snapshot_name.strip():
        raise FileNotFoundError(f"latest snapshot missing in {manifest_path}")

    snapshot_path = sync_dir / "snapshots" / latest_snapshot_name
    if not snapshot_path.exists():
        raise FileNotFoundError(f"snapshot file not found: {snapshot_path}")

    snapshot = _read_json(snapshot_path)
    snapshot_notes = snapshot.get("notes") or {}
    if not isinstance(snapshot_notes, dict):
        raise ValueError(f"invalid snapshot format: {snapshot_path}")

    notes: list[dict[str, Any]] = []
    trash: list[dict[str, Any]] = []
    attachment_hashes: dict[str, tuple[str, str]] = {}

    for note in snapshot_notes.values():
        if not isinstance(note, dict):
            continue

        note_id = str(note.get("note_id") or "").strip()
        filename = str(note.get("filename") or "").strip()
        content = str(note.get("content") or "")
        if not note_id or not filename:
            continue

        created_at = _to_timestamp_seconds(note.get("created_at"))
        updated_at = _to_timestamp_seconds(note.get("updated_at") or note.get("created_at"))
        record = {
            "note_id": note_id,
            "revision": max(1, int(note.get("revision") or 1)),
            "filename": filename,
            "title": _derive_title(content, filename.removesuffix(".md")),
            "created_at": created_at,
            "updated_at": updated_at,
            "content": content,
            "tags": [str(tag) for tag in (note.get("tags") or []) if str(tag).strip()],
            "pinned": bool(note.get("pinned", False)),
        }

        attachments = note.get("attachments") or []
        if isinstance(attachments, list):
            for item in attachments:
                if not isinstance(item, dict):
                    continue
                blob_hash = str(item.get("blob_hash") or "").strip()
                attachment_name = str(item.get("filename") or "").strip()
                mime_type = str(item.get("mime_type") or "application/octet-stream").strip() or "application/octet-stream"
                if blob_hash and attachment_name:
                    attachment_hashes[blob_hash] = (attachment_name, mime_type)

        if note.get("scope") == "trash":
            trash.append(record)
        else:
            notes.append(record)

    attachments_payload: list[dict[str, Any]] = []
    for blob_hash, (filename, mime_type) in attachment_hashes.items():
        blob_path = _blob_path(sync_dir, blob_hash)
        if not blob_path or not blob_path.exists():
            continue
        attachments_payload.append({
            "filename": filename,
            "mime_type": mime_type,
            "data": list(blob_path.read_bytes()),
        })

    return {
        "format": "bemo-backup",
        "version": 3,
        "exported_at": datetime.now().isoformat(),
        "notes": notes,
        "trash": trash,
        "attachments": attachments_payload,
        "source": {
            "type": "sync-directory",
            "path": str(sync_dir),
            "latest_snapshot": latest_snapshot_name,
            "latest_cursor": str(manifest.get("latest_cursor") or ""),
        },
    }
