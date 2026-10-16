import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .db import engine, init_db
from .settings import settings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await init_db()
    settings.storage_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    yield
    await engine.dispose()


class RequestBodyLimitMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH", "DELETE"}:
            await self.app(scope, receive, send)
            return
        headers = dict(scope.get("headers", []))
        is_upload = headers.get(b"content-type", b"").startswith(b"multipart/form-data") and scope[
            "path"
        ].endswith("/documents")
        max_bytes = settings.max_upload_bytes + 65_536 if is_upload else settings.max_request_bytes
        messages: list[Message] = []
        received = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            if message["type"] != "http.request":
                continue
            received += len(message.get("body", b""))
            if received > max_bytes:
                await JSONResponse(status_code=413, content={"detail": "Request body too large"})(
                    scope, receive, send
                )
                return
            messages.append(message)
            if not message.get("more_body", False):
                break
        index = 0

        async def replay_receive() -> Message:
            nonlocal index
            if index < len(messages):
                message = messages[index]
                index += 1
                return message
            return await receive()

        await self.app(scope, replay_receive, send)


app = FastAPI(
    title="Abi workspace", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None
)
app.add_middleware(RequestBodyLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
)


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, error: RequestValidationError):
    # Never echo submitted passwords, project text, or document content.
    errors = [
        {"field": ".".join(str(part) for part in item["loc"]), "message": item["msg"]}
        for item in error.errors()
    ]
    return JSONResponse(
        status_code=422, content={"detail": "Check the submitted fields", "errors": errors}
    )


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
    )
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    response.headers["Permissions-Policy"] = "camera=(), geolocation=(), microphone=()"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/health")
async def health():
    return {"status": "alive", "service": "abi", "billing": "not_configured"}


# Routers are loaded before the SPA fallback so private API errors stay API errors.
from . import account, ai, applications, collaboration, funding, menu_api, workspaces  # noqa: E402

for router in (
    workspaces.router,
    funding.router,
    applications.router,
    collaboration.router,
    ai.router,
    account.router,
    menu_api.router,
):
    app.include_router(router)


DIST_DIR = Path(__file__).resolve().parent.parent / "dist"
if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def frontend(full_path: str):
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(404, "API route not found")
        candidate = (DIST_DIR / full_path).resolve()
        if candidate.is_relative_to(DIST_DIR) and candidate.is_file():
            return FileResponse(candidate)
        if "." in Path(full_path).name:
            raise HTTPException(404, "Asset not found")
        return FileResponse(DIST_DIR / "index.html")


def run():
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.reload,
        access_log=False,
    )


if __name__ == "__main__":
    run()
