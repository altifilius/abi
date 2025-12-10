"""
Offline ingestion script: extract PDF text, chunk, embed, and store chunks/playbooks.
"""

import asyncio
import hashlib
import uuid
from pathlib import Path
from typing import List

import pdfplumber
from sqlalchemy import insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from .db import AsyncSessionLocal, init_db
from .models import Dimension, DimensionPlaybook, ReportChunk
from .services import call_llm, embed_text


def chunk_text(page_text: str, page_num: int, chunk_size: int = 1200) -> List[dict]:
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


async def extract_chunks(pdf_path: Path) -> List[dict]:
    chunks: List[dict] = []
    with pdfplumber.open(pdf_path) as pdf:
        for idx, page in enumerate(pdf.pages, start=1):
            text = page.extract_text() or ""
            chunks.extend(chunk_text(text, idx))
    return chunks


async def store_chunks(session: AsyncSession, chunks: List[dict], report_id: str) -> None:
    texts = [c["text"] for c in chunks]
    embeddings = await embed_text(texts)

    for chunk, embedding in zip(chunks, embeddings):
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


async def build_dimensions(session: AsyncSession) -> List[Dimension]:
    # Prompt LLM to derive dimensions; stub with defaults.
    default_dims = [
        {"key": "market", "name": "Market", "description": "Market sizing and demand."},
        {"key": "team", "name": "Team", "description": "Team experience and capability."},
        {"key": "product", "name": "Product", "description": "Problem-solution fit and delivery."},
        {"key": "finance", "name": "Finance", "description": "Revenue model and unit economics."},
    ]
    dims = [Dimension(**d) for d in default_dims]
    session.add_all(dims)
    await session.commit()
    return dims


async def build_playbooks(session: AsyncSession, dims: List[Dimension]) -> None:
    for dim in dims:
        prompt = f"Build a playbook JSON for dimension '{dim.key}' based on the report."
        _ = await call_llm(prompt)
        playbook = {
            "dimension": dim.key,
            "key_questions": [],
            "common_mistakes": [],
            "recommended_actions_by_stage": {"idea": [], "mvp": [], "scale": []},
        }
        session.add(DimensionPlaybook(dimension_key=dim.key, playbook_json=playbook))
    await session.commit()


async def ingest(pdf_path: Path, report_id: str):
    await init_db()
    chunks = await extract_chunks(pdf_path)

    async with AsyncSessionLocal() as session:
        await store_chunks(session, chunks, report_id)
        dims = await build_dimensions(session)
        await build_playbooks(session, dims)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Ingest a PDF report into the database.")
    parser.add_argument("pdf_path", type=Path, help="Path to PDF report")
    parser.add_argument("--report-id", type=str, default="default_report", help="Identifier for this report")
    args = parser.parse_args()

    asyncio.run(ingest(args.pdf_path, args.report_id))
