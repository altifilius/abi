import json
import logging
from hashlib import sha256
from typing import Any

from openai import AsyncOpenAI, OpenAIError

from backend.settings import settings

logger = logging.getLogger(__name__)

_client: AsyncOpenAI | None = None


def get_openai_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url or None,
        )
    return _client


async def call_llm(
    messages: list[dict[str, Any]],
    *,
    response_format: str = "text",
    model: str | None = None,
    json_schema: dict[str, Any] | None = None,
) -> str | dict[str, Any] | list[Any]:
    client = get_openai_client()
    chosen_model = model or settings.openai_chat_model
    try:
        params: dict[str, Any] = {
            "model": chosen_model,
            "messages": messages,
        }
        if response_format == "json":
            params["response_format"] = {"type": "json_object"}
        elif response_format == "json_schema" and json_schema:
            params["response_format"] = {
                "type": "json_schema",
                "json_schema": json_schema,
                "strict": True,
            }

        resp = await client.chat.completions.create(**params)
        content = resp.choices[0].message.content or ""

        if response_format in {"json", "json_schema"}:
            try:
                return json.loads(content)
            except json.JSONDecodeError:
                logger.error("Failed to decode JSON response: %s", content)
                return {}
        return content
    except OpenAIError as e:
        msg_preview = sha256(str(messages).encode()).hexdigest()[:8]
        logger.error(
            "LLM call failed (model=%s, hash=%s): %s",
            chosen_model,
            msg_preview,
            str(e),
        )
        raise
