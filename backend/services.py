import asyncio
import json
import logging
from hashlib import sha256
from typing import Any, Dict, List, Sequence

from openai import AsyncOpenAI, OpenAIError
from pgvector.sqlalchemy import CosineDistance
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Dimension, DimensionPlaybook, ReportChunk
from .schemas import DimensionReport, IdeaProfile
from .settings import settings

logger = logging.getLogger(__name__)

# Reusable async OpenAI client
client = AsyncOpenAI(
    api_key=settings.openai_api_key,
    base_url=settings.openai_base_url or None,
)


# --- Embeddings ---
async def _embed_batch(texts: Sequence[str]) -> List[List[float]]:
    resp = await client.embeddings.create(
        model=settings.openai_embedding_model,
        input=list(texts),
    )
    return [item.embedding for item in resp.data]


async def embed_text(texts: Sequence[str]) -> List[List[float]]:
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


# --- LLM helper ---
async def call_llm(
    messages: list[dict], *, response_format: str = "text"
) -> str | dict:
    try:
        if response_format == "json":
            resp = await client.chat.completions.create(
                model=settings.openai_chat_model,
                messages=messages,
                response_format={"type": "json_object"},
            )
            content = resp.choices[0].message.content or "{}"
            return json.loads(content)
        resp = await client.chat.completions.create(
            model=settings.openai_chat_model,
            messages=messages,
        )
        return resp.choices[0].message.content or ""
    except OpenAIError as e:
        msg_preview = sha256(str(messages).encode()).hexdigest()[:8]
        logger.error(
            "LLM call failed (model=%s, hash=%s): %s",
            settings.openai_chat_model,
            msg_preview,
            str(e),
        )
        raise


# --- Search ---
async def search_report(
    session: AsyncSession, query: str, top_k: int = 5, report_id: str | None = None
) -> List[ReportChunk]:
    embeddings = await embed_text([query])
    if not embeddings:
        return []
    query_embedding = embeddings[0]
    stmt = (
        select(ReportChunk)
        .order_by(CosineDistance(ReportChunk.embedding, query_embedding))
        .limit(top_k)
    )
    if report_id:
        stmt = stmt.where(ReportChunk.report_id == report_id)
    result = await session.execute(stmt)
    return list(result.scalars().all())


# --- Idea normalization ---
async def normalize_idea(idea_text: str, extra: dict | None = None) -> IdeaProfile:
    messages = [
        {
            "role": "system",
            "content": (
                "Normalize the business idea into the IdeaProfile JSON schema. "
                "Return only valid JSON with keys: sector, target_customer, problem, "
                "solution, revenue_model, current_stage, main_risks (array), constraints (object)."
            ),
        },
        {
            "role": "user",
            "content": json.dumps(
                {
                    "idea_text": idea_text,
                    "extra_fields": extra or {},
                    "schema": {
                        "sector": "string",
                        "target_customer": "string",
                        "problem": "string",
                        "solution": "string",
                        "revenue_model": "string",
                        "current_stage": "string",
                        "main_risks": "array of strings",
                        "constraints": "object",
                    },
                }
            ),
        },
    ]
    data = await call_llm(messages, response_format="json")
    if not isinstance(data, dict):
        data = {}
    try:
        return IdeaProfile(**data)
    except Exception:
        return IdeaProfile(
            sector=data.get("sector"),
            target_customer=data.get("target_customer"),
            problem=data.get("problem"),
            solution=data.get("solution"),
            revenue_model=data.get("revenue_model"),
            current_stage=data.get("current_stage"),
            main_risks=data.get("main_risks") or [],
            constraints=data.get("constraints") or {},
        )


# --- Idea analysis ---
async def analyze_idea_with_report(
    session: AsyncSession, idea_profile: IdeaProfile, top_k: int = 5, report_id: str | None = None
) -> dict:
    dims = (await session.execute(select(Dimension))).scalars().all()
    if not dims:
        return {
            "idea_profile": idea_profile,
            "summary": "No dimensions configured.",
            "next_steps": [],
            "dimension_reports": [],
        }

    dimension_reports: List[Dict[str, Any]] = []

    for dim in dims:
        chunks = await search_report(
            session,
            f"{dim.key} assessment for idea: sector={idea_profile.sector}, problem={idea_profile.problem}, solution={idea_profile.solution}",
            top_k=top_k,
            report_id=report_id,
        )
        playbook = (
            await session.execute(
                select(DimensionPlaybook).where(DimensionPlaybook.dimension_key == dim.key)
            )
        ).scalar_one_or_none()

        messages = [
            {
                "role": "system",
                "content": (
                    "You are an advisor grounded strictly in the provided report excerpts and playbook. "
                    "Do not invent new frameworks; if information is missing, say so."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "dimension": {"key": dim.key, "name": dim.name, "description": dim.description},
                        "idea_profile": idea_profile.dict(),
                        "playbook": playbook.playbook_json if playbook else None,
                        "report_chunks": [
                            {"page": c.page, "section_title": c.section_title, "text": c.text}
                            for c in chunks
                        ],
                        "instructions": {
                            "output": {
                                "dimension": "string",
                                "score": "0-10 integer",
                                "diagnosis": "string",
                                "recommended_actions": "list of strings",
                                "risks": "list of strings",
                            }
                        },
                    }
                ),
            },
        ]

        data = await call_llm(messages, response_format="json")
        if not isinstance(data, dict):
            data = {}
        try:
            report = DimensionReport(**data)
        except Exception:
            report = DimensionReport(
                dimension=data.get("dimension") or dim.key,
                score=data.get("score"),
                diagnosis=data.get("diagnosis"),
                recommended_actions=data.get("recommended_actions") or [],
                risks=data.get("risks") or [],
            )
        dimension_reports.append(report.dict())

    summary = "Overall assessment generated from dimension reports."
    next_steps: List[str] = []
    try:
        summary_resp = await call_llm(
            [
                {
                    "role": "system",
                    "content": "Summarize the dimension reports into a concise overall assessment and next steps.",
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "idea_profile": idea_profile.dict(),
                            "dimension_reports": dimension_reports,
                            "expected": {"summary": "string", "next_steps": "list of strings"},
                        }
                    ),
                },
            ],
            response_format="json",
        )
        if isinstance(summary_resp, dict):
            summary = summary_resp.get("summary") or summary
            next_steps = summary_resp.get("next_steps") or []
    except Exception:
        pass

    return {
        "idea_profile": idea_profile,
        "summary": summary,
        "next_steps": next_steps,
        "dimension_reports": dimension_reports,
    }
