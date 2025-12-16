# Tech Context

- Stack: React 19 + TypeScript on Vite 6; Tailwind via CDN (no PostCSS build); icons from `lucide-react`; backend FastAPI with OpenAI (`AsyncOpenAI`) handling chat and fund matcher.
- Environment: set `OPENAI_API_KEY` (and optional model/base overrides) in `backend/.env`; frontend can point to the API via `VITE_API_BASE` (defaults to `/api`). Keys are no longer exposed client-side.
- Entry points: `index.html` with import map for CDN hosting, `index.tsx` bootstraps `App`. Styling theme declared inline in `index.html`.
- Commands: `npm install`, `npm run dev`, `npm run build`, `npm run preview`. No lint/test tooling configured.
- TypeScript: `moduleResolution: bundler`, `jsx: react-jsx`, `allowJs`: true, `skipLibCheck`: true, decorators enabled though unused.
- Assets: avatar `./altafilius1.png` referenced via constant; static metadata in `metadata.json` for AI Studio.
