# Active Context

- Snapshot: Initial capture after repository review. SPA with React 19 + Vite; Gemini-powered chat/analysis wired directly from the frontend. Single-project state kept in `App.tsx`; UI tabs for dashboard, AI coach, fund matcher, documents, and incorporation.
- Current assumptions: API key injected at build via `GEMINI_API_KEY`; running fully client-side; fund programs and incorporation steps are static constants; no persistence beyond in-memory React state.
- Immediate next steps:
  - Harden Gemini flows: visible errors for missing/failed API key, guardrails around empty descriptions, and offline/test-mode fallbacks.
  - Expand data realism: richer fund catalog with criteria, budget/support ranges, and conditional logic to improve match rationales.
  - Persistence: cache project description, matches, and document statuses locally (e.g., `localStorage`) so reloads keep progress.
  - UX polish: loading/skeleton states for analysis, clearer CTA to run matcher after 1-pager generation, and doc upload previews.
  - Observability/QA: basic logging of AI prompts/responses (sanitized) and unit tests for scoring/parsing helpers.
- Open questions: acceptable exposure of the Gemini key in the client? target devices (desktop-first vs mobile support)? desired export formats for the 1-pager?
