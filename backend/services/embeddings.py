"""Embedding requests use the same explicit workspace policy as chat."""

import math
from collections.abc import Sequence

from openai import OpenAIError

from backend.settings import settings

from .llm import AIPolicy, AIProviderError, get_ai_client, get_ai_config


async def embed_text(texts: Sequence[str], *, policy: AIPolicy) -> list[list[float]]:
    if not texts:
        return []
    if any(not isinstance(text, str) or not text.strip() for text in texts):
        raise ValueError("Embedding input cannot be empty.")
    config = get_ai_config(policy, "embedding")
    results: list[list[float]] = []
    dimensions: int | None = None
    batch_size = settings.embed_batch_size
    for start in range(0, len(texts), batch_size):
        batch = list(texts[start : start + batch_size])
        try:
            response = await get_ai_client(config).embeddings.create(
                model=config.model, input=batch
            )
        except (OpenAIError, ValueError, TypeError, AttributeError):
            raise AIProviderError(
                "The configured AI embedding provider could not complete the request."
            ) from None
        try:
            ordered = sorted(response.data, key=lambda item: item.index)
            if [item.index for item in ordered] != list(range(len(batch))):
                raise AIProviderError(
                    "The embedding provider returned incomplete or duplicate results."
                )
        except (AttributeError, TypeError):
            raise AIProviderError("The embedding provider returned an invalid response.") from None
        for item in ordered:
            vector = getattr(item, "embedding", None)
            if (
                not isinstance(vector, list)
                or not vector
                or any(
                    isinstance(value, bool)
                    or not isinstance(value, (int, float))
                    or not math.isfinite(value)
                    for value in vector
                )
                or not any(vector)
            ):
                raise AIProviderError("The embedding provider returned an invalid vector.")
            if dimensions is None:
                dimensions = len(vector)
            if len(vector) != dimensions:
                raise AIProviderError("The embedding provider returned inconsistent dimensions.")
            results.append(vector)
    return results
