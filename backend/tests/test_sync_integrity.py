import threading
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

from tests.api_test_case import ApiTestCase


class SyncIntegrityTests(ApiTestCase):
    def change(self, operation, kind='note.create', base=0, content='original'):
        return {'operation_id': operation, 'device_id': operation, 'entity_id': 'shared',
                'type': kind, 'base_revision': base, 'payload': {'content': content, 'tags': []}}

    def test_log_failure_rolls_back_note_and_retry_completes(self):
        from services import sync_service as service, sync_store_repository as repository
        with patch.object(repository, 'persist_applied_change', side_effect=OSError('disk failure')):
            with self.assertRaises(OSError):
                service.push_changes([self.change('create')])
        self.assertEqual(service.get_sync_state()['remoteNotes'], [])
        self.assertEqual(service.pull_changes(None)['changes'], [])
        result = service.push_changes([self.change('create')])
        self.assertEqual(len(result['accepted']), 1)
        self.assertEqual(len(service.pull_changes(None)['changes']), 1)

    def test_parallel_updates_accept_only_one_old_base(self):
        from services import sync_service as service
        service.push_changes([self.change('create')])
        start = threading.Barrier(2)
        def push(device):
            start.wait(timeout=10)
            return service.push_changes([self.change(device, 'note.update', 1, device)])
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(push, ['A', 'B']))
        self.assertEqual(sum(len(item['accepted']) for item in outcomes), 1)
        self.assertEqual(sum(len(item['conflicts']) for item in outcomes), 1)
        self.assertEqual(service.get_sync_state()['remoteNotes'][0]['revision'], 2)
        self.assertEqual(len(service.pull_changes(None)['changes']), 2)

    def test_parallel_retry_is_idempotent(self):
        from services import sync_service as service
        start = threading.Barrier(2)
        def push(_):
            start.wait(timeout=10)
            return service.push_changes([self.change('same')])
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(push, [0, 1]))
        self.assertTrue(all(len(item['accepted']) == 1 and not item['conflicts'] for item in outcomes))
        self.assertEqual(len(service.pull_changes(None)['changes']), 1)

    def test_purge_keeps_tombstone_and_rejects_stale_recreation(self):
        from services import sync_service as service, sync_store_repository as repository
        service.push_changes([self.change('create')])
        service.push_changes([self.change('purge', 'note.purge', 1)])
        self.assertEqual(service.get_sync_state()['remoteNotes'][0]['scope'], 'purged')
        with repository.connect() as conn:
            self.assertEqual(conn.execute("SELECT content FROM notes_current WHERE note_id = 'shared'").fetchone()[0], '')
        self.assertTrue(service.push_changes([self.change('old-create')])['conflicts'])
        self.assertTrue(service.push_changes([self.change('old-restore', 'note.restore', 1)])['conflicts'])

    def test_stale_purge_and_restore_protect_newer_content(self):
        from services import sync_service as service
        service.push_changes([self.change('create')])
        service.push_changes([self.change('edit', 'note.update', 1, 'new content')])
        for kind in ['note.purge', 'note.restore']:
            result = service.push_changes([self.change(kind, kind, 1)])
            self.assertEqual(result['conflicts'][0]['reason'], 'revision_conflict')
        self.assertEqual(service.get_sync_state()['remoteNotes'][0]['revision'], 2)

    def test_empty_body_is_synchronized(self):
        from services import sync_service as service
        service.push_changes([self.change('create')])
        result = service.push_changes([self.change('empty', 'note.update', 1, '')])
        self.assertEqual(result['accepted'][0]['change']['payload']['content'], '')

    def test_app_bootstrap_excludes_permanent_deletion(self):
        from services import sync_service as service, app_store_repository as app_store
        service.push_changes([self.change('create')])
        service.push_changes([self.change('purge', 'note.purge', 1)])
        app_store.ensure_app_store()
        self.assertEqual(app_store.list_notes(), [])

    def test_stale_identical_body_cannot_overwrite_newer_metadata(self):
        from services import sync_service as service
        service.push_changes([self.change('create')])
        pinned = self.change('pin', 'note.patch', 1)
        pinned['payload'] = {'pinned': True}
        service.push_changes([pinned])
        stale = self.change('stale-metadata', 'note.update', 1)
        stale['payload']['pinned'] = False
        self.assertEqual(service.push_changes([stale])['conflicts'][0]['reason'], 'revision_conflict')
        self.assertTrue(service.pull_changes('1')['changes'][0]['payload']['pinned'])
        self.assertEqual(service.get_sync_state()['remoteNotes'][0]['revision'], 2)
