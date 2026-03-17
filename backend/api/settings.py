from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from services.ai_settings_store import (
    default_ai_settings,
    get_stored_ai_settings,
    mask_api_key,
    read_ai_settings,
    write_ai_settings,
)

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
@router.get("/ai", response_model=AiSettingsResponse)
def get_ai_settings():
    data = read_ai_settings()
    api_key = (data.get("api_key") or "").strip()
    return {
        "enabled": bool(data.get("enabled", False)),
        "provider": data.get("provider", "openai"),
        "base_url": data.get("base_url", ""),
        "model": data.get("model", ""),
        "system_prompt": data.get("system_prompt", ""),
        "has_api_key": bool(api_key),
        "masked_api_key": mask_api_key(api_key),
    }


@router.put("/ai", response_model=AiSettingsResponse)
def update_ai_settings(payload: AiSettingsUpdate):
    current = read_ai_settings()
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

    write_ai_settings(next_data)

    return {
        "enabled": next_data["enabled"],
        "provider": next_data["provider"],
        "base_url": next_data["base_url"],
        "model": next_data["model"],
        "system_prompt": next_data["system_prompt"],
        "has_api_key": bool(next_data["api_key"]),
        "masked_api_key": mask_api_key(next_data["api_key"]),
    }


@router.delete("/ai", response_model=AiSettingsResponse)
def clear_ai_api_key():
    current = read_ai_settings()
    current["api_key"] = ""
    write_ai_settings(current)

    return {
        "enabled": bool(current.get("enabled", False)),
        "provider": current.get("provider", "openai"),
        "base_url": current.get("base_url", ""),
        "model": current.get("model", ""),
        "system_prompt": current.get("system_prompt", ""),
        "has_api_key": False,
        "masked_api_key": "",
    }
