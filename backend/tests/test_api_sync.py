import importlib
import os
from unittest.mock import patch

from app_factory import create_app
from fastapi.testclient import TestClient

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

    def test_patch_conflict_returns_conflict(self):
        create_change = {
            "operation_id": "op-create-patch-1",
            "device_id": "device-a",
            "entity_id": "local_note_patch_1",
            "type": "note.create",
            "base_revision": 0,
            "timestamp": "2026-03-17T20:30:00+08:00",
            "payload": {
                "content": "origin",
                "tags": ["base"],
                "pinned": False,
                "created_at": "2026-03-17T20:30:00+08:00",
                "revision": 1,
            },
        }
        self.client.post("/api/sync/push", json={"changes": [create_change]}, headers=self.auth_headers)

        fresh_patch = {
            "operation_id": "op-patch-fresh-1",
            "device_id": "device-a",
            "entity_id": "local_note_patch_1",
            "type": "note.patch",
            "base_revision": 1,
            "timestamp": "2026-03-17T20:31:00+08:00",
            "payload": {
                "tags": ["fresh"],
                "pinned": True,
            },
        }
        self.client.post("/api/sync/push", json={"changes": [fresh_patch]}, headers=self.auth_headers)

        stale_patch = {
            "operation_id": "op-patch-stale-1",
            "device_id": "device-b",
            "entity_id": "local_note_patch_1",
            "type": "note.patch",
            "base_revision": 1,
            "timestamp": "2026-03-17T20:31:30+08:00",
            "payload": {
                "tags": ["stale"],
            },
        }
        response = self.client.post("/api/sync/push", json={"changes": [stale_patch]}, headers=self.auth_headers)
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload["accepted"]), 0)
        self.assertEqual(payload["conflicts"][0]["reason"], "revision_conflict")

    def test_delete_conflict_returns_conflict(self):
        create_change = {
            "operation_id": "op-create-delete-1",
            "device_id": "device-a",
            "entity_id": "local_note_delete_1",
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
            "operation_id": "op-update-delete-1",
            "device_id": "device-a",
            "entity_id": "local_note_delete_1",
            "type": "note.update",
            "base_revision": 1,
            "timestamp": "2026-03-17T20:31:00+08:00",
            "payload": {
                "content": "newer content",
                "tags": [],
            },
        }
        self.client.post("/api/sync/push", json={"changes": [update_change]}, headers=self.auth_headers)

        stale_delete = {
            "operation_id": "op-delete-stale-1",
            "device_id": "device-b",
            "entity_id": "local_note_delete_1",
            "type": "note.delete",
            "base_revision": 1,
            "timestamp": "2026-03-17T20:31:30+08:00",
            "payload": {},
        }
        response = self.client.post("/api/sync/push", json={"changes": [stale_delete]}, headers=self.auth_headers)
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(len(payload["accepted"]), 0)
        self.assertEqual(payload["conflicts"][0]["reason"], "revision_conflict")

    def test_pull_with_invalid_cursor_returns_400(self):
        response = self.client.get(
            "/api/sync/pull",
            params={"cursor": "abc"},
            headers=self.auth_headers,
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Invalid cursor")

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

    def test_blob_upload_rejects_payloads_above_limit(self):
        blob_hash = "sha256:too-large"
        payload = b"x" * 9
        with patch.dict(os.environ, {"BEMO_MAX_SYNC_BLOB_BYTES": "8"}, clear=False):
            import core.paths as paths_module
            import api.sync as sync_module
            importlib.reload(paths_module)
            importlib.reload(sync_module)
            with TestClient(create_app("server")) as server_client:
                response = server_client.put(
                    f"/api/sync/blobs/{blob_hash}",
                    content=payload,
                    headers=self.auth_headers,
                )
        self.assertEqual(response.status_code, 413)
        self.assertIn("Blob exceeds max size", response.json()["detail"])

    def test_server_mode_does_not_expose_local_sync_routes(self):
        with TestClient(create_app("server")) as server_client:
            response = server_client.post("/api/sync/local/apply", json={"changes": []})
        self.assertEqual(response.status_code, 404)

    def test_server_mode_requires_explicit_sync_token_configuration(self):
        with patch.dict(os.environ, {}, clear=True):
            os.environ["BEMO_DATA_DIR"] = self.data_dir
            import core.paths as paths_module
            import app_factory as app_factory_module
            importlib.reload(paths_module)
            importlib.reload(app_factory_module)
            with self.assertRaises(RuntimeError) as exc:
                app_factory_module.create_app("server")
        self.assertIn("BEMO_SYNC_TOKEN", str(exc.exception))
