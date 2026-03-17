import io
import zipfile

from tests.api_test_case import ApiTestCase


class UploadsApiTests(ApiTestCase):
    def test_export_zip_endpoint_returns_note_and_image(self):
        note_dir = self.notes_module.NOTES_DIR
        image_dir = self.notes_module.IMAGES_DIR

        self.client.post("/api/notes/", json={
            "content": "zip export body\n\n![img](/images/test.png)",
            "tags": ["zip"],
        })
        with open(f"{image_dir}/test.png", "wb") as file:
            file.write(b"png-data")

        response = self.client.get("/api/uploads/export/zip")
        self.assertEqual(response.status_code, 200)

        archive = zipfile.ZipFile(io.BytesIO(response.content))
        names = archive.namelist()
        self.assertTrue(any(name.startswith("notes/") and name.endswith(".md") for name in names))
        self.assertIn("images/test.png", names)

    def test_export_flomo_endpoint_returns_csv(self):
        self.client.post("/api/notes/", json={
            "content": "csv export body\n\n![img](/images/test.png)\n\n[file](/images/test.pdf)",
            "tags": ["flomo"],
        })

        response = self.client.get("/api/uploads/export/flomo")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/csv", response.headers["content-type"])
        self.assertIn(".csv", response.headers["content-disposition"])

        decoded = response.content.decode("utf-8-sig")
        self.assertIn("content,created_at", decoded)
        self.assertIn("csv export body", decoded)
        self.assertNotIn("/images/test.png", decoded)
        self.assertNotIn("/images/test.pdf", decoded)

    def test_import_zip_endpoint_restores_note_and_image(self):
        archive_buffer = io.BytesIO()
        with zipfile.ZipFile(archive_buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(
                "notes/2026/03/17/123_test.md",
                self.notes_module._build_frontmatter("2026-03-17T10:00:00+08:00", ["zip"], False) + "hello zip",
            )
            archive.writestr("images/test.png", b"png-data")

        response = self.client.post(
            "/api/uploads/zip",
            files={"file": ("backup.zip", archive_buffer.getvalue(), "application/zip")},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["imported_notes"], 1)
        self.assertEqual(payload["imported_images"], 1)

    def test_import_flomo_endpoint_restores_note(self):
        flomo_zip = io.BytesIO()
        with zipfile.ZipFile(flomo_zip, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(
                "memo.html",
                """
                <html><body>
                  <div class="memo">
                    <div class="time">2026-03-17 10:00:00</div>
                    <div class="content"><p>Hello #tag</p><ul><li>Item</li></ul></div>
                    <div class="files"></div>
                  </div>
                </body></html>
                """,
            )

        response = self.client.post(
            "/api/uploads/flomo",
            files={"file": ("flomo.zip", flomo_zip.getvalue(), "application/zip")},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["imported_count"], 1)

        notes = self.notes_module._collect_notes_recursive(self.notes_module.NOTES_DIR)
        self.assertEqual(len(notes), 1)
        self.assertIn("Hello #tag", notes[0]["content"])

    def test_upload_and_import_validation_errors_return_400(self):
        image_response = self.client.post(
            "/api/uploads/",
            files={"file": ("note.txt", b"not-image", "text/plain")},
        )
        self.assertEqual(image_response.status_code, 400)
        self.assertIn("File must be an image", image_response.json()["detail"])

        zip_response = self.client.post(
            "/api/uploads/zip",
            files={"file": ("backup.txt", b"not-zip", "text/plain")},
        )
        self.assertEqual(zip_response.status_code, 400)
        self.assertIn("Must be a .zip file", zip_response.json()["detail"])
