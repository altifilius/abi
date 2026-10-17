# Tech Context

- Stack: React 19, TypeScript, React Router, Vite 7, built Tailwind 4, Tiptap 3 rich editing, FastAPI, Python 3.12, PostgreSQL/pgvector and Alembic (`0005_project_studio`). Bun is the JS package manager; Python uses `.venv-menu`.
- Canonical working directory: `/home/emre/Projects/abi`. Run `make install`, `make migrate`, `bun run build`, `make dev`; production build and API use loopback port 8001. `make dev-frontend` uses port 3000 with the API proxy.
- Configuration: `backend/.env` contains server-only DB/AI/SMTP settings. Existing local secrets, `var/` private documents/OCR files and generated `dist/` stay outside Git.
- Checks: `bun run check`, `ruff check backend`, `.venv-menu/bin/python -m unittest discover -s backend/tests -v`. Set `ABI_TEST_DATABASE_URL` only to a separate migrated test database for transaction tests.
- Ingestion and OCR are local/configuration-bound; AI provider/model URLs are explicit. No client AI keys, no automatic OpenRouter inference and no schema creation at application startup.
- `abi.service`, `abi-worker.service` and `abi-source-watch.service` target this directory and `.venv-menu`. On this machine the reminder and daily source-watch units are installed/enabled in user systemd; the web process is separately managed. Existing database/mail containers and local AI have independent lifecycle/restart settings.
