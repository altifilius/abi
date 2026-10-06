"""
Offline ingestion script: extract PDF text, chunk, embed, and store chunks/playbooks.
"""

import asyncio
import json
import logging
import uuid
from pathlib import Path

import pdfplumber
from openai import OpenAIError
from pydantic import ValidationError
from sqlalchemy import insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from .db import AsyncSessionLocal, init_db
from .models import Dimension, DimensionPlaybook, ReportChunk
from .schemas import DimensionPlaybookData
from .services import call_llm, embed_text, search_report
from .settings import settings

logger = logging.getLogger(__name__)

def chunk_text(page_text: str, page_num: int, chunk_size: int = 1200) -> list[dict]:
    words = page_text.split()
    chunks = []
    buf = []
    for word in words:
        buf.append(word)
        if len(buf) >= chunk_size:
            chunks.append(" ".join(buf))
            buf = []
    if buf:
        chunks.append(" ".join(buf))
    return [
        {
            "id": str(uuid.uuid4()),
            "page": page_num,
            "chunk_index": idx,
            "section_title": None,
            "text": text,
        }
        for idx, text in enumerate(chunks)
        if text.strip()
    ]


async def extract_chunks(pdf_path: Path) -> list[dict]:
    chunks: list[dict] = []
    with pdfplumber.open(pdf_path) as pdf:
        for idx, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            chunks.extend(chunk_text(text, idx))
    return chunks


async def store_chunks(session: AsyncSession, chunks: list[dict], report_id: str) -> None:
    texts = [c["text"] for c in chunks]
    embeddings = await embed_text(texts)

    for chunk, embedding in zip(chunks, embeddings, strict=True):
        stmt = (
            insert(ReportChunk)
            .values(
                id=chunk["id"],
                report_id=report_id,
                page=chunk["page"],
                chunk_index=chunk["chunk_index"],
                section_title=chunk["section_title"],
                text=chunk["text"],
                embedding=embedding,
            )
            .on_conflict_do_update(
                constraint="uq_chunk_report_page_idx",
                set_={
                    "section_title": chunk["section_title"],
                    "text": chunk["text"],
                    "embedding": embedding,
                },
            )
        )
        await session.execute(stmt)
    await session.commit()


async def build_dimensions(session: AsyncSession) -> list[Dimension]:
    # Canonical dimensions for R&D grant and business model analysis
    default_dims = [
        {"key": "market", "name": "Market", "description": "Market sizing and demand."},
        {"key": "team", "name": "Team", "description": "Team experience and capability."},
        {"key": "product", "name": "Product", "description": "Problem-solution fit and delivery."},
        {"key": "finance", "name": "Finance", "description": "Revenue model and unit economics."},
    ]
    for d in default_dims:
        stmt = (
            insert(Dimension)
            .values(**d)
            .on_conflict_do_nothing(index_elements=["key"])
        )
        await session.execute(stmt)
    await session.commit()
    result = await session.execute(select(Dimension))
    return list(result.scalars().all())


async def build_playbooks(session: AsyncSession, dims: list[Dimension], report_id: str) -> None:
    schema = {
        "name": "dimension_playbook",
        "schema": {
            "type": "object",
            "properties": {
                "dimension": {"type": "string"},
                "key_questions": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "common_mistakes": {
                    "type": "array",
                    "items": {"type": "string"},
                },
                "recommended_actions_by_stage": {
                    "type": "object",
                    "properties": {
                        "idea": {"type": "array", "items": {"type": "string"}},
                        "mvp": {"type": "array", "items": {"type": "string"}},
                        "scale": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["idea", "mvp", "scale"],
                    "additionalProperties": False,
                },
            },
            "required": [
                "dimension",
                "key_questions",
                "common_mistakes",
                "recommended_actions_by_stage",
            ],
            "additionalProperties": False,
        },
    }

    for dim in dims:
        context_chunks = await search_report(
            session,
            f"{dim.name} {dim.description}",
            top_k=3,
            report_id=report_id,
        )
        excerpts = [c.text for c in context_chunks if c.text]

        messages = [
            {
                "role": "system",
                "content": (
                    "You are an expert startup advisor for grants and acceleration programs. "
                    "Synthesize a practical dimension playbook grounded in the provided report excerpts. "
                    "Return valid JSON strictly matching the requested schema."
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
                        "report_excerpts": excerpts,
                    }
                ),
            },
        ]

        try:
            resp = await call_llm(
                messages,
                response_format="json_schema",
                json_schema=schema,
                model=settings.openai_idea_model,
            )
            if isinstance(resp, dict):
                playbook_data = DimensionPlaybookData.model_validate(resp)
            else:
                playbook_data = DimensionPlaybookData(dimension=dim.key)
        except (ValidationError, OpenAIError, ValueError, KeyError) as exc:
            logger.warning("Playbook generation failed for '%s', using defaults: %s", dim.key, exc)
            playbook_data = DimensionPlaybookData(dimension=dim.key)

        stmt = (
            insert(DimensionPlaybook)
            .values(
                dimension_key=dim.key,
                playbook_json=playbook_data.model_dump(),
            )
            .on_conflict_do_update(
                constraint="uq_dimension_key",
                set_={"playbook_json": playbook_data.model_dump()},
            )
        )
        await session.execute(stmt)
    await session.commit()

async def ingest(pdf_path: Path, report_id: str):
    await init_db()
    chunks = await extract_chunks(pdf_path)

    async with AsyncSessionLocal() as session:
        await store_chunks(session, chunks, report_id)
        dims = await build_dimensions(session)
        await build_playbooks(session, dims, report_id)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Ingest a PDF report into the database.")
    parser.add_argument("pdf_path", type=Path, help="Path to PDF report")
    parser.add_argument("--report-id", type=str, default=None, help="Identifier for this report")
    args = parser.parse_args()

    from .settings import settings

    asyncio.run(ingest(args.pdf_path, args.report_id or settings.default_report_id))
