from tests.api_test_case import ApiTestCase


class AppApiTests(ApiTestCase):
    app_mode = "app"

    def test_app_routes_round_trip_notes_attachments_and_backup(self):
        upload_response = self.client.post(
            "/api/app/attachments",
            files={"file": ("cover.png", b"\x89PNG\r\n\x1a\n", "image/png")},
        )
        self.assertEqual(upload_response.status_code, 200)
        attachment = upload_response.json()
        self.assertEqual(attachment["filename"], "cover.png")
        self.assertEqual(attachment["mime_type"], "image/png")

        create_response = self.client.post(
            "/api/app/notes/",
            json={
                "content": "# Title\n\n![cover](/images/cover.png)",
                "tags": ["demo"],
                "attachments": [attachment],
                "pinned": True,
                "revision": 3,
                "created_at": "2026-03-26T12:00:00.000Z",
            },
        )
        self.assertEqual(create_response.status_code, 200)
        note = create_response.json()
        self.assertEqual(note["title"], "Title")
        self.assertEqual(note["revision"], 3)
        self.assertEqual(note["tags"], ["demo"])
        self.assertEqual(note["pinned"], True)

        note_id = note["note_id"]
        list_response = self.client.get("/api/app/notes/")
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.json()), 1)

        search_response = self.client.get("/api/app/notes/search", params={"q": "Title"})
        self.assertEqual(search_response.status_code, 200)
        self.assertEqual(len(search_response.json()), 1)

        asset_response = self.client.get("/images/cover.png")
        self.assertEqual(asset_response.status_code, 200)
        self.assertEqual(asset_response.content, b"\x89PNG\r\n\x1a\n")
        self.assertEqual(asset_response.headers["content-type"], "image/png")

        trash_response = self.client.delete(f"/api/app/notes/{note_id}")
        self.assertEqual(trash_response.status_code, 200)
        self.assertTrue(bool(trash_response.json()["deleted_at"]))

        trash_list_response = self.client.get("/api/app/notes/trash")
        self.assertEqual(trash_list_response.status_code, 200)
        self.assertEqual(len(trash_list_response.json()), 1)

        restore_response = self.client.post(f"/api/app/notes/trash/{note_id}/restore")
        self.assertEqual(restore_response.status_code, 200)
        self.assertEqual(restore_response.json()["note_id"], note_id)

        backup_response = self.client.get("/api/app/storage/backup")
        self.assertEqual(backup_response.status_code, 200)
        backup = backup_response.json()
        self.assertEqual(backup["format"], "bemo-backup")
        self.assertEqual(backup["version"], 3)
        self.assertEqual(len(backup["notes"]), 1)
        self.assertEqual(len(backup["attachments"]), 1)
        self.assertEqual(backup["attachments"][0]["filename"], "cover.png")

        clear_response = self.client.delete("/api/app/storage")
        self.assertEqual(clear_response.status_code, 200)

        import_response = self.client.post("/api/app/storage/backup", json=backup)
        self.assertEqual(import_response.status_code, 200)
        self.assertEqual(import_response.json()["imported_notes"], 1)
        self.assertEqual(import_response.json()["imported_images"], 1)

        restored_notes = self.client.get("/api/app/notes/")
        self.assertEqual(restored_notes.status_code, 200)
        self.assertEqual(len(restored_notes.json()), 1)

        restored_asset = self.client.get("/images/cover.png")
        self.assertEqual(restored_asset.status_code, 200)
        self.assertEqual(restored_asset.content, b"\x89PNG\r\n\x1a\n")

    def test_cleanup_orphans_only_removes_unreferenced_backend_attachment(self):
        keep_response = self.client.post(
            "/api/app/attachments",
            files={"file": ("keep.png", b"keep", "image/png")},
        )
        drop_response = self.client.post(
            "/api/app/attachments",
            files={"file": ("drop.png", b"drop", "image/png")},
        )
        self.assertEqual(keep_response.status_code, 200)
        self.assertEqual(drop_response.status_code, 200)
        keep_attachment = keep_response.json()

        create_note_response = self.client.post(
            "/api/app/notes/",
            json={
                "content": "![cover](/images/keep.png)",
                "tags": [],
                "attachments": [keep_attachment],
            },
        )
        self.assertEqual(create_note_response.status_code, 200)

        summary_before = self.client.get("/api/app/storage/attachment-summary")
        self.assertEqual(summary_before.status_code, 200)
        self.assertEqual(summary_before.json()["storedAttachments"], 2)

        cleanup_response = self.client.post("/api/app/storage/cleanup-orphans")
        self.assertEqual(cleanup_response.status_code, 200)
        self.assertEqual(cleanup_response.json()["deleted_count"], 1)
        self.assertEqual(cleanup_response.json()["deleted_files"], ["drop.png"])

        keep_asset = self.client.get("/images/keep.png")
        self.assertEqual(keep_asset.status_code, 200)
        self.assertEqual(keep_asset.content, b"keep")

        drop_asset = self.client.get("/images/drop.png")
        self.assertEqual(drop_asset.status_code, 404)
