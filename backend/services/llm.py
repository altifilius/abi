"""Configured OpenAI-compatible clients; never cross a workspace AI boundary."""

import json
from dataclasses import dataclass
from typing import Any, Literal
from urllib.parse import urlparse

from jsonschema import Draft202012Validator
from jsonschema import ValidationError as SchemaValidationError
from openai import AsyncOpenAI, OpenAIError

from backend.settings import settings

AIPolicy = Literal["external", "local"]


class AIError(RuntimeError):
    status_code = 502
    code = "provider_error"


class AIConfigurationError(AIError):
    status_code = 503
    code = "configuration_error"


class AIProviderError(AIError):
    pass


@dataclass(frozen=True)
class AIConfig:
    policy: AIPolicy
    model: str
    base_url: str | None
    api_key: str


_clients: dict[tuple[str, str | None, str], AsyncOpenAI] = {}


def get_ai_config(policy: AIPolicy, purpose: str = "chat") -> AIConfig:
    if policy not in {"external", "local"}:
        raise AIConfigurationError("Workspace AI policy is not configured.")
    prefix = "local_ai" if policy == "local" else "openai"
    api_key = getattr(settings, f"{prefix}_api_key", "") or ""
    base_url = getattr(settings, f"{prefix}_base_url", None) or None
    model = getattr(settings, f"{prefix}_{purpose}_model", "") or ""
    if purpose == "idea" and not model:
        model = getattr(settings, f"{prefix}_chat_model", "") or ""
    if not api_key or not model or (policy == "local" and not base_url):
        raise AIConfigurationError(
            f"The workspace's {policy} AI {purpose} client is not configured."
        )
    if base_url:
        parsed = urlparse(base_url)
        if (
            parsed.scheme not in {"https", "http"}
            or not parsed.hostname
            or parsed.username
            or parsed.password
        ):
            raise AIConfigurationError(
                "AI base URL must be an HTTP(S) endpoint without embedded credentials."
            )
        if policy == "external" and parsed.scheme != "https":
            raise AIConfigurationError("External AI endpoints require HTTPS.")
    return AIConfig(policy=policy, model=model, base_url=base_url, api_key=api_key)


def get_ai_client(config: AIConfig) -> AsyncOpenAI:
    key = (config.policy, config.base_url, config.api_key)
    if key not in _clients:
        _clients[key] = AsyncOpenAI(
            api_key=config.api_key,
            base_url=config.base_url,
            timeout=getattr(settings, "ai_request_timeout_seconds", 90),
            max_retries=0,
        )
    return _clients[key]


def strict_response_format(json_schema: dict[str, Any]) -> dict[str, Any]:
    schema = json_schema.get("schema")
    name = json_schema.get("name")
    if not isinstance(schema, dict) or schema.get("type") != "object" or not isinstance(name, str):
        raise ValueError("Structured output requires a named root object schema.")
    Draft202012Validator.check_schema(schema)
    return {"type": "json_schema", "json_schema": {"name": name, "strict": True, "schema": schema}}


async def call_llm(
    messages: list[dict[str, Any]],
    *,
    policy: AIPolicy,
    purpose: str = "chat",
    response_format: Literal["text", "json_schema"] = "text",
    json_schema: dict[str, Any] | None = None,
) -> str | dict[str, Any]:
    config = get_ai_config(policy, purpose)
    params: dict[str, Any] = {
        "model": config.model,
        "messages": messages,
        "max_tokens": getattr(settings, "ai_max_output_tokens", 4096),
    }
    if policy == "local" and getattr(settings, "local_ai_reasoning_effort", None) is not None:
        params["reasoning_effort"] = settings.local_ai_reasoning_effort
    if response_format == "json_schema":
        if json_schema is None:
            raise ValueError("A schema is required for structured output.")
        params["response_format"] = strict_response_format(json_schema)
    try:
        response = await get_ai_client(config).chat.completions.create(**params)
    except (OpenAIError, ValueError, TypeError, AttributeError):
        # Exceptions may contain credentials, prompt excerpts or unknown-provider payloads.
        raise AIProviderError(
            "The configured AI provider could not complete the request."
        ) from None
    try:
        if not response.choices:
            raise AIProviderError("The AI provider returned no completion.")
        choice = response.choices[0]
        message = choice.message
        if getattr(message, "refusal", None) or choice.finish_reason != "stop":
            raise AIProviderError("The AI provider refused or did not finish the response.")
        content = message.content
    except (AttributeError, TypeError, IndexError):
        raise AIProviderError("The AI provider returned an invalid completion response.") from None
    if not isinstance(content, str) or not content.strip():
        raise AIProviderError("The AI provider returned an empty response.")
    if response_format == "text":
        return content.strip()
    try:
        data = json.loads(content)
        if not isinstance(data, dict):
            raise ValueError("Not a root object")
        Draft202012Validator(json_schema["schema"]).validate(data)
    except (ValueError, SchemaValidationError, TypeError):
        raise AIProviderError("The AI provider returned an invalid structured response.") from None
    return data
