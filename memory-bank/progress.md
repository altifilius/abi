# Progress

- Working: glassmorphic dashboard with quick actions; AI Coach chat + 1-pager generator wired to Gemini; Fund Matcher prompting Gemini with schema and displaying ranked matches; document checklist with upload slots and status counts; incorporation roadmap checklist with progress bar.
- Gaps/risks: no persistence—state resets on reload; Gemini key exposed client-side and not validated in UI; analysis/generation lacks error/empty states; fund catalog is small and heuristic scoring untested; uploads stored only in memory; zero automated tests.
- Recent decisions: stay frontend-only for now; use static constants for funds/incorporation steps; rely on Tailwind CDN theme instead of build-time pipeline.
