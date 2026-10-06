# Active Context

- Snapshot: SPA with React 19 + Vite and locally built Tailwind CSS; OpenAI calls run through the FastAPI backend (`/api/idea-chat`, `/api/fund-matcher`). Single-project state remains in `App.tsx` and browser `localStorage`.
- Security boundary: backend secrets never reach the client; both development servers bind to loopback by default; CORS is an explicit allowlist; request schemas and body sizes are bounded. The prototype still has no authentication or multi-user isolation and must not be exposed directly to the internet.
- Immediate next steps:
  - Streaming chat is available with fallback to non-streaming; consider polishing partial rendering UX further.
  - Expand data realism: richer fund catalog with criteria, budget/support ranges, and conditional logic to improve match rationales.
  - UX polish: clearer CTA to run matcher after 1-pager generation, doc upload previews, refined skeleton/loading states.
  - Observability/QA: logging/sanitization of AI prompts/responses and unit tests for scoring/parsing helpers.
- Open questions: target devices (desktop-first vs mobile support)? desired export formats for the 1-pager?
