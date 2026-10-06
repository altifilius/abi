# Abi

AI-assisted grant matching, project drafting, and incorporation guidance for
Turkish SMEs and startups.

## Current scope

Abi is a single-project prototype:

- The React interface stores the project description, fund matches, and document
  checklist metadata in browser `localStorage`.
- FastAPI keeps OpenAI credentials on the server and exposes idea-chat and fund
  matching endpoints.
- PostgreSQL with pgvector supports optional report ingestion and grounded idea
  analysis.
- Uploaded document contents remain in browser memory; the backend does not
  receive or persist them.

Authentication, multi-user isolation, real grant submission, template filling,
encryption at rest, and audit logging are not implemented.

## Security boundary

The development servers bind to `127.0.0.1` by default. Do not expose this
prototype directly to the internet. A public deployment requires authentication,
TLS, request-rate controls, and an authenticated reverse proxy.

Project text in `localStorage` is not encrypted. Use a dedicated browser profile
for sensitive material and clear site data when finished. API keys belong only in
`backend/.env`; never put secrets in `VITE_*` variables.

The backend enforces explicit CORS origins, request-size and schema limits,
no-store API responses, and browser security headers. The frontend build uses
repository-locked dependencies rather than runtime CDN scripts.

## Prerequisites

- Bun 1.4+
- Python 3.11+
- PostgreSQL with pgvector for report ingestion and `/analyze-idea`
- An OpenAI-compatible API key

## Setup

Install the frontend:

```bash
bun install --frozen-lockfile
cp .env.example .env.local
```

Install the backend:

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
```

Set `OPENAI_API_KEY` and `DATABASE_URL` in `backend/.env`.

Run the backend and frontend in separate terminals:

```bash
make dev-backend
make dev-frontend
```

The frontend listens on `http://127.0.0.1:3000`; Vite proxies `/api` to
`http://127.0.0.1:8000`.

## Production-style local build

```bash
bun run build
RELOAD=false make dev-backend
```

FastAPI serves `dist/` when a frontend build exists. Keep frontend API requests
same-origin in deployments.

## API

- `POST /api/idea-chat` — AI Coach chat and project-summary generation.
- `POST /api/fund-matcher` — structured grant matching.
- `POST /analyze-idea` — optional PostgreSQL/pgvector-grounded analysis.

## Report ingestion

PDFs are local inputs and are intentionally not committed:

```bash
make -C backend migrate
make -C backend ingest PDF=/absolute/path/report.pdf REPORT_ID=demo-report
```

## Verification

Run all verification gates:

```bash
make check
uvx pip-audit -r backend/requirements.txt
uvx bandit -r backend -x backend/tests
```

Individual checks:

```bash
bun run check     # Biome lint, TypeScript, Bun unit tests, production build
make test         # Frontend unit tests and Python backend tests
make lint         # Biome check and Ruff backend lint
```
