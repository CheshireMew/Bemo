from unittest.mock import patch
from types import SimpleNamespace

from tests.api_test_case import ApiTestCase
from services.service_errors import UpstreamServiceError, ValidationError


class AiApiTests(ApiTestCase):
    def test_conversation_crud_endpoints(self):
        create_response = self.client.post("/api/ai/conversations", json={
            "title": "API Chat",
            "context_mode": None,
        })
        self.assertEqual(create_response.status_code, 200)
        created = create_response.json()
        conversation_id = created["id"]
        self.assertEqual(created["title"], "API Chat")

        list_response = self.client.get("/api/ai/conversations")
        self.assertEqual(list_response.status_code, 200)
        listed = list_response.json()
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["id"], conversation_id)

        patch_response = self.client.patch(f"/api/ai/conversations/{conversation_id}", json={
            "title": "Renamed API Chat",
            "context_mode": "month",
        })
        self.assertEqual(patch_response.status_code, 200)
        updated = patch_response.json()
        self.assertEqual(updated["title"], "Renamed API Chat")
        self.assertEqual(updated["context_mode"], "month")

        get_response = self.client.get(f"/api/ai/conversations/{conversation_id}")
        self.assertEqual(get_response.status_code, 200)
        fetched = get_response.json()
        self.assertEqual(fetched["id"], conversation_id)
        self.assertEqual(fetched["messages"], [])

        delete_response = self.client.delete(f"/api/ai/conversations/{conversation_id}")
        self.assertEqual(delete_response.status_code, 200)
        self.assertEqual(delete_response.json(), {"ok": True})

    def test_missing_conversation_returns_404(self):
        response = self.client.get("/api/ai/conversations/missing")
        self.assertEqual(response.status_code, 404)
        self.assertIn("对话不存在", response.json()["detail"])

    def test_chat_validation_error_returns_400(self):
        with patch("api.ai.require_ai_runtime", side_effect=ValidationError("消息不能为空。")):
            response = self.client.post(
                "/api/ai/chat",
                json={
                    "message": "",
                    "conversation_id": "missing",
                    "notes": [],
                },
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("消息不能为空", response.json()["detail"])

    def test_chat_upstream_error_returns_502(self):
        create_response = self.client.post("/api/ai/conversations", json={"title": "API Chat"})
        conversation_id = create_response.json()["id"]

        with patch("api.ai.require_ai_runtime") as require_runtime_mock, patch(
            "api.ai.request_chat_completion",
            side_effect=UpstreamServiceError("AI provider unreachable: timeout"),
        ):
            require_runtime_mock.return_value = SimpleNamespace(
                api_key="key",
                base_url="https://api.example.com/v1",
                model="model",
                system_prompt="",
            )
            response = self.client.post(
                "/api/ai/chat",
                json={
                    "message": "hello",
                    "conversation_id": conversation_id,
                    "notes": [],
                },
            )

        self.assertEqual(response.status_code, 502)
        self.assertIn("AI provider unreachable", response.json()["detail"])
