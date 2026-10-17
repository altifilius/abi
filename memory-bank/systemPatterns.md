# System Patterns

- Architecture: React Router owns permanent workspace/project/application URLs. `App.tsx` retains the shell and session scope; feature screens load with `React.lazy` and scope-keyed Suspense boundaries.
- Persistence: authenticated FastAPI routes use PostgreSQL/pgvector through SQLAlchemy. Alembic owns schema migration through `0005_project_studio`; startup only checks the revision. Project reports/messages and funding selections are independent CAS-protected records; old descriptions/applications are retained.
- Boundaries: workspace roles and Free/Pro limits are enforced server-side; edits use revision checks and navigation guards. Private files stay outside the webroot; client storage holds browser preferences, not authoritative project records.
- AI/source handling: explicit local/external workspace policy, source-versioned official call definitions, human source/application review and revision-bound exports. No silent provider fallback or automatic portal submission.
- Integration target: `/home/emre/Projects/abi`, branch `upgrade/menu-workspace-execution`; `upgrade/workspace-build` is the published foundation, not the active runtime copy.
- Diagnostics: account notifications include mail-delivery history; workspace settings contain activity with actor/details. These are contextual tools, not extra primary menus.
- Rich documents are validated Tiptap JSON with bounded allowlisted nodes/marks; no user HTML. Unicode DOCX/PDF preserves headings, lists, links, tables/spans and long-row pagination. Manual saves and AI applications share aggregate report validation.
- Report chats expose draft prose, source/target/base-revision metadata and natural named-section targeting. Only explicit user apply commands can copy stored drafts into saved sections; ambiguous/invalid/stale results cannot write or consume allowance.
