import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAIError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import Response, StreamingResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .db import get_session, init_db
from .schemas import (
    AnalyzeIdeaResponse,
    FundMatcherRequest,
    FundMatcherResponse,
    IdeaChatRequest,
    IdeaChatResponse,
    IdeaRequest,
)
from .services import (
    analyze_idea_with_report,
    normalize_idea,
    run_fund_matcher,
    run_idea_chat,
    run_idea_chat_stream,
)
from .settings import settings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Chat and matching can run without PostgreSQL; report analysis cannot.
    try:
        await init_db()
    except Exception as exc:
        logger.warning("DB init skipped (continuing without DB): %s", exc)
    yield


class RequestBodyLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH"}:
            await self.app(scope, receive, send)
            return

        messages: list[Message] = []
        received = 0
        more_body = True
        while more_body:
            message = await receive()
            messages.append(message)
            if message["type"] != "http.request":
                break

            received += len(message.get("body", b""))
            if received > self.max_bytes:
                response = JSONResponse(
                    status_code=413,
                    content={"detail": "Request body too large"},
                )
                await response(scope, receive, send)
                return
            more_body = message.get("more_body", False)

        message_index = 0

        async def replay_receive() -> Message:
            nonlocal message_index
            if message_index < len(messages):
                message = messages[message_index]
                message_index += 1
                return message
            return await receive()

        await self.app(scope, replay_receive, send)


app = FastAPI(
    title="PDF-grounded Idea Advisor",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

app.add_middleware(
    RequestBodyLimitMiddleware,
    max_bytes=settings.max_request_bytes,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)


def add_security_headers(request: Request, response: Response) -> Response:
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; connect-src 'self'; object-src 'none'; "
        "base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
    )
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    response.headers["Permissions-Policy"] = "camera=(), geolocation=(), microphone=()"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    if request.url.path.startswith("/api/") or request.url.path == "/analyze-idea":
        response.headers["Cache-Control"] = "no-store"
    return response


@app.middleware("http")
async def enforce_request_and_response_security(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > settings.max_request_bytes:
                response = JSONResponse(
                    status_code=413,
                    content={"detail": "Request body too large"},
                )
                return add_security_headers(request, response)
        except ValueError:
            response = JSONResponse(
                status_code=400,
                content={"detail": "Invalid Content-Length header"},
            )
            return add_security_headers(request, response)

    response = await call_next(request)
    return add_security_headers(request, response)


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
        host=settings.host,
        port=settings.port,
        reload=settings.reload,
    )


if __name__ == "__main__":
    run()
