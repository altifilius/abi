# Active Context

- Snapshot: SPA with React 19 + Vite; OpenAI calls now run through the FastAPI backend (`/api/idea-chat`, `/api/fund-matcher`) instead of the browser. Single-project state kept in `App.tsx`; localStorage persistence keeps description, matches, and document statuses.
- Current assumptions: API key lives only on the backend (`OPENAI_API_KEY` in `backend/.env`); frontend talks to backend via HTTP API; fund programs and incorporation steps remain static constants shared with the UI.
- Immediate next steps:
  - Add streaming or incremental UI updates for idea chat if needed; improve error surfacing from backend failures.
  - Expand data realism: richer fund catalog with criteria, budget/support ranges, and conditional logic to improve match rationales.
  - UX polish: clearer CTA to run matcher after 1-pager generation, doc upload previews, refined skeleton/loading states.
  - Observability/QA: logging/sanitization of AI prompts/responses and unit tests for scoring/parsing helpers.
- Open questions: target devices (desktop-first vs mobile support)? desired export formats for the 1-pager? proxy strategy between Vite dev server and FastAPI (currently via configurable API base).
