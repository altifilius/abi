# Tech Context

- Stack: React 19, TypeScript, React Router, Vite 7, built Tailwind 4, FastAPI, Python 3.12, PostgreSQL/pgvector and Alembic. Bun is the JS package manager; Python uses `.venv-menu`.
- Canonical working directory: `/home/emre/Projects/abi`. Run `make install`, `make migrate`, `bun run build`, `make dev`; production build and API use loopback port 8001. `make dev-frontend` uses port 3000 with the API proxy.
- Configuration: `backend/.env` contains server-only DB/AI/SMTP settings. Existing local secrets, `var/` private documents/OCR files and generated `dist/` stay outside Git.
- Checks: `bun run check`, `ruff check backend`, `.venv-menu/bin/python -m unittest discover -s backend/tests -v`. Set `ABI_TEST_DATABASE_URL` only to a separate migrated test database for transaction tests.
- Ingestion and OCR are local/configuration-bound; AI provider/model URLs are explicit. No client AI keys, no automatic OpenRouter inference and no schema creation at application startup.
- `abi.service` and `abi-worker.service` target this directory and `.venv-menu`; services are templates unless explicitly installed.
