import logging
from collections.abc import AsyncIterator
from typing import Any

from openai import OpenAIError

from backend.settings import settings

from .llm import call_llm, get_openai_client

logger = logging.getLogger(__name__)


def _to_openai_role(role: str) -> str:
    if role in {"assistant", "model"}:
        return "assistant"
    return "user"


def _language_directive(language: str | None) -> str:
    if language == "tr":
        return "Respond in Turkish."
    return "Respond in English."


def build_chat_messages(
    history: list[dict[str, Any]],
    system_prompt: str,
    project_context: str | None = None,
) -> list[dict[str, str]]:
    msgs: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    if project_context:
        msgs.append(
            {
                "role": "user",
                "content": f"Project context (user-provided data):\n{project_context}",
            }
        )
    for item in history:
        text = str(item.get("text") or item.get("content") or "").strip()
        if not text:
            continue
        msgs.append(
            {
                "role": _to_openai_role(str(item.get("role", "user"))),
                "content": text,
            }
        )
    return msgs


def build_idea_chat_messages(
    history: list[dict[str, Any]],
    *,
    mode: str = "chat",
    language: str | None = None,
    project_context: str | None = None,
) -> list[dict[str, str]]:
    base_prompt = (
        "You are an expert Grant Consultant for Turkish SMEs and Startups (TUBITAK, KOSGEB). "
        "Keep responses concise, actionable, and focus on clarifying the project. "
        "Ask clarifying questions about technical innovation, method, and commercial potential when helpful. "
        f"{_language_directive(language)}"
    )
    messages = build_chat_messages(history, base_prompt, project_context)
    if mode == "summary":
        messages.append(
            {
                "role": "system",
                "content": (
                    "Generate a professional 'Project 1-Pager' suitable for a TUBITAK/KOSGEB application. "
                    "Structure as: 1) Project Title, 2) Problem & Solution, 3) Innovative Aspect, 4) Methodology. "
                    "Keep it concise and grounded only in the conversation."
                ),
            }
        )
    return messages


async def run_idea_chat(
    history: list[dict[str, Any]],
    mode: str = "chat",
    language: str | None = None,
    project_context: str | None = None,
) -> str:
    messages = build_idea_chat_messages(
        history,
        mode=mode,
        language=language,
        project_context=project_context,
    )
    reply = await call_llm(messages, model=settings.openai_idea_model)
    return str(reply) if isinstance(reply, str) else ""


async def run_idea_chat_stream(
    history: list[dict[str, Any]],
    mode: str = "chat",
    language: str | None = None,
    project_context: str | None = None,
) -> AsyncIterator[str]:
    messages = build_idea_chat_messages(
        history,
        mode=mode,
        language=language,
        project_context=project_context,
    )
    client = get_openai_client()
    try:
        stream = await client.chat.completions.create(
            model=settings.openai_idea_model,
            messages=messages,
            stream=True,
        )
    except OpenAIError:
        raise
    except Exception as e:
        logger.error("Failed to start streaming chat: %s", str(e))
        raise

    async def iterator() -> AsyncIterator[str]:
        try:
            async for chunk in stream:
                part = ""
                if chunk.choices:
                    delta = chunk.choices[0].delta
                    part = getattr(delta, "content", None) or ""
                if part:
                    yield part
        except (OpenAIError, RuntimeError, ValueError) as e:
            logger.error("Streaming chat failed: %s", str(e))
            return

    return iterator()
