from typing import List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pgvector.sqlalchemy import CosineDistance

from .models import ReportChunk, Dimension, DimensionPlaybook
from .schemas import IdeaProfile


# --- Embedding + LLM stubs ---
async def embed_text(text: str) -> List[float]:
  # TODO: replace with OpenAI embeddings call
  raise NotImplementedError("Plug in OpenAI embeddings (e.g., text-embedding-3-large)")


async def call_llm(prompt: str) -> str:
  # TODO: replace with OpenAI chat/completions
  raise NotImplementedError("Plug in OpenAI LLM call")


# --- Search ---
async def search_report(session: AsyncSession, query: str, top_k: int = 5) -> List[ReportChunk]:
    """
    Vector search against report_chunks using cosine distance.
    """
    query_embedding = await embed_text(query)
    stmt = (
        select(ReportChunk)
        .order_by(CosineDistance(ReportChunk.embedding, query_embedding))
        .limit(top_k)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


# --- Idea normalization ---
async def normalize_idea(idea_text: str, extra: dict | None = None) -> IdeaProfile:
    prompt = f"""Normalize the following business idea into JSON fields: sector, target_customer,
problem, solution, revenue_model, current_stage, main_risks (list), constraints (object).

Idea text:
{idea_text}

Extra fields:
{extra or {}}
"""
    # In production, call LLM with a strict JSON schema. Stubbed here.
    _ = await call_llm(prompt)
    # Placeholder deterministic structure
    return IdeaProfile(
        sector=extra.get("sector") if extra else None,
        target_customer=None,
        problem=None,
        solution=None,
        revenue_model=None,
        current_stage=extra.get("stage") if extra else None,
        main_risks=[],
        constraints={"budget": extra.get("budget")} if extra and extra.get("budget") else {},
    )


# --- Idea analysis ---
async def analyze_idea_with_report(session: AsyncSession, idea_profile: IdeaProfile) -> dict:
    """
    Skeleton: fetch core dimensions, do RAG per dimension with playbooks, and return structured output.
    """
    # load dimensions
    dims = (await session.execute(select(Dimension))).scalars().all()
    dimension_reports = []

    for dim in dims:
        chunks = await search_report(
            session,
            f"{dim.key} assessment for idea: sector={idea_profile.sector}, problem={idea_profile.problem}, solution={idea_profile.solution}",
            top_k=3,
        )
        playbook = (
            await session.execute(
                select(DimensionPlaybook).where(DimensionPlaybook.dimension_key == dim.key)
            )
        ).scalar_one_or_none()

        prompt = f"""You are evaluating a business idea using a methodology from a PDF report.
Dimension: {dim.key} - {dim.name}
Idea profile: {idea_profile.json()}
Playbook: {playbook.playbook_json if playbook else {}}
Top report excerpts:
{[c.text for c in chunks]}

Provide a short diagnosis, 3-5 recommended actions, 2-3 risks, and a score 0-10 grounded in the report.
"""
        _ = await call_llm(prompt)

        dimension_reports.append(
            {
                "dimension": dim.key,
                "score": None,  # fill from LLM response
                "diagnosis": None,
                "recommended_actions": [],
                "risks": [],
            }
        )

    return {
        "idea_profile": idea_profile,
        "summary": "Overall assessment (fill from LLM response).",
        "next_steps": [],
        "dimension_reports": dimension_reports,
    }
