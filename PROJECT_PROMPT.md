# Project prompt: LLM Side Panel + evidence-first investigation agent

Build a single repository containing two independent deliverables that share a name, a README, and a testing philosophy:

1. a free-first Manifest V3 browser side panel, and
2. a server-side investigation agent with a strict evidence contract and an eval harness.

The extension must run with no build step and no dependencies. The agent may use Next.js, TypeScript, and Node built-ins. Do not merge the two runtimes.

## Global constraints

- MIT license, no telemetry, no paywall, no account requirement.
- Local-first: keys, prompts, chat history, and tokens live in the browser; imports are parsed locally; no backend for the extension.
- Never commit secrets; provide `.env.example` only.
- Small files, pure modules for parsers and splitters, typed boundaries for the agent.
- Prefer plain, honest failure over silent fallback. Missing evidence must be reported as a gap, not invented.

## Deliverable A — the browser extension

### Packaging

MV3 `manifest.json`, minimum Chrome/Edge 116, module service worker, side panel at `src/sidepanel/panel.html`. Permissions: `sidePanel`, `storage`, `unlimitedStorage`, `scripting`, `activeTab`, `tabs`, `contextMenus`, `clipboardWrite`, `identity`; host permissions `<all_urls>`.

`background.js` only: set `openPanelOnActionClick`, create context menus for page and selection, write a pending-context payload to `chrome.storage.session`, open the panel, and message it. The panel is the runtime.

### Panel

Three tabs: **Chat**, **Prompts**, **Page**. A settings drawer holds provider, model, API key, custom base URL, temperature, system prompt, page-context character limit, free-options chooser, Google OAuth client, library actions, and chat clearing.

State lives in one object: settings, prompts, messages, captured context, tab, streaming, abort controller, library filters. Persist under `llmsp.v2.*` keys in `chrome.storage.local`; use `chrome.storage.session` for the context handoff. On first run, seed a starter pack only if the library is empty.

### Providers

One registry and four transports:

- Chrome built-in Prompt API (Gemini Nano): free, on-device, no key; probe both `LanguageModel` and legacy `ai.languageModel`; handle availability/download progress; cap context at 8,000 characters; destroy the session on abort.
- OpenAI-compatible: SSE with `[DONE]` and non-streaming JSON fallback.
- Anthropic Messages: `anthropic-version` plus `anthropic-dangerous-direct-browser-access`.
- Gemini `streamGenerateContent?alt=sse`.

Ship 15 providers: Chrome built-in, OpenAI, Anthropic, Google Gemini, Mistral, Groq, OpenRouter, DeepSeek, xAI, Together, Perplexity, Cerebras, Ollama, LM Studio, Custom. Mark free/free-tier accurately. Trim history to the last 20 messages. Stream deltas, support stop/retry/copy/delete, and render markdown with a small escaped renderer — no markdown library.

Inject page context only on the most recent context-bearing user message, inside a `<page_context url title>` block, truncated to the configured limit.

### Page capture

`chrome.scripting.executeScript` with a self-contained extractor. Refuse browser-internal schemes. Remove scripts/styles/nav/footers/asides/forms/hidden nodes. Score candidate roots (`article`, `main`, `[role=main]`, article-body classes), fall back to `body` under 400 characters. Serialize headings, lists, code, blockquotes, tables, and image alt text into readable markdown-ish text. Cap at 120,000 characters. Return title, URL, description, site name, author, language, word count, headings, links, media alt text, selection, truncation flag, timestamp.

Context is one-shot; show it as a chip and a preview; support capture from other tabs and from the context menu.

### Prompt library

Normalize prompts to `{id, title, body, tags, collection, source{kind,label,ref,url}, fingerprint, pinned, uses, createdAt, updatedAt, lastUsedAt}`. Fingerprint title + body with djb2; skip duplicates; report added/skipped. Search with weighted scoring (exact title 200, prefix 80, substring 50, tag 35, collection 20, body 15, pinned +25, uses capped at 20), plus collection/tag/source filters and relevance/recent/title/uses sorting. Render 80 at a time.

Deploy prompts by replacing `{{page}}`, `{{page_title}}`, `{{page_url}}`, `{{page_description}}`, `{{selection}}`, `{{date}}`, `{{time}}`; ask for other placeholders in a form; leave empty values visible as `{{placeholder}}`. Increment use counts on deploy/run. Ship 35 starter prompts across page/research, writing, coding, business, study, and utility.

### Importers

- **Google Keep:** no consumer API; read Takeout zips, loose HTML, and Keep-shaped JSON. Parse title, text-content, list content, labels, archived; skip archived; distinguish missing folder from unreadable notes.
- **Google Docs/Sheets/Drive links:** export via `docs.google.com/.../export?format=txt|csv` and `drive.google.com/uc?...` with `credentials: 'include'`; detect sign-in pages; cap 20 links; split each document.
- **Drive OAuth (optional):** user-supplied Web client ID, `chrome.identity.getRedirectURL()` redirect, implicit flow, `drive.readonly`, token cached until expiry; list Docs/text/markdown/JSON, export Docs as text, download others as media.
- **Files:** markdown/text, CSV with header aliases, JSON arrays/`{prompts}`/`{items}`, HTML (Keep note first, then text), zip (Keep first, then skills/markdown).
- **Skills:** parse `SKILL.md` frontmatter (`name`, `description`, optional `allowed-tools`) without a YAML dependency; one prompt per skill, tagged `skill`.
- **Remote collections:** accept GitHub repo URLs, `/tree/<branch>/<folder>`, `/blob/` markdown, any zip URL, and raw markdown URLs. Use the GitHub API tree with the default branch, raw file downloads at concurrency 6, SKILL.md preference, 200-file and 400k-character caps, 20s request and 60s zip timeouts. On 403/429, fall back to the repository archive zip. Preview a checklist of parsed prompts (title + snippet) before adding; allow select none/all; add only checked items.

### Splitting

Modes: auto, single, heading, numbered, delimiter, bullets. Auto tries headings at the smallest level used twice, then numbered items (3+, or 2 explicit `Prompt N:` labels), then `---`/`***`/`===`, then bullets (3+ with 40+ characters), else one prompt. Drop sections under 8 characters.

### Export

JSON (title, body, tags, collection only) and markdown; single prompt download as `.md`. Use a zero-dependency zip reader built on `DecompressionStream('deflate-raw')` and a tolerant regex HTML-to-text converter.

## Deliverable B — the investigation agent

Next.js 16 App Router, TypeScript strict, Zod 4, Node 22.13+ (`node:sqlite`). Build the eval harness before any UI.

### Evidence contract

Every tool returns `Evidence[]`:

```ts
{ id, url, fetched_at, sha256, source_tool, extractor_version, text }
```

`id = ev_ + shortHash(canonicalUrl + "\n" + sha256(text), 12)`. Text capped at 12,000 characters. Empty URL/text yields `null`. Extractor version `html-text-v1`.

### Graph

Dedupe by canonical URL first, merging provenance and confidence; then by 64-bit simhash with Hamming distance ≤ 6. Confidence by source: page 0.75, GitHub code 0.65, Wayback 0.6, crt.sh 0.55, Common Crawl 0.5, web search 0.4. Citations are valid only if the ID exists, the quote is ≥12 normalized characters, and it is a verbatim substring; duplicate exact quotes are rejected. Add `supports` edges between co-cited evidence.

### Loop

Cap at 12 tool calls and 4 pages:

1. Planner returns 2–4 queries; on failure use the raw question and record `query planning`.
2. Search each query.
3. For up to 2 domains, query Wayback CDX, Common Crawl, and crt.sh in parallel; run GitHub code search for technical queries.
4. Fetch up to 4 unique HTTP(S) result URLs and extract text.
5. If no evidence, return a zero-confidence "No evidence could be retrieved" result with gaps; do not call the synthesizer.
6. Synthesize `{answer, citations, gaps, confidence}` from evidence only.
7. Validate citations; retry once with the validator's complaints; record `citation integrity` for anything still invalid.
8. Run gap review; add deterministic gaps for failures, timeouts, and empty results.
9. Start Wayback snapshots when page evidence is added; await them, then snapshot remaining cited URLs; failures become `archival snapshot` gaps.
10. Emit `result` then `done`.

Final confidence = average of model confidence and graph mean. Deduplicate gaps by normalized topic.

### Tools

One file per tool: `web_search` (SearXNG JSON), `wayback_cdx` (status 200, collapse digest, limit 5), `crt_sh` (CT JSON), `github_code` (token required), `common_crawl` (latest collection via `collinfo.json`), `fetch_page`. Each has Zod args, a 10-second deadline, and fails open to `[]` plus a gap.

### Cache and snapshots

SQLite at `data/cache.sqlite`, WAL mode: `fetch_cache(url, day, status, content_type, body, fetched_at, final_url)` keyed URL + UTC day; `evidence`; `snapshots(url, snapshot_url, attempted_at, ok)`. Cache writes are best effort. Every fetch goes through the cache.

### Models

Featherless (OpenAI-compatible), key required for live use. Roles: planner `Qwen/Qwen2.5-72B-Instruct` (0.2, 700 tokens, 60s), synthesizer `deepseek-ai/DeepSeek-V3-0324` (0.1, 1800, 90s), gapfinder `Qwen/Qwen2.5-72B-Instruct` (0.3, 700, 60s). Env overrides per role. Retry 429/5xx three times with backoff; one corrective JSON retry; all calls through a semaphore capped at 3. Parse fenced or brace-extracted JSON.

### API and UI

`POST /api/investigate` takes `{question}` (3–2000 chars), returns SSE events `status`, `plan`, `evidence`, `gap`, `result`, `error`, `done`; 400 with Zod issues; Node runtime, dynamic, 300s max. No auth.

A minimal client page posts the question, parses SSE frames, and shows status, queries, evidence cards, gaps, answer, quote citations with source and Wayback links, confidence, counts, and duration; Stop aborts.

### Eval

20 questions with a known-good answer, answer keywords, expected domains, and expected gap topics. Mix stable facts with time-varying/non-public questions. Score **0.6 × citation validity + 0.4 × gap recall**; keywords/domains are diagnostics. Runner supports `--limit`, `--verbose`, `--dry-run`, writes timestamped JSON, and honors `EVAL_MIN_COMPOSITE`. Dry run must validate all 20 without keys.

## Acceptance checks

- `npm test` → 38 checks pass (extension).
- `npm run check` → all extension JS parses.
- `npx tsc --noEmit` → pass.
- `npm run test:agent` → 30 pass on Node 22.13+.
- `npm run check:floor` → `.nvmrc`, `engines.node`, the CI workflow and the docs all state the floor in `MIN_NODE`.
- `npx tsx eval/run.ts --dry-run` → 20 valid questions.
- `npx next build` → succeeds with `ƒ /api/investigate`.
- Built server answers SSE with status/plan/gaps/result/done without keys; invalid body returns 400.
- Remote import: GitHub repo (live), zip URL, raw markdown; archive fallback works when the API is rate-limited.

## Environment

`.env.example` with `FEATHERLESS_API_KEY`, `FEATHERLESS_BASE_URL`, `ROLE_PLANNER_MODEL`, `ROLE_SYNTH_MODEL`, `ROLE_GAP_MODEL`, `SEARXNG_URL`, `GITHUB_TOKEN`, `COMMON_CRAWL_INDEX`, `LLM_MAX_CONCURRENCY=3`, `TOOL_TIMEOUT_MS=10000`, `EVIDENCE_MAX_CHARS=12000`, `CACHE_DB=./data/cache.sqlite`. Ignore `node_modules/`, `.next/`, `out/`, `data/`, `.env`, `.env.local`, `eval/results/`, `*.tsbuildinfo`, `next-env.d.ts`, `backups/`.

## Documentation

README for users (install, providers, free paths, page capture, library, Keep/Docs/Drive, file formats, skills, remote collections, privacy, development). AGENT.md for the agent contract. ARCHITECTURE.md for the full description with Mermaid diagrams for both runtimes and a verification ledger. Do not claim live behavior that has not been exercised; mark unverified paths explicitly.
