import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from unittest.mock import patch

from tests.api_test_case import ApiTestCase


class ArchitectureIntegrityTests(ApiTestCase):
    app_mode = 'app'
    headers = {'Authorization': 'Bearer test-sync-token'}

    def create(self, content='baseline'):
        response = self.client.post('/api/app/notes/', json={'content': content, 'tags': []})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def push(self, changes):
        response = self.client.post('/api/sync/push', headers=self.headers, json={'changes': changes})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_conflict_blocks_dependent_operations_but_not_other_notes_or_receipts(self):
        note = self.create()
        self.client.put('/api/app/notes/' + note['note_id'], json={**self.note_version(note['note_id']), 'content': 'other device', 'tags': []})
        def change(op, base, entity=None):
            return {'operation_id': op, 'device_id': 'offline', 'entity_id': entity or note['note_id'],
                    'type': 'note.create' if entity else 'note.update', 'base_revision': base,
                    'payload': {'content': op, 'tags': [], 'revision': base + 1}}
        result = self.push([change('first', 1), change('second', 2), change('unrelated', 0, 'unrelated')])
        self.assertEqual([item['reason'] for item in result['conflicts']], ['revision_conflict', 'dependency_conflict'])
        self.assertEqual([item['operation_id'] for item in result['accepted']], ['unrelated'])
        notes = self.client.get('/api/app/notes/').json()
        self.assertEqual(next(item for item in notes if item['note_id'] == note['note_id'])['content'], 'other device')
        retry = self.push([change('unrelated', 0, 'unrelated')])
        self.assertTrue(retry['accepted'][0]['duplicate'])

    def test_purge_requires_current_trash_state_and_its_edit_version(self):
        note = self.create()
        url = '/api/app/notes/' + note['note_id']
        self.client.delete(url)
        stale = self.note_version(note['note_id'])
        self.client.post('/api/app/notes/trash/' + note['note_id'] + '/restore')
        purge = '/api/app/notes/trash/' + note['note_id']
        self.assertEqual(self.client.request('DELETE', purge, json=stale).status_code, 409)
        self.assertEqual(len(self.client.get('/api/app/notes/').json()), 1)
        self.client.delete(url)
        self.assertEqual(self.client.request('DELETE', purge, json=stale).status_code, 409)
        self.assertEqual(self.client.request('DELETE', purge, json=self.note_version(note['note_id'])).status_code, 200)

    def test_backup_and_remote_revision_reuse_cannot_revalidate_old_editors(self):
        note = self.create('old editor')
        baseline = self.note_version(note['note_id'])
        backup = self.client.get('/api/app/storage/backup').json()
        backup['notes'][0]['content'] = 'restored important content'
        self.assertEqual(self.client.post('/api/app/storage/backup', json=backup).status_code, 200)
        url = '/api/app/notes/' + note['note_id']
        self.assertEqual(self.client.put(url, json={**baseline, 'content': 'stale', 'tags': []}).status_code, 409)
        self.assertEqual(self.client.get('/api/app/notes/').json()[0]['content'], 'restored important content')
        self.assertEqual(self.client.put(url, json={**self.note_version(note['note_id']), 'content': 'reviewed', 'tags': []}).status_code, 200)
        snapshot = self.client.post('/api/app/replica/read', json={}).json()
        snapshot['notes'][0].update(content='remote revision one', revision=note['revision'])
        self.assertEqual(self.client.post('/api/app/replica/commit', json=snapshot).status_code, 200)
        self.assertEqual(self.client.put(url, json={**baseline, 'content': 'stale again', 'tags': []}).status_code, 409)

    def test_upload_collision_preserves_original_and_hosted_sync_returns_safe_alias(self):
        original = self.client.post('/api/app/attachments', files={'file': ('shared.png', b'original', 'image/png')}).json()
        self.create('local ![](/images/shared.png)')
        rejected = self.client.post('/api/app/attachments', files={'file': ('shared.png', b'new bytes', 'image/png')})
        self.assertEqual(rejected.status_code, 409)
        data = b'remote image'
        digest = 'sha256:' + hashlib.sha256(data).hexdigest()
        self.client.put('/api/sync/blobs/' + digest, headers=self.headers, content=data)
        accepted = self.push([{'operation_id': 'remote-image', 'device_id': 'other', 'entity_id': 'other', 'type': 'note.create',
            'payload': {'content': 'remote ![](/images/shared.png)', 'tags': [],
                        'attachments': [{**original, 'blob_hash': digest}]}}])['accepted'][0]['change']
        filename = accepted['payload']['attachments'][0]['filename']
        self.assertNotEqual(filename, 'shared.png')
        self.assertIn(filename, accepted['payload']['content'])
        self.assertEqual(self.client.get('/images/shared.png').content, b'original')
        self.assertEqual(self.client.get('/images/' + filename).content, data)
        history = self.client.get('/api/sync/pull', headers=self.headers).json()['changes'][-1]
        self.assertEqual(history['payload'], accepted['payload'])

    def test_pending_upload_is_protected_until_commit_or_expiry(self):
        from services import app_store_repository as repository
        self.client.post('/api/app/attachments', files={'file': ('pending.png', b'pending', 'image/png')})
        self.assertEqual(self.client.post('/api/app/storage/cleanup-orphans').json()['deleted_count'], 0)
        self.create('saved ![](/images/pending.png)')
        with repository.connect() as conn:
            self.assertEqual(conn.execute('SELECT COUNT(*) FROM attachment_upload_holds').fetchone()[0], 0)
        self.assertEqual(self.client.post('/api/app/storage/cleanup-orphans').json()['deleted_count'], 0)

    def test_cleanup_serializes_upload_and_reference_commit(self):
        from services import app_store_repository as repository, app_storage_service as storage
        self.client.post('/api/app/attachments', files={'file': ('race.png', b'old', 'image/png')})
        with repository.connect() as conn:
            conn.execute('UPDATE attachment_upload_holds SET expires_at = 0')
        scanned, resume, writer_started = Event(), Event(), Event()
        collect = storage._collect_backend_referenced_filenames
        def scan():
            result = collect()
            scanned.set()
            self.assertTrue(resume.wait(3))
            return result
        def save():
            writer_started.set()
            upload = self.client.post('/api/app/attachments', files={'file': ('race.png', b'new', 'image/png')})
            self.assertEqual(upload.status_code, 200, upload.text)
            return self.create('saved after cleanup ![](/images/race.png)')
        with patch.object(storage, '_collect_backend_referenced_filenames', scan), patch.object(repository, 'delete_blob_record'):
            with ThreadPoolExecutor(max_workers=2) as pool:
                cleanup = pool.submit(self.client.post, '/api/app/storage/cleanup-orphans')
                self.assertTrue(scanned.wait(3))
                writer = pool.submit(save)
                self.assertTrue(writer_started.wait(3))
                self.assertFalse(writer.done())
                resume.set()
                self.assertEqual(cleanup.result(timeout=5).status_code, 200)
                writer.result(timeout=5)
        self.assertEqual(self.client.get('/images/race.png').content, b'new')

    def test_workspace_replacement_preserves_target_progress_and_durable_deletion(self):
        from urllib.parse import quote
        from services import app_sync_service as sync
        target_id = 'server:https://remote.invalid'
        context = {'target': 'server', 'target_id': target_id, 'device_id': 'editor'}
        headers = {'X-Bemo-Sync-Context': json.dumps(context)}
        note = self.client.post('/api/app/notes/', headers=headers, json={'content': 'pending local', 'tags': []}).json()
        prefix = f"sync:{quote(target_id, safe='')}:"
        sync.write_sync_state(prefix + 'cursor', '7')
        sync.write_sync_state(prefix + 'baseline:' + note['note_id'], json.dumps({**note, 'scope': 'active', 'revision': 1}))
        self.assertEqual(self.client.delete('/api/app/storage', headers=headers).status_code, 200)
        self.assertEqual(sync.read_sync_state(prefix + 'cursor')['value'], '7')
        changes = sync.list_outbox('server', target_id)
        self.assertEqual(len(changes), 1)
        self.assertEqual(changes[0]['type'], 'note.purge')
        self.assertTrue(changes[0]['payload']['workspace_replacement'])
        self.assertEqual(sync.read_sync_state(prefix + 'deleted:' + note['note_id'])['value'], '1')

    def test_legacy_unbound_pending_edits_become_deletions_when_workspace_is_cleared(self):
        from services import app_sync_service as sync
        headers = {'X-Bemo-Sync-Context': json.dumps({'target': 'server', 'device_id': 'legacy'})}
        note = self.client.post('/api/app/notes/', headers=headers, json={'content': 'legacy unsent', 'tags': []}).json()
        self.client.delete('/api/app/storage')
        pending = sync.list_outbox('server')
        self.assertEqual(len(pending), 1)
        self.assertEqual(pending[0]['type'], 'note.purge')
        sync.claim_legacy_target('server', 'server:https://new-target.invalid')
        snapshot = sync.read_replica([], 'server:https://new-target.invalid')
        self.assertIn(note['note_id'], snapshot['deleted_ids'])

    def test_replica_epoch_prevents_empty_workspace_aba_after_replacement(self):
        before = self.client.post('/api/app/replica/read', json={}).json()
        self.client.delete('/api/app/storage')
        self.assertEqual(self.client.post('/api/app/replica/commit', json=before).status_code, 409)

    def test_sync_state_components_match_browser_encoding_for_punctuation(self):
        from services.sync_contract import encode_sync_component, sync_note_key
        from services import app_sync_service as sync
        target_id = "webdav:[\"https://dav.invalid/(notes)\",\"user!*'\"]"
        self.assertEqual(encode_sync_component("!*'()"), "!*'()")
        headers = {'X-Bemo-Sync-Context': json.dumps({'target': 'webdav', 'target_id': target_id, 'device_id': 'browser'})}
        note = self.client.post('/api/app/notes/', headers=headers, json={'content': 'clear', 'tags': []}).json()
        self.client.delete('/api/app/storage', headers=headers)
        self.assertEqual(sync.read_sync_state(sync_note_key(target_id, 'deleted', note['note_id']))['value'], '1')
        self.assertIn(note['note_id'], sync.read_replica([], target_id)['deleted_ids'])


class StandaloneBatchIntegrityTests(ApiTestCase):
    """Run the batch protocol against the independent server database as well."""
    # All other app tests already exercise the hosted path above.
    def test_standalone_conflict_blocks_dependent_operation(self):
        from services import sync_store_repository as store
        from services.sync_service import push_changes
        with store.use_app_store(False):
            def change(op, base, content, kind='note.update'):
                return {'operation_id': op, 'device_id': 'a', 'entity_id': 'standalone', 'type': kind,
                        'base_revision': base, 'payload': {'content': content, 'tags': [], 'revision': base + 1}}
            push_changes([change('initial', 0, 'base', 'note.create'), change('other', 1, 'other device')])
            result = push_changes([change('first', 1, 'offline one'), change('second', 2, 'offline two')])
            self.assertEqual(result['accepted'], [])
            self.assertEqual([item['reason'] for item in result['conflicts']], ['revision_conflict', 'dependency_conflict'])
