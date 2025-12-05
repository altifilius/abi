# System Patterns

- Architecture: Single-page React app (no router) with top-level state in `App.tsx`. Navigation is tab-based via `Layout`, rendering feature components conditionally.
- Data model: `Project` object holds description, stage, documents, and fund matches. Static seeds live in `constants.ts` (funds, incorporation steps, avatar). Types centralized in `types.ts`.
- AI integration: `services/geminiService.ts` wraps Google GenAI SDK. `IdeaAgent` opens a chat session for conversational turns and 1-pager generation; `FundMatcher` sends a structured prompt with a JSON schema for eligibility scoring and rationales.
- UI patterns: Tailwind via CDN with extended theme defined inline in `index.html`; “glass” cards, gradient accents, and iconography from `lucide-react`. Reusable status chips and checklist rows used across dashboard, documents, and incorporation guide.
- State handling: transient React state only—file uploads stored as `File` objects in memory, analysis results kept on the project, no persistence or backend API.
- Build/runtime: Vite 6 config injects `GEMINI_API_KEY` as `process.env.API_KEY`. Import map in `index.html` targets CDN modules for AI Studio hosting while npm deps cover local dev.
