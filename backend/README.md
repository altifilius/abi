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
- `OPENAI_EMBEDDING_MODEL` (default `text-embedding-3-large`)
- `DEFAULT_REPORT_ID`

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
- Dev: run `npm run dev` (frontend on 3000) and `make dev` (backend on 8000 by default). Vite proxies `/api` to the backend; override backend port with `PORT=8001 make dev` if 8000 is busy.
- Prod/preview: run `npm run build` in repo root; FastAPI will serve `dist/` and `/api` on the backend port (default 8000).
