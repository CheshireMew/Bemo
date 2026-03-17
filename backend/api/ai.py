import json
import os
import time
import uuid
from urllib import error, request

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from api.settings import get_stored_ai_settings

router = APIRouter()
DATA_DIR = os.getenv("BEMO_DATA_DIR", "./data")
AI_CONVERSATIONS_PATH = os.path.join(DATA_DIR, "ai_conversations.json")


class NoteForSummary(BaseModel):
    title: str = ""
    content: str
    created_at: int


class SummaryRequest(BaseModel):
    notes: list[NoteForSummary]


class SummaryResponse(BaseModel):
    summary: str
    note_count: int
    model: str


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    conversation_id: str
    context_mode: str | None = None
    notes: list[NoteForSummary] = []


class ChatResponse(BaseModel):
    reply: str
    note_count: int
    model: str
    conversation_id: str
    title: str
    context_mode: str | None = None


class ConversationCreateRequest(BaseModel):
    title: str = "新对话"
    context_mode: str | None = None


class ConversationUpdateRequest(BaseModel):
    title: str | None = None
    context_mode: str | None = None


class ConversationMessage(BaseModel):
    role: str
    content: str
    created_at: int


class ConversationSummary(BaseModel):
    id: str
    title: str
    context_mode: str | None = None
    created_at: int
    updated_at: int
    message_count: int


class ConversationDetail(ConversationSummary):
    messages: list[ConversationMessage]


class ConversationDeleteResponse(BaseModel):
    ok: bool


def _extract_message_content(payload: dict) -> str:
    choices = payload.get("choices") or []
    if not choices:
        raise HTTPException(status_code=502, detail="AI provider returned no choices.")

    message = choices[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = [item.get("text", "") for item in content if isinstance(item, dict)]
        return "\n".join(part for part in parts if part).strip()
    raise HTTPException(status_code=502, detail="AI provider returned an unsupported response format.")


def _build_note_blocks(notes: list[NoteForSummary], char_budget: int = 18000, limit: int = 24) -> list[str]:
    note_blocks = []
    current_chars = 0
    for index, note in enumerate(notes[:limit], start=1):
        block = f"[{index}] 标题：{note.title or '无标题'}\n创建时间：{note.created_at}\n内容：\n{note.content.strip()}\n"
        if current_chars + len(block) > char_budget and note_blocks:
            break
        note_blocks.append(block)
        current_chars += len(block)
    return note_blocks


def _request_chat_completion(base_url: str, api_key: str, model: str, messages: list[dict], temperature: float = 0.6) -> dict:
    req = request.Request(
        url=f"{base_url.rstrip('/')}/chat/completions",
        data=json.dumps({
            "model": model,
            "messages": messages,
            "temperature": temperature,
        }).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise HTTPException(status_code=502, detail=f"AI provider error: {detail or exc.reason}")
    except error.URLError as exc:
        raise HTTPException(status_code=502, detail=f"AI provider unreachable: {exc.reason}")


def _default_conversation_store() -> dict:
    return {"conversations": []}


def _read_conversation_store() -> dict:
    if not os.path.exists(AI_CONVERSATIONS_PATH):
        return _default_conversation_store()

    try:
        with open(AI_CONVERSATIONS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return _default_conversation_store()

    if not isinstance(data, dict):
        return _default_conversation_store()

    conversations = data.get("conversations")
    if not isinstance(conversations, list):
        conversations = []
    return {"conversations": conversations}


def _write_conversation_store(store: dict) -> None:
    os.makedirs(os.path.dirname(AI_CONVERSATIONS_PATH), exist_ok=True)
    with open(AI_CONVERSATIONS_PATH, "w", encoding="utf-8") as f:
        json.dump(store, f, ensure_ascii=False, indent=2)


def _find_conversation(store: dict, conversation_id: str) -> dict:
    for conversation in store["conversations"]:
        if conversation.get("id") == conversation_id:
            return conversation
    raise HTTPException(status_code=404, detail="对话不存在。")


def _conversation_summary(conversation: dict) -> dict:
    messages = conversation.get("messages") or []
    return {
        "id": conversation.get("id"),
        "title": conversation.get("title") or "新对话",
        "context_mode": conversation.get("context_mode"),
        "created_at": int(conversation.get("created_at") or 0),
        "updated_at": int(conversation.get("updated_at") or 0),
        "message_count": len(messages),
    }


def _conversation_detail(conversation: dict) -> dict:
    return {
        **_conversation_summary(conversation),
        "messages": conversation.get("messages") or [],
    }


def _derive_conversation_title(title: str, first_user_message: str) -> str:
    cleaned = (title or "").strip()
    if cleaned and cleaned != "新对话":
        return cleaned[:40]
    fallback = first_user_message.strip().replace("\n", " ")
    return (fallback[:24] or "新对话")


@router.get("/conversations", response_model=list[ConversationSummary])
def list_conversations():
    store = _read_conversation_store()
    conversations = sorted(
        store["conversations"],
        key=lambda item: int(item.get("updated_at") or 0),
        reverse=True,
    )
    return [_conversation_summary(conversation) for conversation in conversations]


@router.post("/conversations", response_model=ConversationDetail)
def create_conversation(payload: ConversationCreateRequest):
    store = _read_conversation_store()
    now = int(time.time())
    conversation = {
        "id": uuid.uuid4().hex,
        "title": (payload.title or "新对话").strip() or "新对话",
        "context_mode": payload.context_mode,
        "created_at": now,
        "updated_at": now,
        "messages": [],
    }
    store["conversations"].append(conversation)
    _write_conversation_store(store)
    return _conversation_detail(conversation)


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
def get_conversation(conversation_id: str):
    store = _read_conversation_store()
    conversation = _find_conversation(store, conversation_id)
    return _conversation_detail(conversation)


@router.patch("/conversations/{conversation_id}", response_model=ConversationDetail)
def update_conversation(conversation_id: str, payload: ConversationUpdateRequest):
    store = _read_conversation_store()
    conversation = _find_conversation(store, conversation_id)
    updates = payload.model_dump(exclude_unset=True)
    if "title" in updates:
        conversation["title"] = payload.title.strip() or "新对话"
    if "context_mode" in updates:
        conversation["context_mode"] = payload.context_mode
    conversation["updated_at"] = int(time.time())
    _write_conversation_store(store)
    return _conversation_detail(conversation)


@router.delete("/conversations/{conversation_id}", response_model=ConversationDeleteResponse)
def delete_conversation(conversation_id: str):
    store = _read_conversation_store()
    original_count = len(store["conversations"])
    store["conversations"] = [
        conversation for conversation in store["conversations"] if conversation.get("id") != conversation_id
    ]
    if len(store["conversations"]) == original_count:
        raise HTTPException(status_code=404, detail="对话不存在。")
    _write_conversation_store(store)
    return {"ok": True}


@router.post("/summarize", response_model=SummaryResponse)
def summarize_notes(payload: SummaryRequest):
    ai_settings = get_stored_ai_settings()
    api_key = (ai_settings.get("api_key") or "").strip()
    system_prompt = (ai_settings.get("system_prompt") or "").strip()

    if not ai_settings.get("enabled"):
        raise HTTPException(status_code=400, detail="AI 功能未启用。")
    if not api_key:
        raise HTTPException(status_code=400, detail="AI API Key 未配置。")
    if not payload.notes:
        raise HTTPException(status_code=400, detail="没有可总结的笔记。")

    note_blocks = _build_note_blocks(payload.notes)

    prompt = (
        "请使用简体中文，总结下面这些笔记的核心内容。\n"
        "输出结构固定为：\n"
        "1. 总体主题\n"
        "2. 关键洞察（3-5条）\n"
        "3. 可执行事项（如果没有就写“无”）\n"
        "4. 值得回看的原始观点（引用具体笔记编号）\n\n"
        f"笔记内容如下：\n\n{'\n'.join(note_blocks)}"
    )

    base_url = (ai_settings.get("base_url") or "").rstrip("/")
    model = (ai_settings.get("model") or "").strip()
    if not base_url or not model:
        raise HTTPException(status_code=400, detail="AI Base URL 或模型未配置。")

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    payload = _request_chat_completion(
        base_url=base_url,
        api_key=api_key,
        model=model,
        messages=messages,
    )

    summary = _extract_message_content(payload)
    if not summary:
        raise HTTPException(status_code=502, detail="AI provider returned empty content.")

    return {
        "summary": summary,
        "note_count": len(note_blocks),
        "model": model,
    }


@router.post("/chat", response_model=ChatResponse)
def chat_with_notes(payload: ChatRequest):
    ai_settings = get_stored_ai_settings()
    api_key = (ai_settings.get("api_key") or "").strip()
    system_prompt = (ai_settings.get("system_prompt") or "").strip()

    if not ai_settings.get("enabled"):
        raise HTTPException(status_code=400, detail="AI 功能未启用。")
    if not api_key:
        raise HTTPException(status_code=400, detail="AI API Key 未配置。")
    if not payload.message.strip():
        raise HTTPException(status_code=400, detail="消息不能为空。")

    base_url = (ai_settings.get("base_url") or "").rstrip("/")
    model = (ai_settings.get("model") or "").strip()
    if not base_url or not model:
        raise HTTPException(status_code=400, detail="AI Base URL 或模型未配置。")

    store = _read_conversation_store()
    conversation = _find_conversation(store, payload.conversation_id)
    if payload.context_mode is not None:
        conversation["context_mode"] = payload.context_mode

    note_blocks = _build_note_blocks(payload.notes, char_budget=14000, limit=18)
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    if note_blocks:
        messages.append({
            "role": "user",
            "content": "以下是当前可参考的笔记上下文，请在回答时自行判断是否需要引用：\n\n" + "\n".join(note_blocks),
        })
    history = conversation.get("messages") or []
    for item in history[-8:]:
        role = "user"
        if isinstance(item, dict):
            role = item.get("role") if item.get("role") in {"user", "assistant", "system"} else "user"
            content = str(item.get("content") or "").strip()
        else:
            content = ""
        if content:
            messages.append({"role": role, "content": content})
    user_content = payload.message.strip()
    messages.append({"role": "user", "content": user_content})

    provider_payload = _request_chat_completion(
        base_url=base_url,
        api_key=api_key,
        model=model,
        messages=messages,
        temperature=0.5,
    )
    reply = _extract_message_content(provider_payload)
    if not reply:
        raise HTTPException(status_code=502, detail="AI provider returned empty content.")

    now = int(time.time())
    conversation_messages = conversation.get("messages") or []
    conversation_messages.append({
        "role": "user",
        "content": user_content,
        "created_at": now,
    })
    conversation_messages.append({
        "role": "assistant",
        "content": reply,
        "created_at": now,
    })
    conversation["messages"] = conversation_messages
    conversation["updated_at"] = now
    conversation["title"] = _derive_conversation_title(conversation.get("title") or "", user_content)
    _write_conversation_store(store)

    return {
        "reply": reply,
        "note_count": len(note_blocks),
        "model": model,
        "conversation_id": conversation["id"],
        "title": conversation["title"],
        "context_mode": conversation.get("context_mode"),
    }
