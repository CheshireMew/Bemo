import importlib
import os
import shutil
import uuid
import unittest

from fastapi.testclient import TestClient


class ApiTestCase(unittest.TestCase):
    app_mode = "server"

    def setUp(self):
        self.test_root = os.path.join(os.path.dirname(__file__), ".tmp")
        os.makedirs(self.test_root, exist_ok=True)
        self.data_dir = os.path.join(self.test_root, f"api-{uuid.uuid4().hex}")
        os.makedirs(self.data_dir, exist_ok=True)

        self.original_data_dir = os.environ.get("BEMO_DATA_DIR")
        self.original_sync_token = os.environ.get("BEMO_SYNC_TOKEN")
        os.environ["BEMO_DATA_DIR"] = self.data_dir
        os.environ["BEMO_SYNC_TOKEN"] = "test-sync-token"

        import core.paths as paths_module
        import services.app_store_repository as app_store_repository_module
        import services.app_attachment_service as app_attachment_service_module
        import services.app_storage_service as app_storage_service_module
        import services.note_store_service as note_store_service_module
        import services.sync_store_repository as sync_store_repository_module
        import services.sync_service as sync_service_module
        import api.app_storage as app_storage_api_module
        import api.attachment_assets as attachment_assets_api_module
        import api.notes_app as notes_app_api_module
        import api.sync as sync_module
        import app_factory as app_factory_module

        importlib.reload(paths_module)
        importlib.reload(app_store_repository_module)
        importlib.reload(app_attachment_service_module)
        importlib.reload(app_storage_service_module)
        importlib.reload(note_store_service_module)
        importlib.reload(sync_store_repository_module)
        importlib.reload(sync_service_module)
        importlib.reload(app_storage_api_module)
        importlib.reload(attachment_assets_api_module)
        importlib.reload(notes_app_api_module)
        self.sync_module = importlib.reload(sync_module)
        self.app_factory_module = importlib.reload(app_factory_module)

        self.client = TestClient(self.app_factory_module.create_app(self.app_mode))

    def tearDown(self):
        self.client.close()
        if self.original_data_dir is None:
            os.environ.pop("BEMO_DATA_DIR", None)
        else:
            os.environ["BEMO_DATA_DIR"] = self.original_data_dir
        if self.original_sync_token is None:
            os.environ.pop("BEMO_SYNC_TOKEN", None)
        else:
            os.environ["BEMO_SYNC_TOKEN"] = self.original_sync_token
        shutil.rmtree(self.data_dir, ignore_errors=True)
        shutil.rmtree(self.test_root, ignore_errors=True)
