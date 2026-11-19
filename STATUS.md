# Project status

*15 November 2026. Commit at time of writing: see `git log -1`.*

## Completion: 81%

This is completion **as a shippable product**, not lines written. The code for every requested feature exists; the gap is mostly independent verification, distribution polish, and the live-model path.

| Area | Complete | Why not 100% |
| --- | --- | --- |
| Extension shell, chat, streaming | 95% | Never loaded in Chrome here; live provider calls not exercised |
| Provider registry and free paths | 90% | Four transports implemented; only structure is tested |
| Page capture and extraction | 90% | Heuristic extractor written; no real-page comparison run |
| Prompt library (search, deploy, dedupe) | 95% | Fully unit-tested; UI not clicked through |
| Importers (Keep, Google, files) | 85% | Parsers tested; Drive OAuth and real Google sessions untested |
| Remote skills collections | 90% | Live GitHub zip/archive/markdown imports verified; modal not viewed |
| Investigation agent backend | 80% | Loop/tools/cache built and tested offline; no live LLM or search run |
| Agent preview UI | 85% | Builds and streams; not interacted with in a browser |
| Eval harness | 85% | 20 questions and scoring tested; **no baseline score exists** |
| Documentation | 90% | README, AGENT, ARCHITECTURE, this file |
| Distribution and CI | 50% | GitHub Actions CI added; no release, store listing, screenshots, or version tags |
| Independent verification | 60% | Strong unit/build coverage; weak browser and live-service coverage |

Rough weighting: 30% extension, 30% agent, 10% imports, 10% eval, 5% docs, 5% distribution, 10% verification → **81%**.

## Repository statistics

- **72 tracked files** after this commit: 57 source files (17 JS, 36 TS, 3 TSX, 1 MJS), 1 HTML, 2 CSS, 4 JSON, 5 Markdown, plus LICENSE, `.gitignore`, `.env.example`.
- **~9,150 lines of code**; ~760 lines of tests = **8.3% test-to-code ratio** by line.
- Extension source: **5,059 lines** across `src/` + `background.js`.
- Agent: **3,571 lines** across `app/` + `lib/` + `eval/`.
- Documentation: **~10,000 words** across README, AGENT, ARCHITECTURE, STATUS, PROJECT_PROMPT.
- **4 runtime dependencies** (Next, React, React DOM, Zod), **5 dev dependencies** (TypeScript, types, tsx).
- Scope counts: **15 LLM providers**, **35 starter prompts**, **6 retrieval tools**, **3 model roles**, **20 eval questions**, **7 SSE event types**, **2 Mermaid diagrams**, **1 API route + 1 preview page**.

## Ratios worth knowing

- Extension code vs agent code: **1.4 : 1**.
- Tests vs source by line: **1 : 12**.
- Dependencies vs source files: **9 : 57**.
- Docs vs code by line: roughly **1 : 12** (docs are wordier than they are long).
- Of the 15 providers, **3 are free with no key** (Chrome built-in, Ollama, LM Studio) and **4 have free tiers**.

## Verification ledger

Passing now:

- `npm test` — 38 extension checks.
- `npm run check` — syntax-checks all 17 JS files.
- `npx tsc --noEmit` — strict TypeScript passes.
- Agent tests — 14/14 on Node 22.23.5 (12 on Node 20 because `node:sqlite` does not exist there).
- `eval/run.ts --dry-run` — 20 valid questions, 20 unique IDs.
- `npx next build` — succeeds; `ƒ /api/investigate` route present.
- CI — `.github/workflows/ci.yml` runs the checks above, including `next build`, on Node 22 (`.nvmrc`, `engines.node >=22.5.0`); the same commands pass locally.
- Earlier live checks: SSE stream without keys produced status/plan/gaps/no-evidence result and `done`; invalid body returned 400; a real GitHub collection imported 11 prompts from 2 files through the archive fallback; zip and raw-markdown URLs parsed.

Not verified:

- Extension never loaded in Chrome/Edge; no click-through of panel, settings, importers, or the Skills URL preview.
- No live LLM request (`FEATHERLESS_API_KEY` unset); no live web search (`SEARXNG_URL` unset); no GitHub token.
- The 20-question eval has never produced a baseline score.
- Google Keep/Docs/Drive imports have not run against a real account.
- The preview page has not been clicked through.

## Environment caveat

The default `node` on this machine is **v20.20.0**, which cannot load `node:sqlite`. The agent requires **Node 22.5+**. All agent checks above were run with `npx node@22`. Set a Node 22+ runtime before `npm run dev` or the agent tests.

## What remains, in order

1. Load the extension in Chrome, click through chat, capture, library, each importer, and the Skills URL preview.
2. Add `FEATHERLESS_API_KEY` and `SEARXNG_URL`, run `npm run eval`, record the baseline, then tune prompts against it.
3. Decide the agent's deployment/auth story; the route currently has neither.
4. Add a version tag once CI is green on `main`.
5. Verify Google Drive with a real OAuth client and a test document.
