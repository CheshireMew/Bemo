"""Persist the user's replacement intent without losing remote progress."""
import json
import uuid
from urllib.parse import unquote

from services import app_store_repository as repository
from services.note_contract import now_iso, app_note_from_row
from services.sync_contract import sync_note_key


def queue_workspace_replacement(before: list[dict], context: dict | None = None) -> None:
    from services.app_sync_service import _ensure_tables, list_outbox, queue_change
    _ensure_tables()
    after = {row['note_id']: (app_note_from_row(row), bool(row['deleted_at'])) for row in repository.list_notes()}
    old = {note['note_id']: note for note in before}
    pending = list_outbox('server') + list_outbox('webdav')
    with repository.connect() as conn:
        owners = dict(conn.execute('SELECT target, target_id FROM sync_target_owners'))
    for change in pending:
        if not change.get('target_id'):
            change['target_id'] = owners.get(change['target']) or ((context or {}).get('target_id') if (context or {}).get('target') == change['target'] else None)
    targets = {(change['target'], change.get('target_id')) for change in pending}
    baselines = {}
    with repository.connect() as conn:
        for row in conn.execute('SELECT key, value FROM sync_state'):
            if not row['key'].startswith('sync:'):
                continue
            _, encoded_target, name = row['key'].split(':', 2)
            target_id = unquote(encoded_target)
            if target_id.startswith(('server:', 'webdav:')):
                targets.add((target_id.split(':', 1)[0], target_id))
                if name.startswith('baseline:'):
                    baseline = json.loads(row['value'])
                    baselines[(target_id, baseline['note_id'])] = baseline
        if context and context.get('target_id'):
            targets.add((context['target'], context['target_id']))
        # A replacement supersedes unsent edits, but not confirmed cursors or baselines.
        conn.execute('INSERT OR REPLACE INTO sync_state VALUES (?, ?)', ('workspace_epoch', uuid.uuid4().hex))
        conn.execute('DELETE FROM sync_outbox')
        for target, target_id in sorted(targets, key=lambda item: (item[0], item[1] or '')):
            ids = set(old) | set(after)
            ids.update(change['entity_id'] for change in pending if change['target'] == target and change.get('target_id') == target_id)
            ids.update(note_id for (owner, note_id), baseline in baselines.items() if owner == target_id and baseline['scope'] != 'purged')
            for note_id in sorted(ids):
                baseline = baselines.get((target_id, note_id))
                note, deleted = after.get(note_id, ({}, False))
                scope = ('trash' if deleted else 'active') if note else 'purged'
                if target_id:
                    key = sync_note_key(target_id, 'deleted', note_id)
                    if scope == 'purged':
                        conn.execute('INSERT OR REPLACE INTO sync_state VALUES (?, ?)', (key, '1'))
                    else:
                        conn.execute('DELETE FROM sync_state WHERE key = ?', (key,))
                queue_change({
                    'operation_id': f'op_{uuid.uuid4().hex}', 'device_id': (context or {}).get('device_id', 'app-store'),
                    'entity_id': note_id, 'target': target, 'target_id': target_id,
                    'type': 'note.purge' if scope == 'purged' else 'note.trash' if deleted else 'note.update',
                    'base_revision': baseline['revision'] if baseline else 0,
                    'timestamp': now_iso(), 'createdAt': 0,
                    'payload': {**note, 'workspace_replacement': True, 'desired_scope': scope},
                })
