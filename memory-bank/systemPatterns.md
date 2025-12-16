# System Patterns

- Architecture: Single-page React app (no router) with top-level state in `App.tsx`. Navigation is tab-based via `Layout`, rendering feature components conditionally.
- Data model: `Project` object holds description, stage, documents, and fund matches. Static seeds live in `constants.ts` (funds, incorporation steps, avatar). Types centralized in `types.ts`.
- AI integration: frontend `services/api.ts` calls FastAPI endpoints (`/api/idea-chat`, `/api/fund-matcher`). Backend wraps OpenAI (gpt-4.1 for chat/1-pager, gpt-4.1-mini for fund scoring with JSON schema enforcement).
- UI patterns: Tailwind via CDN with extended theme defined inline in `index.html`; “glass” cards, gradient accents, and iconography from `lucide-react`. Reusable status chips and checklist rows used across dashboard, documents, and incorporation guide.
- State handling: React state with localStorage persistence via `services/persistence.ts` for description, fund matches, and document statuses; file uploads still stored as `File` objects in memory.
- Build/runtime: Vite 6 config is minimal (no client-side API keys). Import map in `index.html` targets CDN modules (React, lucide) for AI Studio hosting while npm deps cover local dev.
