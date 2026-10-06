# System Patterns

- Architecture: Single-page React app (no router) with top-level state in `App.tsx`. Navigation is tab-based via `Layout`, rendering feature components conditionally.
- Data model: `Project` object holds description, stage, documents, and fund matches. Static seeds live in `constants.ts` (funds, incorporation steps, avatar). Types centralized in `types.ts`.
- AI integration: frontend `services/api.ts` calls FastAPI endpoints (`/api/idea-chat`, `/api/fund-matcher`). `/api/idea-chat` supports streaming responses; `IdeaAgent` renders partials and falls back to non-streaming on failure. Backend wraps OpenAI (gpt-4.1 for chat/1-pager, gpt-4.1-mini for fund scoring with JSON schema enforcement).
- UI patterns: locally compiled Tailwind CSS with theme tokens in `styles.css`; “glass” cards, gradient accents, and iconography from `lucide-react`. Runtime CDN scripts and remote avatar requests are intentionally avoided.
- State handling: React state with localStorage persistence via `services/persistence.ts` for description, fund matches, and document statuses; file uploads still exist only as in-memory `File` objects.
- Build/runtime: Bun is the sole JavaScript package manager. Vite binds to loopback and proxies `/api`; production-style builds are served by FastAPI from `dist/`.
