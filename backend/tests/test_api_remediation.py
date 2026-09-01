from unittest.mock import patch

from api_test_case import ApiTestCase


class AppDataRemediationTests(ApiTestCase):
    app_mode = "app"

    def create_note(self, content="retained note"):
        response = self.client.post("/api/app/notes/", json={"content": content, "tags": []})
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_003_clear_trash_returns_exact_deleted_notes(self):
        active = self.create_note("keep")
        trashed = self.create_note("purge")
        self.client.delete(f"/api/app/notes/{trashed['note_id']}")
        response = self.client.delete("/api/app/notes/trash")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([n["note_id"] for n in response.json()["deleted_notes"]], [trashed["note_id"]])
        self.assertEqual([n["note_id"] for n in self.client.get("/api/app/notes/").json()], [active["note_id"]])
        self.assertEqual(self.client.get("/api/app/notes/trash").json(), [])

    def test_001_outbox_failure_rolls_back_primary_mutation(self):
        import json
        headers = {'X-Bemo-Sync-Context': json.dumps({'device_id': 'test', 'target': 'server'})}
        with patch('services.app_sync_service.queue_change', side_effect=OSError('queue write failed')):
            with self.assertRaises(OSError):
                self.client.post('/api/app/notes/', json={'content': 'must roll back', 'tags': []}, headers=headers)
        self.assertEqual(self.client.get('/api/app/notes/').json(), [])

    def test_011_unconfigured_sync_token_rejects_even_empty_bearer(self):
        with patch('api.sync.SYNC_TOKEN', ''), patch('api.sync.has_configured_sync_token', return_value=False):
            for headers in ({}, {'Authorization': 'Bearer'}, {'Authorization': 'Bearer '}):
                self.assertEqual(self.client.get('/api/sync/info', headers=headers).status_code, 401)

    def test_004_missing_attachment_backup_preserves_original(self):
        note = self.create_note()
        backup = self.client.get('/api/app/storage/backup').json()
        backup['notes'][0]['content'] = '![missing](/images/missing.png)'
        response = self.client.post('/api/app/storage/backup', json=backup)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.get('/api/app/notes/').json()[0]['content'], note['content'])

    def test_004_incomplete_backup_does_not_clear_store(self):
        note = self.create_note()
        response = self.client.post("/api/app/storage/backup", json={"format": "bemo-backup", "version": 3})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.get("/api/app/notes/").json()[0]["note_id"], note["note_id"])

    def test_004_attachment_failure_keeps_original_notes(self):
        note = self.create_note()
        backup = self.client.get("/api/app/storage/backup").json()
        backup["attachments"] = [{"filename": "a.png", "mime_type": "image/png", "data": [1, 2]}]
        with patch("services.app_store_repository.put_blob_record", side_effect=OSError("test disk full")):
            with self.assertRaises(OSError):
                self.client.post("/api/app/storage/backup", json=backup)
        self.assertEqual(self.client.get("/api/app/notes/").json()[0]["note_id"], note["note_id"])

    def test_004_write_failure_rolls_back_replacement(self):
        note = self.create_note()
        backup = self.client.get("/api/app/storage/backup").json()
        backup["notes"][0]["content"] = "replacement"
        backup["notes"].append({**backup["notes"][0], "note_id": "second"})
        from services import app_store_repository
        original = app_store_repository.upsert_note
        calls = 0

        def fail_second(value):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError("test interrupted write")
            original(value)

        with patch.object(app_store_repository, "upsert_note", side_effect=fail_second):
            with self.assertRaises(OSError):
                self.client.post("/api/app/storage/backup", json=backup)
        notes = self.client.get("/api/app/notes/").json()
        self.assertEqual([(n["note_id"], n["content"]) for n in notes], [(note["note_id"], note["content"])])
