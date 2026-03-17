import json
import os

from core.paths import AI_SETTINGS_PATH


def default_ai_settings() -> dict:
    return {
        "enabled": False,
        "provider": "openai",
        "base_url": "https://api.openai.com/v1",
        "model": "gpt-4o-mini",
        "system_prompt": "",
        "api_key": "",
    }


def read_ai_settings() -> dict:
    if not os.path.exists(AI_SETTINGS_PATH):
        return default_ai_settings()

    try:
        with open(AI_SETTINGS_PATH, "r", encoding="utf-8") as file:
            data = json.load(file)
    except (OSError, json.JSONDecodeError):
        return default_ai_settings()

    return {
        **default_ai_settings(),
        **data,
    }


def get_stored_ai_settings() -> dict:
    return read_ai_settings()


def write_ai_settings(data: dict) -> None:
    os.makedirs(os.path.dirname(AI_SETTINGS_PATH), exist_ok=True)
    with open(AI_SETTINGS_PATH, "w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)


def mask_api_key(api_key: str) -> str:
    value = (api_key or "").strip()
    if not value:
        return ""
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}{'*' * max(4, len(value) - 8)}{value[-4:]}"
