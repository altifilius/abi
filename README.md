# Abi

Abi is an AI grant copilot for Turkish SMEs and startups. Draft an R&D project 1‑pager with Gemini, get eligibility scores against TÜBİTAK/KOSGEB programs, manage submission documents, and track incorporation steps in one glassmorphic workspace.

## Features
- AI Coach chat that turns a rough idea into a TÜBİTAK/KOSGEB-ready “Project 1-Pager”.
- Fund Matcher that prompts Gemini with a JSON schema to score eligibility and explain rationales for each fund.
- Document Vault with upload slots, statuses, and counts (stored in-memory for now).
- Incorporation guide and compliance calendar tailored to Turkey (A.Ş./Ltd.).
- Dashboard with quick actions, progress ring, notifications, and schedule.

## Tech Stack
- React 19 + TypeScript on Vite 6.
- Tailwind via CDN with a custom theme defined in `index.html`.
- Google GenAI SDK (`@google/genai`) and lucide-react icons.

## Getting Started
1) Install dependencies  
`npm install`

2) Configure Gemini API key (exposed client-side)  
Create `.env.local` with:  
`GEMINI_API_KEY=your_key_here`

3) Run the dev server  
`npm run dev`

Optional: build for production with `npm run build` and preview locally via `npm run preview`.

## Usage Flow
1) Start in the Dashboard to view progress and shortcuts.  
2) Open **AI Coach** to chat about the idea and generate a Project 1-Pager.  
3) Go to **Fund Matcher** to run eligibility analysis and view ranked funds with rationales.  
4) Use **Documents** to upload required files and track status.  
5) Follow **Incorporation** steps and deadlines for company setup.

## Project Structure
- `App.tsx` – top-level state (project, documents, matches) and tab routing.  
- `components/` – UI sections: `Layout`, `Dashboard`, `IdeaAgent`, `FundMatcher`, `DocumentManager`, `IncorporationGuide`.  
- `services/geminiService.ts` – Gemini chat session, 1-pager generation, and fund eligibility analysis (schema-enforced JSON).  
- `constants.ts` – seed funds, incorporation steps, and avatar reference.  
- `types.ts` – shared data models.  
- `index.html` – Tailwind config/theme and CDN import map for AI Studio hosting.  
- `vite.config.ts` – injects `GEMINI_API_KEY` as `process.env.API_KEY` for the client.

## Notes and Limitations
- Frontend-only prototype: no persistence; uploads live in memory until refresh.  
- Gemini key is exposed in the browser; use a client-safe key or proxy in production.  
- Fund catalog is small and heuristic; extend `constants.ts` with richer criteria for better matches.  
- No tests or linting configured yet.***
