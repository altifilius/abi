# Progress

- Workspace foundations: authenticated personal/company workspaces, persisted projects and revisions, source-backed funding, private documents/OCR, reviewed application packages and role/Free/Pro enforcement.
- Current delivery: routed project-centered menus, revision-aware edit/discard guards, lazy-loaded screens, task/application/document links, calendar/ICS, account recovery and dependency readiness. Schema: `0004_task_context`.
- Repository consolidation: published workspace upgrade `301b0cc` is integrated into `upgrade/menu-workspace-execution`; continue all source/build/runtime work in `/home/emre/Projects/abi`.
- Integration checks: frontend lint/typecheck, 23 frontend tests and production build; backend lint and 114 backend tests against a fresh migrated PostgreSQL database passed. Systemd service units validate against the canonical path.
- Runtime proof: canonical port 8001 returns health/readiness 200 with the existing 0004 database; isolated browser signup, project creation, draft save/reload, Unicode PDF/DOCX exports, stay/discard protection and mobile navigation passed. The existing user/project data were not used for write smoke checks.
- Preserved upgrade-only surfaces: Notifications shows personal mail history, verified queued → SMTP accepted/sent through the real local worker; Overview loads the latest 100 workspace audit events with actor UUID and JSON details. Final browser runtime had no JavaScript errors.
- Boundaries: no real checkout or portal submission; selected official calls still require human source review. Worker freshness and external provider delivery are reported separately from process readiness.
