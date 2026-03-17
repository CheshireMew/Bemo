import json
from urllib import error, request

from services.service_errors import UpstreamServiceError


def request_chat_completion(
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict],
    temperature: float = 0.6,
) -> dict:
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
        raise UpstreamServiceError(f"AI provider error: {detail or exc.reason}")
    except error.URLError as exc:
        raise UpstreamServiceError(f"AI provider unreachable: {exc.reason}")


def extract_message_content(payload: dict) -> str:
    choices = payload.get("choices") or []
    if not choices:
        raise UpstreamServiceError("AI provider returned no choices.")

    message = choices[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = [item.get("text", "") for item in content if isinstance(item, dict)]
        return "\n".join(part for part in parts if part).strip()
    raise UpstreamServiceError("AI provider returned an unsupported response format.")
