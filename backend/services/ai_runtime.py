from dataclasses import dataclass

from services.ai_settings_store import get_stored_ai_settings
from services.service_errors import ValidationError


@dataclass(frozen=True)
class AiRuntimeConfig:
    api_key: str
    base_url: str
    model: str
    system_prompt: str


def require_ai_runtime(*, require_notes: bool = False, notes_count: int = 0, require_message: bool = False, message: str = "") -> AiRuntimeConfig:
    ai_settings = get_stored_ai_settings()

    if not ai_settings.get("enabled"):
        raise ValidationError("AI 功能未启用。")

    api_key = (ai_settings.get("api_key") or "").strip()
    if not api_key:
        raise ValidationError("AI API Key 未配置。")

    base_url = (ai_settings.get("base_url") or "").rstrip("/")
    model = (ai_settings.get("model") or "").strip()
    if not base_url or not model:
        raise ValidationError("AI Base URL 或模型未配置。")

    if require_notes and notes_count <= 0:
        raise ValidationError("没有可总结的笔记。")

    if require_message and not message.strip():
        raise ValidationError("消息不能为空。")

    return AiRuntimeConfig(
        api_key=api_key,
        base_url=base_url,
        model=model,
        system_prompt=(ai_settings.get("system_prompt") or "").strip(),
    )
