from urllib.parse import quote


def encode_sync_component(value: str) -> str:
    """Match JavaScript encodeURIComponent used by the shared sync-state keys."""
    return quote(value, safe="~!*'()-._")


def sync_state_prefix(target_id: str) -> str:
    return f'sync:{encode_sync_component(target_id)}:'


def sync_note_key(target_id: str, kind: str, note_id: str) -> str:
    return f'{sync_state_prefix(target_id)}{kind}:{encode_sync_component(note_id)}'
