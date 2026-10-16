# Active Context

- Canonical source, build and runtime: `/home/emre/Projects/abi`, branch `upgrade/menu-workspace-execution`. Do not continue development in the older `abi-upgrade` copy.
- The workspace upgrade was published as `301b0cc` on `upgrade/workspace-build` and pulled into this branch. Newer project-centered menus, lazy-loaded screens, account recovery and `0004_task_context` schema are retained.
- Runtime: React 19/Vite with routed workspace/project pages, FastAPI on loopback port 8001, PostgreSQL/pgvector, private file storage, local OCR and explicitly configured AI policy. Python environment: `.venv-menu`.
- Commands from this directory: `make dev`, `bun run check`, `ruff check backend`; run PostgreSQL behavior tests only with an explicitly separate migrated test database.
- Keep existing `.env` files, private documents and database data outside Git. Do not downgrade the live database to the older upgrade schema.
- Checkout, prices, paid credits and OCR quotas remain deferred; manual Pro/credit grants are not payment.
