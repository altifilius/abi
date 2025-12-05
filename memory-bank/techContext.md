# Tech Context

- Stack: React 19 + TypeScript on Vite 6; Tailwind via CDN (no PostCSS build); icons from `lucide-react`; Google GenAI SDK (`@google/genai`).
- Environment: set `GEMINI_API_KEY` in `.env.local`. Vite defines both `process.env.API_KEY` and `process.env.GEMINI_API_KEY` for client use. Frontend-only—key is exposed to the browser.
- Entry points: `index.html` with import map for CDN hosting, `index.tsx` bootstraps `App`. Styling theme declared inline in `index.html`.
- Commands: `npm install`, `npm run dev`, `npm run build`, `npm run preview`. No lint/test tooling configured.
- TypeScript: `moduleResolution: bundler`, `jsx: react-jsx`, `allowJs: true`, `skipLibCheck: true`, decorators enabled though unused.
- Assets: avatar `./altafilius1.png` referenced via constant; static metadata in `metadata.json` for AI Studio.
