from tests.api_test_case import ApiTestCase


class SyncApiTests(ApiTestCase):
    auth_headers = {"Authorization": "Bearer test-sync-token"}

    def test_sync_requires_token(self):
        response = self.client.get("/api/sync/info")
        self.assertEqual(response.status_code, 401)

    def test_push_pull_and_idempotency(self):
        create_change = {
            "operation_id": "op-create-1",
            "device_id": "device-a",
            "entity_id": "local_note_1",
            "type": "note.create",
            "base_revision": 0,
            "timestamp": "2026-03-17T20:30:00+08:00",
            "payload": {
                "content": "hello sync",
                "tags": ["sync"],
                "pinned": False,
                "created_at": "2026-03-17T20:30:00+08:00",
                "revision": 1,
            },
        }

        push_response = self.client.post(
            "/api/sync/push",
            json={"changes": [create_change]},
            headers=self.auth_headers,
        )
        self.assertEqual(push_response.status_code, 200)
        payload = push_response.json()
        self.assertEqual(len(payload["accepted"]), 1)
        self.assertEqual(len(payload["conflicts"]), 0)

        duplicate_response = self.client.post(
            "/api/sync/push",
            json={"changes": [create_change]},
            headers=self.auth_headers,
        )
        self.assertEqual(duplicate_response.status_code, 200)
        self.assertEqual(duplicate_response.json()["accepted"][0]["duplicate"], True)

        pull_response = self.client.get("/api/sync/pull", headers=self.auth_headers)
        self.assertEqual(pull_response.status_code, 200)
        pulled = pull_response.json()
        self.assertEqual(len(pulled["changes"]), 1)
        self.assertEqual(pulled["changes"][0]["entity_id"], "local_note_1")

    def test_update_conflict_returns_conflict(self):
        create_change = {
            "operation_id": "op-create-2",
            "device_id": "device-a",
            "entity_id": "local_note_2",
            "type": "note.create",
            "base_revision": 0,
            "timestamp": "2026-03-17T20:30:00+08:00",
            "payload": {
                "content": "origin",
                "tags": [],
                "pinned": False,
                "created_at": "2026-03-17T20:30:00+08:00",
                "revision": 1,
            },
        }
        self.client.post("/api/sync/push", json={"changes": [create_change]}, headers=self.auth_headers)

        update_change = {
            "operation_id": "op-update-2",
            "device_id": "device-a",
            "entity_id": "local_note_2",
            "type": "note.update",
            "base_revision": 1,
            "timestamp": "2026-03-17T20:31:00+08:00",
            "payload": {
                "content": "remote update",
                "tags": [],
            },
        }
        self.client.post("/api/sync/push", json={"changes": [update_change]}, headers=self.auth_headers)

        conflict_change = {
            "operation_id": "op-update-3",
            "device_id": "device-b",
            "entity_id": "local_note_2",
            "type": "note.update",
            "base_revision": 1,
            "timestamp": "2026-03-17T20:31:30+08:00",
            "payload": {
                "content": "stale update",
                "tags": [],
            },
        }
        response = self.client.post("/api/sync/push", json={"changes": [conflict_change]}, headers=self.auth_headers)
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload["accepted"]), 0)
        self.assertEqual(payload["conflicts"][0]["reason"], "revision_conflict")

    def test_blob_upload_and_download(self):
        blob_hash = "sha256:testblob1234"
        put_response = self.client.put(
            f"/api/sync/blobs/{blob_hash}",
            content=b"blob-data",
            headers=self.auth_headers,
        )
        self.assertEqual(put_response.status_code, 200)

        head_response = self.client.head(f"/api/sync/blobs/{blob_hash}", headers=self.auth_headers)
        self.assertEqual(head_response.status_code, 200)

        get_response = self.client.get(f"/api/sync/blobs/{blob_hash}", headers=self.auth_headers)
        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(get_response.content, b"blob-data")
