import os
import asyncio
from pathlib import Path

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from starlette.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from openai import OpenAIError

from .db import get_session, init_db
from .schemas import (
    IdeaRequest,
    AnalyzeIdeaResponse,
    IdeaChatRequest,
    IdeaChatResponse,
    FundMatcherRequest,
    FundMatcherResponse,
)
from .services import (
    normalize_idea,
    analyze_idea_with_report,
    run_idea_chat,
    run_fund_matcher,
)

app = FastAPI(title="PDF-grounded Idea Advisor")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    # Ensure extension/tables exist (in production prefer Alembic). Non-fatal if DB is unavailable,
    # so chat/matcher endpoints can still run without Postgres.
    try:
        await init_db()
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("DB init skipped (continuing without DB): %s", exc)


@app.post("/analyze-idea", response_model=AnalyzeIdeaResponse)
async def analyze_idea(
    payload: IdeaRequest, session: AsyncSession = Depends(get_session)
):
    try:
        idea_profile = await normalize_idea(
            payload.idea_text,
            {
                "stage": payload.stage,
                "sector": payload.sector,
                "budget": payload.budget,
            },
        )
        analysis = await analyze_idea_with_report(session, idea_profile)
        return analysis
    except OpenAIError as e:
        raise HTTPException(status_code=502, detail="Upstream LLM error") from e
    except Exception as e:
        raise HTTPException(status_code=500, detail="Analysis failed") from e


@app.post("/api/idea-chat", response_model=IdeaChatResponse)
async def idea_chat(payload: IdeaChatRequest):
    if not payload.messages:
        raise HTTPException(status_code=400, detail="messages are required")
    try:
        # Streaming mode
        if payload.stream:
            iterator = await run_idea_chat_stream(
                [m.model_dump() for m in payload.messages],
                mode=payload.mode,
                language=payload.language,
                project_context=payload.project_context,
            )
            return StreamingResponse(iterator, media_type="text/plain")

        reply = await run_idea_chat(
            [m.model_dump() for m in payload.messages],
            mode=payload.mode,
            language=payload.language,
            project_context=payload.project_context,
        )
        return {"reply": reply}
    except OpenAIError as e:
        raise HTTPException(status_code=502, detail="Upstream LLM error") from e
    except Exception as e:
        raise HTTPException(status_code=500, detail="Idea chat failed") from e


@app.post("/api/fund-matcher", response_model=FundMatcherResponse)
async def fund_matcher(payload: FundMatcherRequest):
    if not payload.description or not payload.description.strip():
        raise HTTPException(status_code=400, detail="description is required")
    try:
        matches = await run_fund_matcher(payload.description)
        return {"matches": matches}
    except OpenAIError as e:
        raise HTTPException(status_code=502, detail="Upstream LLM error") from e
    except Exception as e:
        raise HTTPException(status_code=500, detail="Fund matcher failed") from e

# Serve built frontend (dist) when available
DIST_DIR = Path(__file__).resolve().parent.parent / "dist"
if DIST_DIR.exists():
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="spa-static")

    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        # Avoid swallowing API 404s
        if full_path.startswith("api"):
            raise HTTPException(status_code=404)
        index_file = DIST_DIR / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        raise HTTPException(status_code=404)


def run():
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000)),
        reload=True,
    )


if __name__ == "__main__":
    asyncio.run(on_startup())
    run()
