# Tech Context

- Stack: React 19 + TypeScript on Vite 7 with Tailwind 4 compiled by the Vite plugin; backend FastAPI with OpenAI (`AsyncOpenAI`) handling chat and fund matching.
- Environment: set `OPENAI_API_KEY` and database settings in `backend/.env`; frontend settings belong in `.env.local`. `VITE_API_BASE` defaults to same-origin `/api`.
- Entry points: `index.tsx` imports `styles.css` and bootstraps `App`; FastAPI serves `dist/` when present.
- Commands: `bun install`, `bun run dev`, `bun run check`; backend tests use `python -m unittest discover -s backend/tests`.
- Security defaults: explicit CORS origins, loopback-only hosts, bounded request models, no-store API responses, security headers, and no runtime third-party scripts. Authentication is not implemented.
- Assets: the avatar is served locally from `public/abi-avatar.svg`.
