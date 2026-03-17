import json
import os
import time
import uuid

from core.paths import AI_CONVERSATIONS_PATH
from services.service_errors import NotFoundError


def default_conversation_store() -> dict:
    return {"conversations": []}


def read_conversation_store() -> dict:
    if not os.path.exists(AI_CONVERSATIONS_PATH):
        return default_conversation_store()

    try:
        with open(AI_CONVERSATIONS_PATH, "r", encoding="utf-8") as file:
            data = json.load(file)
    except (OSError, json.JSONDecodeError):
        return default_conversation_store()

    if not isinstance(data, dict):
        return default_conversation_store()

    conversations = data.get("conversations")
    if not isinstance(conversations, list):
        conversations = []
    return {"conversations": conversations}


def write_conversation_store(store: dict) -> None:
    os.makedirs(os.path.dirname(AI_CONVERSATIONS_PATH), exist_ok=True)
    with open(AI_CONVERSATIONS_PATH, "w", encoding="utf-8") as file:
        json.dump(store, file, ensure_ascii=False, indent=2)


def find_conversation(store: dict, conversation_id: str) -> dict:
    for conversation in store["conversations"]:
        if conversation.get("id") == conversation_id:
            return conversation
    raise NotFoundError("对话不存在。")


def conversation_summary(conversation: dict) -> dict:
    messages = conversation.get("messages") or []
    return {
        "id": conversation.get("id"),
        "title": conversation.get("title") or "新对话",
        "context_mode": conversation.get("context_mode"),
        "created_at": int(conversation.get("created_at") or 0),
        "updated_at": int(conversation.get("updated_at") or 0),
        "message_count": len(messages),
    }


def conversation_detail(conversation: dict) -> dict:
    return {
        **conversation_summary(conversation),
        "messages": conversation.get("messages") or [],
    }


def derive_conversation_title(title: str, first_user_message: str) -> str:
    cleaned = (title or "").strip()
    if cleaned and cleaned != "新对话":
        return cleaned[:40]
    fallback = first_user_message.strip().replace("\n", " ")
    return fallback[:24] or "新对话"


def list_conversations() -> list[dict]:
    store = read_conversation_store()
    conversations = sorted(
        store["conversations"],
        key=lambda item: int(item.get("updated_at") or 0),
        reverse=True,
    )
    return [conversation_summary(conversation) for conversation in conversations]


def create_conversation(title: str, context_mode: str | None) -> dict:
    store = read_conversation_store()
    now = int(time.time())
    conversation = {
        "id": uuid.uuid4().hex,
        "title": (title or "新对话").strip() or "新对话",
        "context_mode": context_mode,
        "created_at": now,
        "updated_at": now,
        "messages": [],
    }
    store["conversations"].append(conversation)
    write_conversation_store(store)
    return conversation_detail(conversation)


def get_conversation(conversation_id: str) -> dict:
    store = read_conversation_store()
    conversation = find_conversation(store, conversation_id)
    return conversation_detail(conversation)


def update_conversation(conversation_id: str, *, title_set: bool, title: str | None, context_mode_set: bool, context_mode: str | None) -> dict:
    store = read_conversation_store()
    conversation = find_conversation(store, conversation_id)
    if title_set:
        conversation["title"] = (title or "").strip() or "新对话"
    if context_mode_set:
        conversation["context_mode"] = context_mode
    conversation["updated_at"] = int(time.time())
    write_conversation_store(store)
    return conversation_detail(conversation)


def delete_conversation(conversation_id: str) -> dict:
    store = read_conversation_store()
    original_count = len(store["conversations"])
    store["conversations"] = [
        conversation for conversation in store["conversations"] if conversation.get("id") != conversation_id
    ]
    if len(store["conversations"]) == original_count:
        raise NotFoundError("对话不存在。")
    write_conversation_store(store)
    return {"ok": True}


def append_chat_exchange(conversation_id: str, *, user_content: str, reply: str, context_mode: str | None) -> dict:
    store = read_conversation_store()
    conversation = find_conversation(store, conversation_id)
    now = int(time.time())
    if context_mode is not None:
        conversation["context_mode"] = context_mode
    messages = conversation.get("messages") or []
    messages.append({
        "role": "user",
        "content": user_content,
        "created_at": now,
    })
    messages.append({
        "role": "assistant",
        "content": reply,
        "created_at": now,
    })
    conversation["messages"] = messages
    conversation["updated_at"] = now
    conversation["title"] = derive_conversation_title(conversation.get("title") or "", user_content)
    write_conversation_store(store)
    return conversation_detail(conversation)


def get_conversation_record(conversation_id: str) -> dict:
    store = read_conversation_store()
    return find_conversation(store, conversation_id)
