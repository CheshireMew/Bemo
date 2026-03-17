import importlib
import os
import shutil
import unittest
import uuid


class AiConversationStoreTests(unittest.TestCase):
    def setUp(self):
        self.test_root = os.path.join(os.path.dirname(__file__), ".tmp")
        os.makedirs(self.test_root, exist_ok=True)
        self.temp_dir = os.path.join(self.test_root, f"conversation-store-{uuid.uuid4().hex}")
        os.makedirs(self.temp_dir, exist_ok=True)
        self.original_data_dir = os.environ.get("BEMO_DATA_DIR")
        os.environ["BEMO_DATA_DIR"] = self.temp_dir
        import core.paths as paths_module
        import services.ai_conversation_store as conversation_store
        importlib.reload(paths_module)
        self.store = importlib.reload(conversation_store)

    def tearDown(self):
        if self.original_data_dir is None:
            os.environ.pop("BEMO_DATA_DIR", None)
        else:
            os.environ["BEMO_DATA_DIR"] = self.original_data_dir
        shutil.rmtree(self.temp_dir, ignore_errors=True)
        shutil.rmtree(self.test_root, ignore_errors=True)

    def test_conversation_crud_and_append_chat_exchange(self):
        created = self.store.create_conversation("First chat", None)
        conversation_id = created["id"]

        fetched = self.store.get_conversation(conversation_id)
        self.assertEqual(fetched["title"], "First chat")
        self.assertEqual(fetched["message_count"], 0)

        updated = self.store.update_conversation(
            conversation_id,
            title_set=True,
            title="Renamed",
            context_mode_set=True,
            context_mode="week",
        )
        self.assertEqual(updated["title"], "Renamed")
        self.assertEqual(updated["context_mode"], "week")

        appended = self.store.append_chat_exchange(
            conversation_id,
            user_content="hello world",
            reply="hi there",
            context_mode="month",
        )
        self.assertEqual(appended["message_count"], 2)
        self.assertEqual(appended["title"], "Renamed")
        self.assertEqual(appended["context_mode"], "month")

        listed = self.store.list_conversations()
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["id"], conversation_id)

        deleted = self.store.delete_conversation(conversation_id)
        self.assertEqual(deleted, {"ok": True})
        self.assertEqual(self.store.list_conversations(), [])
