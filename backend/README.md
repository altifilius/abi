# Backend Setup (FastAPI + Postgres + pgvector)

## 1) Install dependencies
```bash
pip install -r backend/requirements.txt
```

## 2) Environment
Copy the sample and fill in secrets/URLs:
```bash
cp backend/.env.example backend/.env
```
Key vars:
- `DATABASE_URL` (postgresql+asyncpg://user:pass@host:port/db)
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL` (optional)
- `OPENAI_CHAT_MODEL` (default `gpt-oss-120b`)
- `OPENAI_IDEA_MODEL` (default `gpt-4.1`)
- `OPENAI_FUND_MODEL` (default `gpt-4.1-mini`)
- `OPENAI_EMBEDDING_MODEL` (default `text-embedding-3-large`)
- `DEFAULT_REPORT_ID`
- `HOST` (default `127.0.0.1`; keep loopback-only during development)
- `PORT` (default `8000`)
- `RELOAD` (default `false` for direct `python -m backend.main` runs)
- `CORS_ORIGINS` (comma-separated explicit frontend origins; wildcard is rejected)
- `MAX_REQUEST_BYTES` (default `262144`)

The API has no user authentication. Do not bind it to a public interface without
an authenticated, TLS-terminating reverse proxy and rate controls.

## 3) Database migration (Alembic)
From repo root:
```bash
cd backend
alembic -c alembic.ini upgrade head
# or
make migrate
```
This creates the `vector` extension and tables: `report_chunks`, `dimensions`, `dimension_playbooks`.

## 4) Ingest a report PDF
Provide a PDF path and report id:
```bash
cd backend
make ingest PDF=/path/to/report.pdf REPORT_ID=demo-report-1
# or direct
python -m backend.ingest_report /path/to/report.pdf --report-id demo-report-1
```
Ingestion is idempotent per `(report_id, page, chunk_index)`.

## 5) Run the API
```bash
cd backend
make dev
# or
uvicorn backend.main:app --reload
```

## API endpoints
- `POST /api/idea-chat` — chat/summary responses for the AI Coach (model: gpt-4.1).
- `POST /api/fund-matcher` — JSON-scored eligibility results for provided project description (model: gpt-4.1-mini).

## 6) Test /analyze-idea
Example request:
```bash
curl -X POST http://localhost:8000/analyze-idea \
  -H "Content-Type: application/json" \
  -d '{
    "idea_text": "A B2B SaaS for predictive maintenance in manufacturing.",
    "stage": "idea",
    "sector": "manufacturing",
    "budget": "100k EUR"
  }'
```
Expected response keys: `idea_profile`, `summary`, `next_steps`, `dimension_reports` (each with `dimension`, `score`, `diagnosis`, `recommended_actions`, `risks`, `notes`).

## Frontend serving
- Dev: run `bun run dev` (frontend on `127.0.0.1:3000`) and `make dev`
  (backend on `127.0.0.1:8000` by default). Vite proxies `/api` to the backend.
- Local production-style run: execute `bun run build` in the repository root,
  then start FastAPI. The backend serves `dist/` and `/api` on one origin.
