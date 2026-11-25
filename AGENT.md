# Investigation agent

A server-side investigation agent. It is deliberately **not a search box**: it plans queries, gathers evidence through six tools, deduplicates and archives what it finds, allows the model to cite only evidence that exists, and returns its uncertainty as a required `gaps` field.

```
app/api/investigate/route.ts   POST endpoint, Server-Sent Events
lib/agent/loop.ts              driver: plan → gather → synthesise → validate → gaps → snapshot
lib/agent/prompts.ts           evidence-grounded prompts
lib/agent/schema.ts            Zod schemas for every model boundary
lib/evidence/graph.ts          nodes, edges, confidence, provenance, citation validation
lib/evidence/evidence.ts       evidence factory (sha256, id, fetched_at)
lib/tools/*.ts                 one tool per file, typed args, each returns Evidence[]
lib/fetch/*.ts                 Wayback CDX, crt.sh, GitHub code search, Common Crawl, SearXNG
lib/cache/db.ts                SQLite cache, evidence and snapshot tables
lib/cache/fetch-cache.ts       cached fetch (URL + UTC day)
lib/llm.ts                     Featherless client, per-role model/param map
lib/queue.ts                   semaphore, max 3 concurrent LLM calls
eval/                          20 questions + scorer + live runner
```

## Rules as invariants

| Rule | Where it is enforced |
| --- | --- |
| Evidence object is mandatory | `lib/evidence/evidence.ts`; empty text or URL yields `null` |
| Nothing enters a prompt without evidence | `lib/agent/prompts.ts` renders only `EvidenceNode`s; the loop never sends raw tool output |
| The model may cite only evidence IDs | `EvidenceGraph.validateCitations` checks the ID, the verbatim quote and duplicates; invalid citations are dropped and reported as a gap |
| Cache every fetch to SQLite, keyed URL + date | `getOrFetch` in `lib/cache/fetch-cache.ts`; `fetch_cache` table keyed `(url, day)` |
| 10s timeout on every tool, fail open | `TOOL_TIMEOUT_MS`, `runTool` wraps execution in `withTimeout`; every tool catches and returns `[]` |
| Dedupe by canonical URL, then simhash | `EvidenceGraph.add` (canonical form → 64-bit simhash, Hamming ≤ 6) |
| Snapshot every cited URL to Wayback | `ensureSnapshot` for every validated citation before the result is emitted; failures become a gap |
| `GAPS` is a required output field | `SynthesisSchema` requires `gaps`; a missing key fails validation and triggers one corrective retry |
| Types on every boundary | Zod for HTTP input, planner output, synthesis, gap review and every tool's args |
| Max 3 concurrent LLM calls | `llmSemaphore` in `lib/queue.ts`, around every Featherless request |

## Evidence contract

```ts
interface Evidence {
  id: string;               // ev_<hash of canonical URL + sha256(text)>
  url: string;
  fetched_at: string;       // ISO 8601
  sha256: string;           // sha256 of text
  source_tool: "web_search" | "wayback_cdx" | "crt_sh" | "github_code" | "common_crawl" | "fetch_page";
  extractor_version: string;
  text: string;             // bounded to EVIDENCE_MAX_CHARS
}
```

The graph enriches each node with `canonical_url`, `simhash`, `confidence`, `provenance` and an optional `snapshot_url`, and records `supports` edges between co-cited evidence. `confidence` combines the model's self-report with the graph mean.

## Flow

1. **Plan** — planner role returns 2–4 checkable queries as JSON. If the planner fails, the raw question is used and a `query planning` gap is recorded.
2. **Search** — SearXNG results become snippet evidence per result URL.
3. **Structured sources** — for domains found in the queries: Wayback CDX, Common Crawl and crt.sh; for technical queries: GitHub code search.
4. **Read** — the top result URLs are fetched and extracted to full-text evidence.
5. **Synthesise** — the synthesizer returns `{answer, citations, gaps, confidence}`; citations are validated and retried once with the validator's complaints.
6. **Gap review** — the gapfinder role proposes missing angles; deterministic gaps (tool failures, timeouts, no evidence, invalid citations) are already recorded.
7. **Archive** — every cited URL is snapshotted to Wayback; failures become an `archival snapshot` gap.
8. **Emit** — `result` then `done`.

If no evidence survives, the agent returns an honest "no evidence retrieved" result with zero confidence and does not call the synthesizer.

## Tools

| Tool | Args | Behavior |
| --- | --- | --- |
| `web_search` | `{query}` | SearXNG JSON; one evidence per result |
| `wayback_cdx` | `{target}` | historical snapshots; evidence is the archive URL plus row summary |
| `crt_sh` | `{domain}` | certificate transparency records |
| `github_code` | `{query}` | needs `GITHUB_TOKEN`; matched snippets |
| `common_crawl` | `{target}` | latest crawl index rows |
| `fetch_page` | `{url}` | cache-backed fetch + readable-text extraction |

Every tool reports failures through `ToolContext.reportGap` and returns an empty array instead of throwing.

## Storage

`data/cache.sqlite` (override with `CACHE_DB`, `:memory:` in tests):

- `fetch_cache(url, day, status, content_type, body, fetched_at, final_url)` — primary key `(url, day)`.
- `evidence(id, url, canonical_url, fetched_at, sha256, source_tool, extractor_version, text, simhash, confidence, snapshot_url)`.
- `snapshots(url, snapshot_url, attempted_at, ok)` — snapshots are cached so reruns do not re-save.

Re-running an investigation on the same UTC day reuses the cached responses, so evidence and scores are reproducible while sources are unchanged.

## Models

Featherless is OpenAI-compatible. Only the key is required; models are overridable per role:

| Role | Default | Temp | Max tokens |
| --- | --- | --- | --- |
| `planner` | `Qwen/Qwen2.5-72B-Instruct` | 0.2 | 700 |
| `synthesizer` | `deepseek-ai/DeepSeek-V3-0324` | 0.1 | 1800 |
| `gapfinder` | `Qwen/Qwen2.5-72B-Instruct` | 0.3 | 700 |

`chat` retries 429/5xx up to three times, times out at 60–90s per role, and validates JSON with one corrective retry. All calls pass through the shared semaphore.

## API

```bash
curl -N -X POST http://localhost:3000/api/investigate \
  -H 'content-type: application/json' \
  -d '{"question":"What does HTTP 418 mean and which RFC defines it?"}'
```

SSE events: `status`, `plan`, `evidence`, `gap`, `result`, `error`, `done`. Invalid bodies return HTTP 400 with Zod issues. The route is `runtime = "nodejs"` and `force-dynamic`.

## Eval harness

Built before any UI, because prompt changes cannot be judged otherwise.

- `eval/questions.ts` — 20 questions with known-good answer keywords, expected domains and expected gap topics. Some are deliberately time-varying or non-public so gap recall has signal.
- `eval/score.ts` — scores **citation validity** (IDs exist, quotes are verbatim, no duplicates) and **gap recall** (expected gap topics matched by phrase or ≥60% token overlap). Composite = 0.6 × validity + 0.4 × recall. Answer keywords and domain hits are diagnostics only.
- `eval/run.ts` — live runner; writes `eval/results/<timestamp>.json`.

```bash
npm run eval:dry          # validate the 20 questions without network or keys
npm run eval              # live run (needs FEATHERLESS_API_KEY, SEARXNG_URL)
npm run eval -- --limit=5 --verbose
EVAL_MIN_COMPOSITE=0.7 npm run eval   # fail the run below a threshold
```

## Run

Requires Node 22.13+ (`node:sqlite` is behind `--experimental-sqlite` before 22.13.0, and absent before 22.5.0). The `test:agent`/`eval`/`dev`/`build`/`start` pre-check compares the version and then imports `node:sqlite`, so a runtime in the flagged window is refused as well, before Next or the cache is loaded. CI runs `test:agent` and `eval:dry` on the floor, the floor's major line and 26, and one release below the floor asserts both exit 1 with the requirement message. `MIN_NODE` in `lib/runtime.mjs` is the only place the floor is written down: the CI jobs read it from there, and `npm run check:floor` fails if `.nvmrc`, `engines.node`, the workflow or the docs disagree.

```bash
npm install
cp .env.example .env      # add FEATHERLESS_API_KEY, SEARXNG_URL, GITHUB_TOKEN
npm run dev               # http://localhost:3000
npm run build && npm start
npm run typecheck
npm run test:agent
```

## Known limitations

- No UI yet, by design.
- A Featherless key is required for planning and synthesis; without one the route still runs tools and returns a truthful no-evidence result.
- Wayback's save endpoint is rate-limited; a failed snapshot becomes a gap rather than blocking the result.
- Fetched pages snapshot in the background as soon as their evidence is added (outside the 10s tool budget) and are awaited before the result; cited evidence from other tools is snapshotted after citation validation.
- The semaphore is per process; multiple server instances each allow three concurrent calls.
- The route has no authentication or rate limiting. Put it behind your own auth before exposing it.
- The eval covers the prompt/citation contract, not live model quality; scores depend on the configured models and sources.
