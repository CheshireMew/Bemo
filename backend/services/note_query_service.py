from services.note_repository import collect_notes_recursive


def list_notes_sorted(notes_dir: str) -> list[dict]:
    notes = collect_notes_recursive(notes_dir)
    notes.sort(key=lambda item: (not item["pinned"], -item["created_at"]))
    return notes


def search_notes(notes_dir: str, query: str) -> list[dict]:
    keyword = query.strip().lower()
    if not keyword:
        return list_notes_sorted(notes_dir)

    all_notes = collect_notes_recursive(notes_dir)
    results = [
        note for note in all_notes
        if keyword in (note.get("content", "") or "").lower()
        or keyword in (note.get("title", "") or "").lower()
        or any(keyword in tag.lower() for tag in (note.get("tags") or []))
    ]
    results.sort(key=lambda item: (not item["pinned"], -item["created_at"]))
    return results
