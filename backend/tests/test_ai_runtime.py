import unittest
from unittest.mock import patch

from services.ai_runtime import require_ai_runtime
from services.service_errors import ValidationError


class AiRuntimeTests(unittest.TestCase):
    def test_require_ai_runtime_returns_normalized_config(self):
        with patch("services.ai_runtime.get_stored_ai_settings", return_value={
            "enabled": True,
            "api_key": " test-key ",
            "base_url": "https://api.example.com/v1/ ",
            "model": " test-model ",
            "system_prompt": "  prompt  ",
        }):
            config = require_ai_runtime(require_notes=True, notes_count=1, require_message=True, message=" hi ")

        self.assertEqual(config.api_key, "test-key")
        self.assertEqual(config.base_url, "https://api.example.com/v1/ ".rstrip("/"))
        self.assertEqual(config.model, "test-model")
        self.assertEqual(config.system_prompt, "prompt")

    def test_require_ai_runtime_rejects_missing_message(self):
        with patch("services.ai_runtime.get_stored_ai_settings", return_value={
            "enabled": True,
            "api_key": "key",
            "base_url": "https://api.example.com/v1",
            "model": "model",
            "system_prompt": "",
        }):
            with self.assertRaises(ValidationError) as exc:
                require_ai_runtime(require_message=True, message="   ")

        self.assertIn("消息不能为空", str(exc.exception))
