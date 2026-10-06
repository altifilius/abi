import json
import logging
from typing import Any

from openai import OpenAIError
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import Dimension, DimensionPlaybook, ReportChunk
from backend.schemas import DimensionReport, IdeaProfile
from backend.settings import settings

from .embeddings import embed_text
from .llm import call_llm

logger = logging.getLogger(__name__)


async def search_report(
    session: AsyncSession,
    query: str,
    top_k: int = 5,
    report_id: str | None = None,
) -> list[ReportChunk]:
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


async def normalize_idea(idea_text: str, extra: dict[str, Any] | None = None) -> IdeaProfile:
    messages: list[dict[str, Any]] = [
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
        return IdeaProfile.model_validate(data)
    except ValidationError:
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


async def analyze_idea_with_report(
    session: AsyncSession,
    idea_profile: IdeaProfile,
    top_k: int = 5,
    report_id: str | None = None,
) -> dict[str, Any]:
    dims = (await session.execute(select(Dimension))).scalars().all()
    if not dims:
        return {
            "idea_profile": idea_profile,
            "summary": "No dimensions configured.",
            "next_steps": [],
            "dimension_reports": [],
        }

    dimension_reports: list[dict[str, Any]] = []

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

        messages: list[dict[str, Any]] = [
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
                        "idea_profile": idea_profile.model_dump(),
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
            report = DimensionReport.model_validate(data)
        except ValidationError:
            report = DimensionReport(
                dimension=data.get("dimension") or dim.key,
                score=data.get("score"),
                diagnosis=data.get("diagnosis"),
                recommended_actions=data.get("recommended_actions") or [],
                risks=data.get("risks") or [],
            )
        dimension_reports.append(report.model_dump())

    summary = "Overall assessment generated from dimension reports."
    next_steps: list[str] = []
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
                            "idea_profile": idea_profile.model_dump(),
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
    except (KeyError, TypeError, ValueError, OpenAIError) as exc:
        logger.warning("Overall assessment summarization failed: %s", exc)

    return {
        "idea_profile": idea_profile,
        "summary": summary,
        "next_steps": next_steps,
        "dimension_reports": dimension_reports,
    }
