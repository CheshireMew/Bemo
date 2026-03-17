from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.ai_runtime import require_ai_runtime
from services.ai_conversation_store import (
    append_chat_exchange,
    create_conversation as create_conversation_record,
    delete_conversation as delete_conversation_record,
    get_conversation as get_conversation_detail,
    get_conversation_record,
    list_conversations as list_conversation_summaries,
    update_conversation as update_conversation_record,
)
from services.ai_prompt_builder import build_chat_messages, build_note_blocks, build_summary_prompt
from services.ai_provider import extract_message_content, request_chat_completion
from services.service_errors import NotFoundError, UpstreamServiceError, ValidationError

router = APIRouter()


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


@router.get("/conversations", response_model=list[ConversationSummary])
def list_conversations():
    return list_conversation_summaries()


@router.post("/conversations", response_model=ConversationDetail)
def create_conversation(payload: ConversationCreateRequest):
    return create_conversation_record(payload.title, payload.context_mode)


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
def get_conversation(conversation_id: str):
    try:
        return get_conversation_detail(conversation_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.patch("/conversations/{conversation_id}", response_model=ConversationDetail)
def update_conversation(conversation_id: str, payload: ConversationUpdateRequest):
    updates = payload.model_dump(exclude_unset=True)
    try:
        return update_conversation_record(
            conversation_id,
            title_set="title" in updates,
            title=payload.title,
            context_mode_set="context_mode" in updates,
            context_mode=payload.context_mode,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.delete("/conversations/{conversation_id}", response_model=ConversationDeleteResponse)
def delete_conversation(conversation_id: str):
    try:
        return delete_conversation_record(conversation_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/summarize", response_model=SummaryResponse)
def summarize_notes(payload: SummaryRequest):
    try:
        runtime = require_ai_runtime(require_notes=True, notes_count=len(payload.notes))
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    note_blocks = build_note_blocks(payload.notes)
    prompt = build_summary_prompt(note_blocks)

    messages = []
    if runtime.system_prompt:
        messages.append({"role": "system", "content": runtime.system_prompt})
    messages.append({"role": "user", "content": prompt})

    try:
        provider_payload = request_chat_completion(
            base_url=runtime.base_url,
            api_key=runtime.api_key,
            model=runtime.model,
            messages=messages,
        )
        summary = extract_message_content(provider_payload)
    except UpstreamServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    if not summary:
        raise HTTPException(status_code=502, detail="AI provider returned empty content.")

    return {
        "summary": summary,
        "note_count": len(note_blocks),
        "model": runtime.model,
    }


@router.post("/chat", response_model=ChatResponse)
def chat_with_notes(payload: ChatRequest):
    try:
        runtime = require_ai_runtime(require_message=True, message=payload.message)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        conversation = get_conversation_record(payload.conversation_id)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    note_blocks = build_note_blocks(payload.notes, char_budget=14000, limit=18)
    user_content = payload.message.strip()
    messages = build_chat_messages(
        system_prompt=runtime.system_prompt,
        note_blocks=note_blocks,
        history=conversation.get("messages") or [],
        user_content=user_content,
    )

    try:
        provider_payload = request_chat_completion(
            base_url=runtime.base_url,
            api_key=runtime.api_key,
            model=runtime.model,
            messages=messages,
            temperature=0.5,
        )
        reply = extract_message_content(provider_payload)
    except UpstreamServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    if not reply:
        raise HTTPException(status_code=502, detail="AI provider returned empty content.")
    try:
        conversation = append_chat_exchange(
            payload.conversation_id,
            user_content=user_content,
            reply=reply,
            context_mode=payload.context_mode,
        )
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return {
        "reply": reply,
        "note_count": len(note_blocks),
        "model": runtime.model,
        "conversation_id": conversation["id"],
        "title": conversation["title"],
        "context_mode": conversation.get("context_mode"),
    }
