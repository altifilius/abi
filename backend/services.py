import asyncio
import json
import logging
from hashlib import sha256
from typing import Any, Dict, List, Sequence

from openai import AsyncOpenAI, OpenAIError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .funds import FUNDS
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
    messages: list[dict],
    *,
    response_format: str = "text",
    model: str | None = None,
    json_schema: dict | None = None,
) -> str | dict:
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
        .where(ReportChunk.report_id == (report_id or settings.default_report_id))
        .order_by(ReportChunk.embedding.cosine_distance(query_embedding))
        .limit(top_k)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


# --- Idea normalization ---
async def normalize_idea(idea_text: str, extra: dict | None = None) -> IdeaProfile:
    messages = [
        {
            "role": "system",
            "content": (
                "You normalize business ideas into a strict IdeaProfile JSON schema. "
                "Return ONLY valid JSON, no prose. "
                "If data is missing, use nulls and empty lists/objects rather than inventing details."
            ),
        },
        {
            "role": "user",
            "content": json.dumps(
                {
                    "idea_text": idea_text,
                    "extra_fields": extra or {},
                    "schema": {
                        "sector": "string | null",
                        "target_customer": "string | null",
                        "problem": "string | null",
                        "solution": "string | null",
                        "revenue_model": "string | null",
                        "current_stage": "string | null",
                        "main_risks": "array of strings (can be empty)",
                        "constraints": "object with budget/team/timeline keys if known",
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
    session: AsyncSession,
    idea_profile: IdeaProfile,
    top_k: int = 5,
    report_id: str | None = None,
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
            report_id=report_id or settings.default_report_id,
        )
        playbook = (
            await session.execute(
                select(DimensionPlaybook).where(
                    DimensionPlaybook.dimension_key == dim.key
                )
            )
        ).scalar_one_or_none()

        messages = [
            {
                "role": "system",
                "content": (
                    "You are an advisor grounded strictly in the provided report excerpts and playbook. "
                    "If chunks are empty, rely only on the playbook and idea_profile and explicitly note missing evidence. "
                    "If no playbook exists, use chunks + idea_profile only and say the playbook is absent."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "dimension": {
                            "key": dim.key,
                            "name": dim.name,
                            "description": dim.description,
                        },
                        "idea_profile": idea_profile.dict(),
                        "playbook": playbook.playbook_json if playbook else None,
                        "report_chunks": [
                            {
                                "page": c.page,
                                "section_title": c.section_title,
                                "text": c.text,
                            }
                            for c in chunks
                        ],
                        "instructions": {
                            "output_schema": {
                                "dimension": "string",
                                "score": "integer 0-10",
                                "diagnosis": "string",
                                "recommended_actions": "list of strings",
                                "risks": "list of strings",
                                "notes": "string explaining evidence source and any missing data",
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
                            "expected": {
                                "summary": "string",
                                "next_steps": "list of strings",
                            },
                        }
                    ),
                },
            ],
            response_format="json",
        )
        if isinstance(summary_resp, dict):
            summary = summary_resp.get("summary") or summary
            next_steps = summary_resp.get("next_steps") or []
    except Exception as exc:
        logger.warning("Overall assessment summarization failed: %s", exc)

    return {
        "idea_profile": idea_profile,
        "summary": summary,
        "next_steps": next_steps,
        "dimension_reports": dimension_reports,
    }


# --- Idea chat (AI Coach) ---
def _to_openai_role(role: str) -> str:
    if role in {"assistant", "model"}:
        return "assistant"
    return "user"


def build_chat_messages(
    history: list[dict],
    system_prompt: str,
    project_context: str | None = None,
) -> list[dict]:
    msgs: list[dict] = [{"role": "system", "content": system_prompt}]
    if project_context:
        msgs.append(
            {
                "role": "user",
                "content": f"Project context (user-provided data):\n{project_context}",
            }
        )
    for item in history:
        text = item.get("text") or item.get("content") or ""
        if not text:
            continue
        msgs.append({"role": _to_openai_role(item.get("role", "user")), "content": text})
    return msgs


def _language_directive(language: str | None) -> str:
    if language == "tr":
        return "Respond in Turkish."
    return "Respond in English."


async def run_idea_chat(
    history: list[dict],
    mode: str = "chat",
    language: str | None = None,
    project_context: str | None = None,
) -> str:
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

    reply = await call_llm(messages, model=settings.openai_idea_model)
    return reply if isinstance(reply, str) else ""


async def run_idea_chat_stream(
    history: list[dict],
    mode: str = "chat",
    language: str | None = None,
    project_context: str | None = None,
):
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

    async def iterator():
        try:
            async for chunk in stream:
                part = ""
                if chunk.choices:
                    delta = chunk.choices[0].delta
                    part = getattr(delta, "content", None) or ""
                if part:
                    yield part
        except Exception as e:
            logger.error("Streaming chat failed: %s", str(e))
            return

    return iterator()


# --- Fund matcher ---
async def run_fund_matcher(description: str) -> list[dict]:
    funds_context = [
        {
            "id": f["id"],
            "code": f["code"],
            "description": f["description"],
            "institution": f["institution"],
        }
        for f in FUNDS
    ]

    schema = {
        "name": "fund_matches",
        "schema": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "fundId": {"type": "string"},
                    "score": {"type": "integer", "minimum": 0, "maximum": 100},
                    "rationale": {"type": "string"},
                    "eligibilityStatus": {
                        "type": "string",
                        "enum": ["eligible", "conditional", "ineligible"],
                    },
                },
                "required": ["fundId", "score", "rationale", "eligibilityStatus"],
                "additionalProperties": False,
            },
        },
    }

    prompt = (
        "You are a grant eligibility assessor for Turkish programs. "
        "Score each available fund for the given project description. "
        "Return a JSON array following the provided schema, one entry per fund, with rationale grounded in the description."
    )

    messages = [
        {"role": "system", "content": prompt},
        {
            "role": "user",
            "content": json.dumps(
                {
                    "project_description": description,
                    "funds": funds_context,
                    "instructions": [
                        "Provide a score 0-100 for every fund id supplied.",
                        "Use concise rationales referencing description keywords.",
                        "Mark eligibilityStatus as eligible, conditional, or ineligible.",
                    ],
                }
            ),
        },
    ]

    data = await call_llm(
        messages,
        response_format="json_schema",
        model=settings.openai_fund_model,
        json_schema=schema,
    )

    if not isinstance(data, list):
        return []
    cleaned: list[dict] = []
    for item in data:
        try:
            cleaned.append(
                {
                    "fundId": item.get("fundId"),
                    "score": int(item.get("score")),
                    "rationale": item.get("rationale", ""),
                    "eligibilityStatus": item.get("eligibilityStatus"),
                }
            )
        except (AttributeError, TypeError, ValueError) as exc:
            logger.warning("Discarding invalid fund match item: %s", exc)
            continue
    return cleaned
