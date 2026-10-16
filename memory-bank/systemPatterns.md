# System Patterns

- Architecture: React Router owns permanent workspace/project/application URLs. `App.tsx` retains the shell and session scope; feature screens load with `React.lazy` and scope-keyed Suspense boundaries.
- Persistence: authenticated FastAPI routes use PostgreSQL/pgvector through SQLAlchemy. Alembic owns schema migration through `0004_task_context`; startup only checks the revision.
- Boundaries: workspace roles and Free/Pro limits are enforced server-side; edits use revision checks and navigation guards. Private files stay outside the webroot; client storage holds browser preferences, not authoritative project records.
- AI/source handling: explicit local/external workspace policy, source-versioned official call definitions, human source/application review and revision-bound exports. No silent provider fallback or automatic portal submission.
- Integration target: `/home/emre/Projects/abi`, branch `upgrade/menu-workspace-execution`; `upgrade/workspace-build` is the published foundation, not the active runtime copy.
- Diagnostics: notification history includes account-owned SMTP delivery state; workspace overview exposes actor/detail evidence and can load the latest 100 audit events.
