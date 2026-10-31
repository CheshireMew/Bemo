from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

from tests.api_test_case import ApiTestCase


class DataIntegrityTests(ApiTestCase):
    app_mode = 'app'

    def test_stale_editor_cannot_overwrite_a_newer_saved_note(self):
        original = self.client.post('/api/app/notes/', json={'content': 'original', 'tags': []}).json()
        url = f"/api/app/notes/{original['note_id']}"
        first = self.client.put(url, json={'content': 'newer edit', 'tags': [], 'base_revision': original['revision'], 'base_edit_version': original['edit_version']})
        self.assertEqual(first.status_code, 200)
        stale = self.client.put(url, json={'content': 'stale edit', 'tags': [], 'base_revision': original['revision'], 'base_edit_version': original['edit_version']})
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(self.client.get('/api/app/notes/').json()[0]['content'], 'newer edit')
        missing = self.client.put(url, json={'content': 'unversioned', 'tags': []})
        self.assertEqual(missing.status_code, 422)
        retry = self.client.put(url, json={'content': 'reviewed merge', 'tags': [], 'base_revision': first.json()['revision'], 'base_edit_version': first.json()['edit_version']})
        self.assertEqual(retry.status_code, 200)

    def test_backup_keeps_one_snapshot_during_concurrent_restore(self):
        from services import app_attachment_service, app_storage_service, app_store_repository
        app_attachment_service.register_attachment('snapshot.png', b'old bytes', 'image/png')
        content = 'must survive backup ![image](/images/snapshot.png)'
        note = self.client.post('/api/app/notes/', json={'content': content, 'tags': []}).json()
        self.client.delete(f"/api/app/notes/{note['note_id']}")
        with app_store_repository.connect() as conn:
            conn.execute('PRAGMA journal_mode=WAL')
        read_active = app_storage_service.list_active_notes
        with ThreadPoolExecutor(max_workers=1) as pool:
            def read_then_restore():
                active = read_active()
                def restore_and_replace_attachment():
                    restored = self.client.post(f"/api/app/notes/trash/{note['note_id']}/restore")
                    # A full restore may replace an alias; raw uploads are immutable.
                    import hashlib
                    digest = 'sha256:' + hashlib.sha256(b'new bytes').hexdigest()
                    app_store_repository.put_blob_record(digest, b'new bytes')
                    app_store_repository.upsert_attachment_record('snapshot.png', digest, 'image/png', 9, '2026-10-31T00:00:00Z')
                    return restored
                restored = pool.submit(restore_and_replace_attachment).result(timeout=5)
                self.assertEqual(restored.status_code, 200)
                return active
            with patch.object(app_storage_service, 'list_active_notes', read_then_restore):
                response = self.client.get('/api/app/storage/backup')
        self.assertEqual(response.status_code, 200)
        backup = response.json()
        self.assertEqual([n['note_id'] for n in backup['notes'] + backup['trash']], [note['note_id']])
        self.assertEqual(bytes(backup['attachments'][0]['data']), b'old bytes')
        self.assertEqual(self.client.post('/api/app/storage/backup', json=backup).status_code, 200)
        self.assertEqual(self.client.get('/api/app/notes/trash').json()[0]['content'], content)
        self.assertEqual(self.client.get('/images/snapshot.png').content, b'old bytes')

    def test_backup_keeps_active_note_during_concurrent_trash_and_purge(self):
        from services import app_storage_service, app_store_repository
        note = self.client.post('/api/app/notes/', json={'content': 'snapshot before deletion', 'tags': []}).json()
        with app_store_repository.connect() as conn:
            conn.execute('PRAGMA journal_mode=WAL')
        read_active = app_storage_service.list_active_notes
        with ThreadPoolExecutor(max_workers=1) as pool:
            def delete_note():
                self.assertEqual(self.client.delete(f"/api/app/notes/{note['note_id']}").status_code, 200)
                self.assertEqual(self.client.request("DELETE", f"/api/app/notes/trash/{note['note_id']}", json=self.note_version(note["note_id"])).status_code, 200)
            def read_then_delete():
                active = read_active()
                pool.submit(delete_note).result(timeout=5)
                return active
            with patch.object(app_storage_service, 'list_active_notes', read_then_delete):
                backup = self.client.get('/api/app/storage/backup').json()
        self.assertEqual([n['note_id'] for n in backup['notes'] + backup['trash']], [note['note_id']])
        self.assertEqual(backup['trash'], [])
        self.assertEqual(self.client.post('/api/app/storage/backup', json=backup).status_code, 200)
        self.assertEqual(self.client.get('/api/app/notes/').json()[0]['content'], 'snapshot before deletion')
