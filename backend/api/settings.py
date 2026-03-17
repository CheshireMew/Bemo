import json
import os
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

DATA_DIR = os.getenv("BEMO_DATA_DIR", "./data")
AI_SETTINGS_PATH = os.path.join(DATA_DIR, "ai_settings.json")

router = APIRouter()

AiProvider = Literal["openai", "deepseek", "openai-compatible", "custom"]


class AiSettingsResponse(BaseModel):
    enabled: bool
    provider: AiProvider
    base_url: str
    model: str
    system_prompt: str
    has_api_key: bool
    masked_api_key: str


class AiSettingsUpdate(BaseModel):
    enabled: bool
    provider: AiProvider
    base_url: str
    model: str
    system_prompt: str = ""
    api_key: str | None = None
    clear_api_key: bool = False


def _default_ai_settings() -> dict:
    return {
        "enabled": False,
        "provider": "openai",
        "base_url": "https://api.openai.com/v1",
        "model": "gpt-4o-mini",
        "system_prompt": "",
        "api_key": "",
    }


def _read_ai_settings() -> dict:
    if not os.path.exists(AI_SETTINGS_PATH):
        return _default_ai_settings()

    try:
        with open(AI_SETTINGS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return _default_ai_settings()

    return {
        **_default_ai_settings(),
        **data,
    }


def get_stored_ai_settings() -> dict:
    return _read_ai_settings()


def _write_ai_settings(data: dict) -> None:
    os.makedirs(os.path.dirname(AI_SETTINGS_PATH), exist_ok=True)
    with open(AI_SETTINGS_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _mask_api_key(api_key: str) -> str:
    value = (api_key or "").strip()
    if not value:
        return ""
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}{'*' * max(4, len(value) - 8)}{value[-4:]}"


@router.get("/ai", response_model=AiSettingsResponse)
def get_ai_settings():
    data = _read_ai_settings()
    api_key = (data.get("api_key") or "").strip()
    return {
        "enabled": bool(data.get("enabled", False)),
        "provider": data.get("provider", "openai"),
        "base_url": data.get("base_url", ""),
        "model": data.get("model", ""),
        "system_prompt": data.get("system_prompt", ""),
        "has_api_key": bool(api_key),
        "masked_api_key": _mask_api_key(api_key),
    }


@router.put("/ai", response_model=AiSettingsResponse)
def update_ai_settings(payload: AiSettingsUpdate):
    current = _read_ai_settings()
    next_data = {
        "enabled": payload.enabled,
        "provider": payload.provider,
        "base_url": payload.base_url.strip(),
        "model": payload.model.strip(),
        "system_prompt": payload.system_prompt.strip(),
        "api_key": current.get("api_key", ""),
    }

    if payload.clear_api_key:
        next_data["api_key"] = ""
    elif payload.api_key is not None:
        next_data["api_key"] = payload.api_key.strip()

    _write_ai_settings(next_data)

    return {
        "enabled": next_data["enabled"],
        "provider": next_data["provider"],
        "base_url": next_data["base_url"],
        "model": next_data["model"],
        "system_prompt": next_data["system_prompt"],
        "has_api_key": bool(next_data["api_key"]),
        "masked_api_key": _mask_api_key(next_data["api_key"]),
    }


@router.delete("/ai", response_model=AiSettingsResponse)
def clear_ai_api_key():
    current = _read_ai_settings()
    current["api_key"] = ""
    _write_ai_settings(current)

    return {
        "enabled": bool(current.get("enabled", False)),
        "provider": current.get("provider", "openai"),
        "base_url": current.get("base_url", ""),
        "model": current.get("model", ""),
        "system_prompt": current.get("system_prompt", ""),
        "has_api_key": False,
        "masked_api_key": "",
    }
