"""Publish the app store through the sync protocol without a browser worker.

The protocol journal lives beside app data in app.db. Both projections use the
same SQLite transaction; standalone sync-server mode keeps its existing store.
"""
import hashlib
import json
import uuid
from pathlib import Path

from services import app_store_repository as app_store
from services import sync_store_repository as sync_store
from services.note_contract import now_iso
from services.service_errors import ValidationError


def _rows(conn) -> dict[str, dict]:
    return {row['note_id']: dict(row) for row in conn.execute('SELECT * FROM hosted_sync_notes_current')}


def _fingerprint(row: dict) -> tuple:
    return (row.get('content', ''), json.loads(row.get('tags_json') or '[]'),
            bool(row.get('pinned')), bool(row.get('deleted_at')), bool(row.get('purged')),
            json.loads(row.get('attachments_json') or '[]'), row.get('filename') or '')


def _attachments(row: dict, records: dict | None = None) -> list[dict]:
    from services.app_storage_service import _collect_referenced_filenames_from_row
    if records is None:
        records = {item['filename']: item for item in app_store.list_attachment_records()}
    names = _collect_referenced_filenames_from_row(row.get('content'), row.get('attachments_json'))
    result = []
    for name in sorted(names):
        record = records.get(name)
        if not record or not app_store.has_blob_record(record['blob_hash']):
            raise ValidationError(f'同步附件不存在：{name}')
        result.append({key: record[key] for key in ('filename', 'blob_hash', 'mime_type')})
    return result


def _publish(row: dict, previous: dict | None, *, purged: bool = False):
    from services.note_contract import app_note_from_row
    note_id = row['note_id']
    operation_id = f'host_{uuid.uuid4().hex}'
    app_revision = int(row['revision'])
    # The app can adopt a different remote target's confirmed revision. The
    # hosted protocol still needs its own monotonically increasing versions,
    # or an old device base could accidentally become valid a second time.
    revision = max(app_revision, int(previous['revision']) + 1) if previous else app_revision
    if purged:
        snapshot = {**row, 'content': '', 'title': '', 'filename': '', 'tags_json': '[]',
                    'attachments_json': '[]', 'pinned': 0, 'deleted_at': now_iso(), 'revision': revision}
        payload = {'revision': revision}
        kind = 'note.purge'
    else:
        attachments = _attachments(row)
        snapshot = {**row, 'revision': revision, 'attachments_json': json.dumps(attachments, ensure_ascii=False)}
        payload = {**app_note_from_row(snapshot), 'created_at': row['created_at'],
                   'updated_at': row['updated_at'], 'attachments': attachments}
        payload.pop('edit_version', None)
        kind = ('note.trash' if row.get('deleted_at') else 'note.create' if previous is None
                else 'note.restore' if previous.get('deleted_at') else 'note.update')
    with app_store.connect() as conn:
        conn.execute('''INSERT OR REPLACE INTO hosted_sync_notes_current
            (note_id, filename, title, content, tags_json, attachments_json, pinned, revision,
             created_at, updated_at, deleted_at, purged, last_operation_id, last_device_id, app_revision)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            tuple(snapshot.get(key) for key in ('note_id', 'filename', 'title', 'content', 'tags_json',
                  'attachments_json', 'pinned', 'revision', 'created_at', 'updated_at', 'deleted_at'))
            + (int(purged), operation_id, 'app-store', app_revision))
    change = {'operation_id': operation_id, 'device_id': 'app-store', 'entity_id': note_id,
              'type': kind, 'timestamp': now_iso(),
              'base_revision': int(previous['revision']) if previous else 0, 'payload': payload}
    sync_store.persist_applied_change(change, {'change': change})


def publish_app_changes():
    """Called inside the transaction which changed the app's primary data."""
    if not sync_store.uses_app_store():
        return
    with app_store.connect() as conn:
        before = _rows(conn)
        current = {row['note_id']: dict(row) for row in app_store.list_notes()}
        attachments = {item['filename']: item for item in app_store.list_attachment_records()}
        for note_id, row in current.items():
            previous = before.get(note_id)
            normalized = {**row, 'attachments_json': json.dumps(_attachments(row, attachments), ensure_ascii=False)}
            if previous and _fingerprint(normalized) == _fingerprint(previous) and row['revision'] == (previous['app_revision'] or previous['revision']):
                continue
            _publish(normalized, previous)
        for note_id, previous in before.items():
            if note_id not in current and not previous['purged']:
                _publish(previous, previous, purged=True)


def project_accepted_change(change: dict):
    """A protocol write becomes visible through app APIs in that same commit."""
    if not sync_store.uses_app_store():
        return
    with app_store.connect() as conn:
        row = dict(conn.execute('SELECT * FROM hosted_sync_notes_current WHERE note_id = ?',
                                (change['entity_id'],)).fetchone())
        if row['purged']:
            app_store.delete_note(row['note_id'])
            return
        from services.app_attachment_service import register_attachment
        from services.note_contract import derive_note_title
        from services.note_contract import ATTACHMENT_URL_PATTERN
        from urllib.parse import quote, unquote
        import re
        names = {}
        attachments = json.loads(row['attachments_json'] or '[]')
        for attachment in attachments:
            blob_hash = attachment['blob_hash']
            if not app_store.has_blob_record(blob_hash):
                raise ValidationError(f"同步附件尚未上传：{attachment['filename']}")
            data = app_store.get_blob_record(blob_hash)
            if blob_hash != f'sha256:{hashlib.sha256(data).hexdigest()}':
                raise ValidationError(f"同步附件校验失败：{attachment['filename']}")
            old_name = attachment['filename']
            extension = re.search(r'\.[a-zA-Z0-9]{1,12}$', old_name)
            existing = app_store.get_attachment_record(old_name)
            name = (f"sha256-{blob_hash.removeprefix('sha256:')}{extension[0].lower() if extension else ''}"
                    if existing and existing['blob_hash'] != blob_hash else old_name)
            names[old_name] = name
            register_attachment(name, data, attachment.get('mime_type'))
            attachment['filename'] = name
        row['content'] = ATTACHMENT_URL_PATTERN.sub(lambda match:
            f"/images/{quote(names[unquote(match[1])], safe='')}" if unquote(match[1]) in names else match[0], row['content'])
        row['title'] = derive_note_title(row['content'])
        row['attachments_json'] = json.dumps(attachments, ensure_ascii=False)
        change['payload'] = {**change['payload'], 'content': row['content'], 'attachments': attachments}
        conn.execute('UPDATE hosted_sync_notes_current SET content = ?, title = ?, attachments_json = ? WHERE note_id = ?',
                     (row['content'], row['title'], row['attachments_json'], row['note_id']))
        app_store.upsert_note(row)
        conn.execute('UPDATE hosted_sync_notes_current SET app_revision = revision WHERE note_id = ?', (row['note_id'],))


def _prepare_legacy_attachments(row: dict) -> dict:
    copy = dict(row)
    attachments = json.loads(copy.get('attachments_json') or '[]')
    for attachment in attachments:
        existing = app_store.get_attachment_record(attachment['filename'])
        if existing and existing['blob_hash'] != attachment['blob_hash']:
            from urllib.parse import quote
            old = attachment['filename']
            attachment['filename'] = f"migration-{uuid.uuid4().hex[:12]}-{old}"
            copy['content'] = copy['content'].replace(f'/images/{quote(old)}', f"/images/{quote(attachment['filename'])}")
            copy['content'] = copy['content'].replace(f'/images/{old}', f"/images/{quote(attachment['filename'])}")
        data = app_store.get_blob_record(attachment['blob_hash'])
        app_store.upsert_attachment_record(attachment['filename'], attachment['blob_hash'],
            attachment.get('mime_type') or 'application/octet-stream', len(data), now_iso())
    copy['attachments_json'] = json.dumps(attachments, ensure_ascii=False)
    return copy


def _conflict_copy(row: dict):
    """Upgrade never discards either side of a pre-existing disagreement."""
    copy = _prepare_legacy_attachments({**row, 'note_id': f'migration_{uuid.uuid4().hex}', 'revision': 1,
            'filename': f'conflict-{uuid.uuid4().hex}.md', 'deleted_at': None,
            'title': f"冲突副本 - {row.get('title') or '旧同步数据'}", 'updated_at': now_iso()})
    app_store.upsert_note(copy)


def initialize():
    """One recoverable migration; legacy files remain intact for recovery."""
    sync_store.ensure_sync_store()
    with sync_store.transaction():
        with app_store.connect() as conn:
            conn.execute('CREATE TABLE IF NOT EXISTS hosted_sync_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
            conn.execute("INSERT OR IGNORE INTO hosted_sync_meta VALUES ('store_id', ?)", (uuid.uuid4().hex,))
            if conn.execute("SELECT 1 FROM hosted_sync_meta WHERE key = 'initialized'").fetchone():
                return
            from core.paths import SYNC_DB_PATH
            if Path(SYNC_DB_PATH).is_file():
                with sync_store.use_app_store(False):
                    sync_store.ensure_sync_store()
                    with sync_store.connect() as legacy:
                        # Keep old cursors and operation receipts, including tombstones.
                        for name in ('notes_current', 'changes', 'applied_operations', 'attachment_files'):
                            rows = legacy.execute(f'SELECT * FROM {name}').fetchall()
                            if rows:
                                columns = list(rows[0].keys())
                                conn.executemany(f"INSERT OR IGNORE INTO hosted_sync_{name} ({', '.join(columns)}) VALUES ({', '.join('?' for _ in columns)})",
                                                 [tuple(row) for row in rows])
                        hashes = {item['blob_hash'] for row in legacy.execute('SELECT attachments_json FROM notes_current')
                                  for item in json.loads(row['attachments_json'] or '[]')}
                        hashes.update(row['blob_hash'] for row in legacy.execute('SELECT blob_hash FROM attachment_files'))
                        hashes.update(item['blob_hash'] for row in legacy.execute('SELECT change_json FROM changes')
                                      for item in json.loads(row['change_json']).get('payload', {}).get('attachments', []))
                        for blob_hash in hashes:
                            if not app_store.has_blob_record(blob_hash):
                                data = sync_store.get_blob_record(blob_hash)
                                if blob_hash != f'sha256:{hashlib.sha256(data).hexdigest()}':
                                    raise ValidationError('旧同步附件校验失败，原数据已保留。')
                                app_store.put_blob_record(blob_hash, data)
            for note_id, remote in _rows(conn).items():
                local_row = app_store.get_note(note_id)
                local = dict(local_row) if local_row else None
                if remote['purged']:
                    if local:
                        _conflict_copy(local)
                        app_store.delete_note(note_id)
                elif local is None:
                    app_store.upsert_note(_prepare_legacy_attachments(remote))
                elif _fingerprint(local) != _fingerprint(remote):
                    _conflict_copy(remote)
            publish_app_changes()
            conn.execute("INSERT INTO hosted_sync_meta VALUES ('initialized', '1')")


def get_store_id() -> str:
    import socket
    with app_store.connect() as conn:
        identity = conn.execute("SELECT value FROM hosted_sync_meta WHERE key = 'store_id'").fetchone()[0]
    # Copying a data directory to another device must not make two independent
    # databases look like the same live primary store to the client.
    path = Path(app_store.APP_DB_PATH).resolve()
    stat = path.stat()
    physical_identity = [identity, socket.gethostname(), str(path), stat.st_dev, stat.st_ino]
    return hashlib.sha256(json.dumps(physical_identity).encode()).hexdigest()
