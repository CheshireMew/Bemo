from tests.api_test_case import ApiTestCase


class NotesApiTests(ApiTestCase):
    def test_create_and_search_notes(self):
        create_response = self.client.post("/api/notes/", json={
            "content": "hello api search #tag",
            "tags": ["tag"],
        })
        self.assertEqual(create_response.status_code, 200)
        created_payload = create_response.json()
        created_filename = created_payload["filename"]
        self.assertTrue(created_payload["note_id"].startswith("note_"))
        self.assertEqual(created_payload["revision"], 1)

        search_response = self.client.get("/api/notes/search", params={"q": "search"})
        self.assertEqual(search_response.status_code, 200)
        results = search_response.json()
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["filename"], created_filename)
        self.assertEqual(results[0]["note_id"], created_payload["note_id"])
        self.assertEqual(results[0]["revision"], 1)
        self.assertIn("hello api search", results[0]["content"])

    def test_update_and_patch_increment_revision(self):
        create_response = self.client.post("/api/notes/", json={
            "content": "revision start",
            "tags": ["rev"],
        })
        created = create_response.json()
        filename = created["filename"]
        note_id = created["note_id"]

        update_response = self.client.put(f"/api/notes/{filename}", json={
            "content": "revision after update",
            "tags": ["rev", "updated"],
        })
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.json()["note_id"], note_id)
        self.assertEqual(update_response.json()["revision"], 2)

        patch_response = self.client.patch(f"/api/notes/{filename}", json={"pinned": True})
        self.assertEqual(patch_response.status_code, 200)
        self.assertEqual(patch_response.json()["note_id"], note_id)
        self.assertEqual(patch_response.json()["revision"], 3)

        get_response = self.client.get(f"/api/notes/{filename}")
        self.assertEqual(get_response.status_code, 200)
        payload = get_response.json()
        self.assertEqual(payload["meta"]["note_id"], note_id)
        self.assertEqual(payload["meta"]["revision"], 3)
        self.assertEqual(payload["meta"]["pinned"], True)

    def test_legacy_note_without_sync_meta_still_returns_defaults(self):
        date_dir = self.notes_module.NOTES_DIR + "/2026/03/17"
        import os
        os.makedirs(date_dir, exist_ok=True)
        note_path = date_dir + "/legacy.md"
        with open(note_path, "w", encoding="utf-8") as file:
            file.write(
                "---\ncreated_at: '2026-03-17T10:00:00+08:00'\ntags:\n- legacy\npinned: false\n---\nlegacy body"
            )

        list_response = self.client.get("/api/notes/")
        self.assertEqual(list_response.status_code, 200)
        notes = list_response.json()
        self.assertEqual(len(notes), 1)
        self.assertTrue(notes[0]["note_id"].startswith("note_"))
        self.assertEqual(notes[0]["revision"], 1)

    def test_missing_note_and_trash_endpoints_return_404(self):
        get_response = self.client.get("/api/notes/2026/03/17/missing")
        self.assertEqual(get_response.status_code, 404)
        self.assertIn("Note not found", get_response.json()["detail"])

        restore_response = self.client.post("/api/notes/trash/restore/2026/03/17/missing")
        self.assertEqual(restore_response.status_code, 404)
        self.assertIn("Note not found in trash", restore_response.json()["detail"])
