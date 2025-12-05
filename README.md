# abi: AI-powered grants, funding, incorporation and self business development coach

Purpose
To help organizations, research teams, and startups find and apply for international funding by extracting insights from their project files, aligning applications with institution templates, and providing country-specific incorporation guidance.

What it does (short)

- Idea capture: AI-assisted conversation that converts ideas into a concise project draft (1-pager + assessment).
- Fund matching: Produces a ranked list of suitable international calls/funders with clear justification.
- Eligibility analysis: Applies hard gates and weighted criteria (0–100) with evidence-backed explanations.
- Application generation: Auto-fills institution templates (DOCX/PDF) and flags missing or weak fields.
- Document checklist: Extracts required/optional documents and tracks completion as users upload files.
- Incorporation guidance: Country-aware checklists and early compliance tasks with calendar reminders.

Inputs / Outputs

- Input: Project files (summary, work plan, budget, appendices) or an idea captured via chat.
- System sources: Versioned rule and template sets for funders and institutions (managed internally).
- Output: Eligibility score and rationale, ranked fund matches, missing-documents list, draft application aligned to the selected template, and a downloadable package (report + checklist + calendar items).

Core modules

- Rule Engine (Rule-DSL): Deterministic rules like `eligible_if ...; score = ...` that link decisions to template clauses.
- Fund Matcher: Maps project attributes (domain, TRL, budget, timeline) to suitable calls and ranks them.
- Template Filler: Populates template fields from project data and generates guidance for remaining blanks.
- Document Manager: Identifies required documents, matches uploads, and tracks completion.
- Incorporation Flow: Country-aware task flows and reminders for company formation and early compliance.
- Reporter: Exports DOCX/PDF packages and creates ZIP bundles for submissions.

Main flow (summary)

1. User uploads project files or creates a draft via the AI agent.
2. System extracts features and generates a project profile.
3. Fund Matcher proposes suitable international calls and ranks them.
4. Eligibility Analysis produces a scored assessment with evidence links.
5. Template Filler creates a draft application; Document Manager lists missing items.
6. Incorporation guidance can be enabled to produce country-specific next steps and calendar reminders.

Guiding principles

- Evidence-based: Every recommendation links to the relevant rule or template clause.
- Versioning: Rules and templates are version-controlled; outputs are stamped with `template_version`.
- Privacy & security: Organization-scoped data isolation, encryption, and audit logging.

Phases (brief)

- Phase 1: Core flows — idea capture, fund matching, eligibility scoring, and template filling.
- Phase 2: Expand fund/template library, improve evidence linking, and add more country incorporation flows.

## Getting Started

---

Run locally (Bun)

Prerequisites: Bun (https://bun.sh). Node 18+ also works, but Bun is the default.

1. Install dependencies:

```bash
bun install
```

2. Add any required API keys or environment variables (for example, model or LLM keys) to `.env.local`.
3. Run the app:

```bash
bun run dev
```

If you prefer npm:
```bash
npm install
npm run dev
```

Optional tasks I can help with:

- Add a short `CONTRIBUTING.md` or `QUICKSTART.md`.
- Create a minimal `.env.example` with recommended variables.
- Localize incorporation guidance for target countries.
