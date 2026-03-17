from tests.api_test_case import ApiTestCase


class SyncLocalBlobApiTests(ApiTestCase):
    def test_local_blob_put_stores_image_file(self):
        response = self.client.put("/api/sync/local/blobs/sync-test.png", content=b"png-sync-data")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["filename"], "sync-test.png")

        with open(f"{self.notes_module.IMAGES_DIR}/sync-test.png", "rb") as file:
            self.assertEqual(file.read(), b"png-sync-data")
