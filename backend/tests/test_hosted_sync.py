import hashlib
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

from fastapi.testclient import TestClient

from tests.api_test_case import ApiTestCase


class HostedSyncTests(ApiTestCase):
    app_mode = 'app'
    headers = {'Authorization': 'Bearer test-sync-token'}

    def push(self, operation='create', kind='note.create', base=0, content='remote', **payload):
        response = self.client.post('/api/sync/push', headers=self.headers, json={'changes': [{
            'operation_id': operation, 'device_id': 'other-device', 'entity_id': 'shared',
            'type': kind, 'base_revision': base, 'payload': {'content': content, 'tags': [], **payload},
        }]})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def notes(self):
        return self.client.get('/api/app/notes/').json()

    def changes(self, cursor=None):
        return self.client.get('/api/sync/pull', headers=self.headers, params={'cursor': cursor or '0'}).json()['changes']

    def restart(self):
        self.client.close()
        self.client = TestClient(self.app_factory_module.create_app('app'))

    def test_remote_push_is_visible_without_browser_and_survives_restart(self):
        self.assertEqual(len(self.push()['accepted']), 1)
        self.assertEqual([(n['note_id'], n['content']) for n in self.notes()], [('shared', 'remote')])
        self.restart()
        self.assertEqual(self.notes()[0]['content'], 'remote')
        self.push('edit', 'note.update', 1, 'updated')
        self.assertEqual(self.notes()[0]['content'], 'updated')
        self.push('trash', 'note.trash', 2, 'updated')
        self.assertEqual(self.notes(), [])
        self.assertEqual(self.client.get('/api/app/notes/trash').json()[0]['revision'], 3)
        self.push('restore', 'note.restore', 3, 'updated')
        self.assertEqual(self.notes()[0]['revision'], 4)
        self.push('purge', 'note.purge', 4)
        self.restart()
        self.assertEqual(self.notes(), [])
        self.assertEqual(self.client.get('/api/app/notes/trash').json(), [])
        self.assertTrue(self.push('stale')['conflicts'])

    def test_default_web_writes_are_immediately_available_to_devices(self):
        created = self.client.post('/api/app/notes/', json={'content': 'web', 'tags': ['one']}).json()
        note_id = created['note_id']
        self.assertEqual(self.changes()[0]['entity_id'], note_id)
        self.client.put(f'/api/app/notes/{note_id}', json={**self.note_version(note_id), 'content': 'web edit', 'tags': ['two']})
        self.client.patch(f'/api/app/notes/{note_id}', json={**self.note_version(note_id), 'pinned': True})
        self.client.delete(f'/api/app/notes/{note_id}')
        self.client.post(f'/api/app/notes/trash/{note_id}/restore')
        self.client.delete(f'/api/app/notes/{note_id}')
        self.client.request('DELETE', f'/api/app/notes/trash/{note_id}', json=self.note_version(note_id))
        changes = self.changes()
        self.assertEqual([c['type'] for c in changes], [
            'note.create', 'note.update', 'note.update', 'note.trash', 'note.restore', 'note.trash', 'note.purge'])
        self.assertEqual([c['payload']['revision'] for c in changes], list(range(1, 8)))
        self.restart()
        self.assertEqual(self.changes(), changes)

    def test_web_and_device_edits_share_revision_checks_and_duplicate_receipts(self):
        self.push()
        self.client.put('/api/app/notes/shared', json={**self.note_version('shared'), 'base_revision': 1, 'content': 'web edit', 'tags': []})
        stale = self.push('stale', 'note.update', 1, 'stale remote')
        self.assertEqual(stale['conflicts'][0]['reason'], 'revision_conflict')
        duplicate = self.push()
        self.assertTrue(duplicate['accepted'][0]['duplicate'])
        self.assertEqual(self.notes()[0]['content'], 'web edit')
        self.assertEqual(len(self.changes()), 2)

    def test_app_and_journal_failures_roll_back_both_sides(self):
        with patch('services.sync_store_repository.persist_applied_change', side_effect=OSError('disk full')):
            with self.assertRaises(OSError):
                self.client.post('/api/app/notes/', json={'content': 'must roll back', 'tags': []})
        self.assertEqual(self.notes(), [])
        self.assertEqual(self.changes(), [])
        with patch('services.app_store_repository.upsert_note', side_effect=OSError('app write failed')):
            with self.assertRaises(OSError):
                self.push()
        self.assertEqual(self.notes(), [])
        self.assertEqual(self.changes(), [])
        self.assertEqual(len(self.push()['accepted']), 1)

    def test_attachment_bytes_work_in_both_directions_and_missing_blob_rolls_back(self):
        data = b'attachment from device'
        blob_hash = 'sha256:' + hashlib.sha256(data).hexdigest()
        attachment = {'filename': 'device.png', 'blob_hash': blob_hash, 'mime_type': 'image/png'}
        missing = self.client.post('/api/sync/push', headers=self.headers, json={'changes': [{
            'operation_id': 'missing', 'device_id': 'other', 'entity_id': 'missing',
            'type': 'note.create', 'payload': {'content': '![device](/images/device.png)', 'attachments': [attachment]},
        }]})
        self.assertEqual(missing.status_code, 400)
        self.assertEqual(self.changes(), [])
        self.assertEqual(self.client.put(f'/api/sync/blobs/{blob_hash}', headers=self.headers, content=data).status_code, 200)
        self.push(content='![device](/images/device.png)', attachments=[attachment])
        self.assertEqual(self.client.get('/images/device.png').content, data)
        web = self.client.post('/api/app/attachments', files={'file': ('web.png', b'web image', 'image/png')}).json()
        self.client.post('/api/app/notes/', json={'content': '![web](/images/web.png)', 'tags': []})
        last = self.changes()[-1]
        self.assertEqual(last['payload']['attachments'][0]['blob_hash'], web['blob_hash'])
        self.assertEqual(self.client.get(f"/api/sync/blobs/{web['blob_hash']}", headers=self.headers).content, b'web image')

    def test_parallel_web_and_device_writes_cannot_leave_different_snapshots(self):
        self.push()
        def web_edit():
            return self.client.put('/api/app/notes/shared', json={**self.note_version('shared'), 'base_revision': 1, 'content': 'web concurrent', 'tags': []})
        def device_edit():
            return self.push('parallel', 'note.update', 1, 'device concurrent')
        with ThreadPoolExecutor(max_workers=2) as pool:
            a, b = pool.submit(web_edit), pool.submit(device_edit)
            self.assertIn(a.result().status_code, (200, 409))
            b.result()
        last = self.changes()[-1]['payload']
        self.assertEqual((self.notes()[0]['content'], self.notes()[0]['revision']), (last['content'], last['revision']))

    def test_backup_replacement_publishes_new_state_and_keeps_history_blobs_readable(self):
        upload = self.client.post('/api/app/attachments', files={'file': ('old.png', b'old image', 'image/png')}).json()
        self.client.post('/api/app/notes/', json={'content': '![old](/images/old.png)', 'tags': []})
        backup = self.client.get('/api/app/storage/backup').json()
        self.client.delete('/api/app/storage')
        self.assertEqual(self.changes()[-1]['type'], 'note.purge')
        self.assertEqual(self.client.get(f"/api/sync/blobs/{upload['blob_hash']}", headers=self.headers).content, b'old image')
        self.assertEqual(self.client.post('/api/app/storage/backup', json=backup).status_code, 200)
        self.assertEqual(self.notes()[0]['content'], backup['notes'][0]['content'])
        self.assertEqual(self.changes()[-1]['type'], 'note.restore')
        self.assertGreater(self.changes()[-1]['payload']['revision'], self.changes()[-2]['payload']['revision'])

    def test_upgrade_preserves_legacy_cursors_and_both_divergent_versions(self):
        from services import app_store_repository, note_store_service, sync_service
        # Construct an old installation without invoking the new app API hooks.
        local = note_store_service.create_note(content='app version', tags=[])
        change = {'operation_id': 'old-operation', 'device_id': 'old-device', 'entity_id': local['note_id'],
                  'type': 'note.create', 'payload': {'content': 'sync version', 'tags': [], 'revision': 1}}
        sync_service.push_changes([change])
        with app_store_repository.connect() as conn:
            conn.execute("DELETE FROM hosted_sync_meta WHERE key='initialized'")
        self.restart()
        contents = sorted(n['content'] for n in self.notes())
        self.assertEqual(contents, ['app version', 'sync version'])
        self.assertEqual(self.changes()[0]['operation_id'], 'old-operation')
        self.assertEqual(self.changes()[0]['cursor'], '1')
        count = len(self.changes())
        self.restart()
        self.assertEqual(len(self.changes()), count)
        self.assertEqual(sorted(n['content'] for n in self.notes()), contents)

    def test_change_token_tracks_writes_and_keeps_identity_across_restart(self):
        before = self.client.get('/api/app/change-token').json()
        self.push()
        after = self.client.get('/api/app/change-token').json()
        self.assertEqual(after['store_id'], before['store_id'])
        self.assertGreater(int(after['latest_cursor']), int(before['latest_cursor']))
        self.assertEqual(self.client.get('/api/sync/state', headers=self.headers).json()['store_id'], after['store_id'])
        self.restart()
        self.assertEqual(self.client.get('/api/app/change-token').json(), after)

    def test_adopting_another_targets_revision_cannot_reuse_a_hosted_version(self):
        self.push()
        self.client.put('/api/app/notes/shared', json={**self.note_version('shared'), 'base_revision': 1, 'content': 'app revision two', 'tags': []})
        replica = self.client.post('/api/app/replica/read', json={'operation_ids': []}).json()
        replica['notes'][0].update(content='external target confirmed revision one', revision=1)
        self.assertEqual(self.client.post('/api/app/replica/commit', json=replica).status_code, 200)
        self.assertEqual(self.notes()[0]['revision'], 1, 'do not alter another target\'s confirmed local revision')
        self.assertEqual([c['payload']['revision'] for c in self.changes()], [1, 2, 3])
        self.assertTrue(self.push('stale-one', 'note.update', 1, 'stale')['conflicts'])
        self.assertTrue(self.push('stale-two', 'note.update', 2, 'stale')['conflicts'])
        self.client.post('/api/app/notes/', json={'content': 'unrelated', 'tags': []})
        self.assertEqual(len([c for c in self.changes() if c['entity_id'] == 'shared']), 3)

    def test_a_copied_database_is_not_mistaken_for_the_same_live_primary_store(self):
        import shutil
        from pathlib import Path
        from services import app_store_repository, hosted_sync_service
        original = self.client.get('/api/app/change-token').json()['store_id']
        clone = Path(self.data_dir) / 'copied-app.db'
        shutil.copyfile(app_store_repository.APP_DB_PATH, clone)
        with patch.object(app_store_repository, 'APP_DB_PATH', str(clone)):
            self.assertNotEqual(hosted_sync_service.get_store_id(), original)
        self.assertEqual(self.client.get('/api/app/change-token').json()['store_id'], original)

    def test_bad_blob_upload_cannot_overwrite_an_existing_primary_attachment(self):
        upload = self.client.post('/api/app/attachments', files={'file': ('keep.png', b'correct', 'image/png')}).json()
        response = self.client.put(f"/api/sync/blobs/{upload['blob_hash']}", headers=self.headers, content=b'wrong')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.get('/images/keep.png').content, b'correct')

    def test_orphan_cleanup_keeps_blobs_required_by_devices_with_an_old_cursor(self):
        upload = self.client.post('/api/app/attachments', files={'file': ('history.png', b'history', 'image/png')}).json()
        note = self.client.post('/api/app/notes/', json={'content': '![history](/images/history.png)', 'tags': []}).json()
        self.client.delete(f"/api/app/notes/{note['note_id']}")
        self.client.request("DELETE", f"/api/app/notes/trash/{note['note_id']}", json=self.note_version(note["note_id"]))
        response = self.client.post('/api/app/storage/cleanup-orphans')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['deleted_files'], ['history.png'])
        self.assertEqual(self.client.get(f"/api/sync/blobs/{upload['blob_hash']}", headers=self.headers).content, b'history')

    def test_upgrade_keeps_old_tombstones_and_attachment_history(self):
        from services import app_store_repository, note_store_service, sync_service
        local = note_store_service.create_note(content='unsent old app content', tags=[])
        data = b'old attachment history'
        blob_hash = 'sha256:' + hashlib.sha256(data).hexdigest()
        sync_service.put_blob(blob_hash, data)
        sync_service.push_changes([{'operation_id': 'legacy-create', 'device_id': 'old', 'entity_id': local['note_id'],
            'type': 'note.create', 'payload': {'content': '![old](/images/old.png)', 'tags': [],
                'attachments': [{'filename': 'old.png', 'blob_hash': blob_hash, 'mime_type': 'image/png'}]}},
            {'operation_id': 'legacy-purge', 'device_id': 'old', 'entity_id': local['note_id'],
             'type': 'note.purge', 'base_revision': 1, 'payload': {}}])
        with app_store_repository.connect() as conn:
            conn.execute("DELETE FROM hosted_sync_meta WHERE key='initialized'")
        self.restart()
        self.assertFalse(any(n['note_id'] == local['note_id'] for n in self.notes()))
        self.assertEqual([n['content'] for n in self.notes()], ['unsent old app content'])
        self.assertEqual(self.client.get(f'/api/sync/blobs/{blob_hash}', headers=self.headers).content, data)
        stale = self.client.post('/api/sync/push', headers=self.headers, json={'changes': [{
            'operation_id': 'stale-recreation', 'device_id': 'old', 'entity_id': local['note_id'],
            'type': 'note.create', 'payload': {'content': 'must not resurrect', 'tags': []},
        }]}).json()
        self.assertEqual(len(stale['conflicts']), 1)

    def test_upgrade_renames_colliding_legacy_attachments_without_changing_app_images(self):
        from services import app_store_repository, note_store_service, sync_service
        self.client.post('/api/app/attachments', files={'file': ('same.png', b'app image', 'image/png')})
        note_store_service.create_note(content='![app](/images/same.png)', tags=[])
        data = b'old sync image'
        blob_hash = 'sha256:' + hashlib.sha256(data).hexdigest()
        sync_service.put_blob(blob_hash, data)
        sync_service.push_changes([{'operation_id': 'legacy-image', 'device_id': 'old', 'entity_id': 'legacy-only',
            'type': 'note.create', 'payload': {'content': '![old](/images/same.png)', 'tags': [],
                'attachments': [{'filename': 'same.png', 'blob_hash': blob_hash, 'mime_type': 'image/png'}]}}])
        with app_store_repository.connect() as conn:
            conn.execute("DELETE FROM hosted_sync_meta WHERE key='initialized'")
        self.restart()
        migrated = next(n for n in self.notes() if n['note_id'] == 'legacy-only')
        self.assertNotEqual(migrated['attachments'][0]['filename'], 'same.png')
        self.assertIn(migrated['attachments'][0]['filename'], migrated['content'])
        self.assertEqual(self.client.get('/images/same.png').content, b'app image')
        self.assertEqual(self.client.get('/images/' + migrated['attachments'][0]['filename']).content, data)
