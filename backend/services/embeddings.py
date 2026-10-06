import asyncio
import logging
from collections.abc import Sequence

from openai import OpenAIError

from backend.settings import settings

from .llm import get_openai_client

logger = logging.getLogger(__name__)


async def _embed_batch(texts: Sequence[str]) -> list[list[float]]:
    client = get_openai_client()
    resp = await client.embeddings.create(
        model=settings.openai_embedding_model,
        input=list(texts),
    )
    return [item.embedding for item in resp.data]


async def embed_text(texts: Sequence[str]) -> list[list[float]]:
    if not texts:
        return []
    batch_size = max(1, settings.embed_batch_size)
    results: list[list[float]] = []
    for start in range(0, len(texts), batch_size):
        batch = list(texts[start : start + batch_size])
        attempt = 0
        while True:
            try:
                results.extend(await _embed_batch(batch))
                break
            except OpenAIError as e:
                attempt += 1
                if attempt > settings.embed_max_retries:
                    logger.error("Embedding failed after retries: %s", str(e))
                    raise
                backoff = settings.embed_retry_base * (2 ** (attempt - 1))
                await asyncio.sleep(backoff)
    return results
