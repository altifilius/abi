# Progress

- Working: glassmorphic dashboard with quick actions; AI Coach chat + 1-pager generation now routed through FastAPI/OpenAI (gpt-4.1); Fund Matcher hits backend (gpt-4.1-mini) with JSON schema enforcement; document checklist with upload slots and status counts; incorporation roadmap checklist with progress bar; localStorage persistence for description, matches, and document statuses.
- Gaps/risks: chat/fund responses are non-streaming; fund catalog is small and heuristic scoring untested; uploads stored only in memory; need proxy/config clarity between Vite dev and backend; zero automated tests.
- Recent decisions: move AI off the frontend to backend-only OpenAI; keep static constants for funds/incorporation steps; rely on Tailwind CDN theme instead of build-time pipeline.
