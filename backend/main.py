import os
import asyncio

from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_session, init_db
from .schemas import IdeaRequest, AnalyzeIdeaResponse
from .services import normalize_idea, analyze_idea_with_report

app = FastAPI(title="PDF-grounded Idea Advisor")


@app.on_event("startup")
async def on_startup():
    # Ensure extension/tables exist (in production prefer Alembic).
    await init_db()


@app.post("/analyze-idea", response_model=AnalyzeIdeaResponse)
async def analyze_idea(payload: IdeaRequest, session: AsyncSession = Depends(get_session)):
    try:
        idea_profile = await normalize_idea(
            payload.idea_text,
            {"stage": payload.stage, "sector": payload.sector, "budget": payload.budget},
        )
        analysis = await analyze_idea_with_report(session, idea_profile)
        return analysis
    except NotImplementedError as e:
        # OpenAI calls are stubbed; surface a friendly error for now.
        raise HTTPException(status_code=501, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Analysis failed") from e


def run():
    import uvicorn

    uvicorn.run("backend.main:app", host="0.0.0.0", port=int(os.getenv("PORT", 8000)), reload=True)


if __name__ == "__main__":
    asyncio.run(on_startup())
    run()
