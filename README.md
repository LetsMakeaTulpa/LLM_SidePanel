# LLM Side Panel

A Manifest V3 browser side panel that talks to **any LLM**, reads **any page you are on**, and deploys prompts from a **large prompt library** that imports straight from Google Keep, Google Drive, Google Docs and `SKILL.md` collections.

Free by default: it runs on Chrome's on-device model with no key and no account, and also supports free local servers and free API tiers. MIT licensed, no paywall, no telemetry.

No build step, no server, no dependencies. Load the folder and it runs.

> **Also in this repo:** a server-side investigation agent (`POST /api/investigate`, SSE) with a strict evidence contract, SQLite fetch cache, six tools, Wayback snapshots, a 3-call LLM semaphore and a 20-question eval harness. See [AGENT.md](AGENT.md). It is a separate Next.js app and needs **Node 22.13 or newer** (pinned in [`.nvmrc`](.nvmrc)) because it uses the built-in `node:sqlite`; the extension itself still has no build step and needs no Node.

```
manifest.json            MV3 manifest: side panel, context menus, storage
background.js            service worker: opens the panel, forwards selection/page captures
src/sidepanel/           panel UI (HTML, CSS, chat + library controllers)
src/lib/                 providers, storage, page extraction, prompt engine, importers
src/prompts/builtin.js   starter pack of prompt templates
tests/run.mjs            Node checks for the pure logic
```

## Install

1. Open `chrome://extensions` (or `edge://extensions`), enable **Developer mode**.
2. **Load unpacked** → pick this folder.
3. Click the toolbar button (or right-click a page → *Send this page to LLM panel*) to open the side panel.
4. The first launch asks how to run it for free — on-device Chrome AI, local Ollama, or a free-tier key. Switch providers any time in **⚙ Settings**.

Requires Chrome/Edge 116+ (side panel API). The built-in model additionally needs Chrome 138+ on desktop.

## Models

| Provider | Kind | Notes |
| --- | --- | --- |
| Chrome built-in AI | native Prompt API | Gemini Nano on-device: free, no key, no network. Chrome 138+ desktop |
| OpenAI | OpenAI-compatible | `gpt-5`, `gpt-5-mini`, `gpt-4.1`, `o4-mini` … |
| Anthropic Claude | native Messages API | Uses the browser-access header Anthropic requires for extension calls |
| Google Gemini | native `generateContent` | `gemini-2.5-pro/flash` |
| Mistral, Groq, DeepSeek, xAI, Together, Perplexity, Cerebras | OpenAI-compatible | |
| OpenRouter | OpenAI-compatible | Reaches hundreds of models behind one key |
| Ollama / LM Studio | OpenAI-compatible, local | No key; defaults to `localhost`, override the base URL if your server differs |
| Custom | OpenAI-compatible | Any endpoint that speaks `/chat/completions` |

Model ids are editable and suggestions are just datalist hints, so new models work without a code change. Responses stream token by token; **Stop** aborts the request. Keys are kept in `chrome.storage.local` for this browser profile and are sent only to the provider you select.

## Free to use and access

Nothing here is gated, metered or tied to an account, and the code is MIT licensed.

| Route | Cost | Requirements |
| --- | --- | --- |
| Chrome built-in AI | free | Chrome 138+ desktop, Gemini Nano (~2–4 GB, downloaded once by Chrome), 16 GB+ RAM |
| Ollama / LM Studio | free | Local install; models run on your machine |
| Free API tiers (Gemini, Groq, Mistral, OpenRouter `:free` models) | free tier | A provider key, no payment |

The first launch offers those three paths, and **Settings → Free options** reopens the chooser at any time. With the built-in model there is no key, no third-party request and no network traffic at all: the page text and the chat stay on the machine. Free-tier keys are still keys — they go to that provider only.

## Page context

Four ways to attach a page:

- **Page tab → Capture page** — extracts the main content of the active tab.
- **Page tab → Capture selection** — uses the highlighted text only.
- **Page tab → Other open tabs** — capture from any tab in the window instead of the active one.
- **Right-click → Send this page / Send selection** — captures and opens the panel.

Extraction strips scripts, nav, footers, forms and hidden nodes, scores candidate containers (`article`, `main`, `[role=main]`, common article classes) by text volume, converts headings, lists, code blocks, quotes and tables into markdown-ish text, and falls back to the full body text when a page has no clear article. It also collects title, description, author, language, headings, top links, image alt text and the current selection. Output is capped at 120k characters and truncated to your context limit when sent.

Captured context is shown as a chip above the composer and applies to your next message. It travels with that message only.

**What cannot be scraped:** PDFs, `chrome://` / `edge://` / extension pages, the Chrome Web Store, and `file://` URLs unless the extension is granted file access. On those pages select text and use **Capture selection** after enabling *Allow access to file URLs* if needed.

## Prompt library

The **Prompts** tab holds the library. Each prompt has a title, body, collection, tags, source, use count and pin state. Search covers titles, tags, collections and body text; the footer filters by source and sorts by relevance, recency, title or usage.

- **Deploy** — fills template variables, then inserts the prompt into the composer for editing.
- **Run** — fills variables and sends immediately.
- **⋯** — edit, duplicate, pin, copy, download as `.md`, delete.
- Clicking a card body deploys it.

Prompts are plain text with `{{placeholders}}`:

| Variable | Filled from |
| --- | --- |
| `{{page}}` | Captured page text (or selection if you captured a selection) |
| `{{page_title}}`, `{{page_url}}`, `{{page_description}}` | Page metadata |
| `{{selection}}` | Highlighted text at capture time |
| `{{date}}`, `{{time}}` | Today's date / current time |

Anything else (`{{topic}}`, `{{audience}}`, `{{schema}}` …) is asked for in a small form at deploy time. Empty values are left visible as placeholders instead of silently becoming blank.

The extension seeds a starter pack (35 prompts across page analysis, writing, coding, business, study and utility) on first run; **Settings → Add starter pack** restores it. **Export all** writes a JSON backup. The whole library lives in `chrome.storage.local` (with `unlimitedStorage`), so tens of thousands of prompts are fine; the list renders 80 at a time with *Show more*.

## Importing your Google Keep collection

Google has **no public consumer Keep API**. The Workspace *Keep API* is enterprise-only and needs a service account with domain-wide delegation, so it cannot serve a personal account from an extension. The practical path is **Google Takeout**, which exports every note as an HTML file — this extension reads those files directly out of the archive.

### Takeout (recommended)

1. Go to [takeout.google.com](https://takeout.google.com), **Deselect all**, tick **Keep**.
2. Leave the format as HTML, then **Next step → Export once** and download the `.zip`.
3. In the panel: **Prompts → ⇪ Import → Google Keep**, drop the zip (or click to pick it).

The archive is parsed locally with a built-in zip reader; nothing is uploaded. Notes become prompts with their title, body, labels as tags and `Google Keep` as the collection. Archived notes are skipped. If your note holds several prompts separated by headings, `---`, a numbered list or bullets, each becomes its own prompt — choose that on the **Paste**/File tabs, or keep one prompt per note.

You can also import loose `.html` notes or a Keep-API-shaped JSON dump (`{title, body:{text:{text}}, labels:[…]}`) instead of the zip.

## Google Drive and Docs

Two independent paths, both local to the browser.

### Paste links (no setup)

**Prompts → ⇪ Import → Drive & Docs**, paste one or more links and import:

- `docs.google.com/document/d/<id>` → `/export?format=txt`
- `docs.google.com/spreadsheets/d/<id>` → `/export?format=csv`
- `drive.google.com/file/d/<id>` → direct download

The requests use your existing Google session, so they work for anything you can already open. If Google answers with a sign-in page the importer says so instead of importing an HTML login form; share the file as "Anyone with the link" or sign in to Google in that browser. Up to 20 links per batch, all parsed in parallel-safe sequence with per-link error reporting.

**Prompt docs:** each document is split into prompts by its structure. A single doc of 200 prompts becomes 200 library entries — that is the intended way to bring a large collection across.

### Connect Drive (optional OAuth client)

Adds browsing and pulling your own files without pasting links. Requires a Google OAuth client you own:

1. [console.cloud.google.com](https://console.cloud.google.com) → create or pick a project.
2. **APIs & Services → Library → Google Drive API → Enable**.
3. **OAuth consent screen** → External → add yourself as a test user.
4. **Credentials → Create credentials → OAuth client ID → Web application**.
5. Under **Authorized redirect URIs** add the exact value shown in **Settings → Google → Authorized redirect URI** (it is `https://<extension-id>.chromiumapp.org/`).
6. Paste the client ID into Settings → Google → OAuth client ID, then **Connect Drive**.

Scope requested is `drive.readonly`. The access token is cached in `chrome.storage.local` until it expires; **Disconnect** clears it. With Drive connected you can load your Docs/text/markdown files, search by name, tick the ones you want and import them. Without it, link import still works.

### Splitting modes

Every importer that reads a document accepts:

| Mode | Behaviour |
| --- | --- |
| Auto-detect | First structure that yields 2+ prompts: headings → numbered list → `---` lines → bullets, else one prompt |
| One prompt | Keep the whole document as a single prompt |
| Markdown headings | Split on the smallest heading level used at least twice |
| Numbered list | `1.`, `1)`, `1 -`, `Prompt 3:` … requires 3+ items averaging 40+ characters |
| Lines of `---` | Explicit delimiter |
| Bulleted list | 3+ bullets, each 40+ characters |

Re-importing the same material is safe: prompts are fingerprinted on normalized title + body and duplicates are reported as skipped instead of piling up.

## Other file formats

- **Markdown / text** — split with the modes above.
- **CSV** — needs `title` and/or `body` columns (aliases: `name`, `prompt`, `text`, `content`), optional `tags` (`;` or `|` separated) and `collection`/`folder`.
- **JSON** — an array of strings, an array of `{title, body, tags, collection}` objects, or `{prompts: [...]}` / `{items: [...]}`. Keep API shapes are accepted on the Keep tab.
- **Saved `.html` page** — treated as a Keep note when it matches that structure, otherwise its text is split like any other document.
- **Takeout `.zip`** — read on any tab; the Keep folder is what gets imported.
- **`SKILL.md` / skills zip** — see below.

## Importing skills and prompt collections

Many public prompt and skill collections ship as `SKILL.md`: YAML frontmatter plus a markdown body.

```markdown
---
name: release-notes
description: Draft release notes from merged pull requests.
---

1. List the merged pull requests since the last tag.
2. Group them by feature, fix and chore.
```

**Prompts → ⇪ Import → File**, then select the skill files (multiple selection works) or drop a zip of the collection. Every `SKILL.md` becomes a prompt titled by `name`, tagged `skill`, in a `Skills` collection. Other `.md` files in a zip are split by their headings. Frontmatter is parsed without a YAML dependency; `allowed-tools` just adds a tag, and non-skill markdown with a `title:` frontmatter keeps that title.

### One link, preview, then add

**Prompts → ⇪ Import → Skills URL** takes:

- a GitHub repository — `https://github.com/owner/repo`, optionally with `/tree/<branch>/<folder>` to narrow it
- a zip URL — the repository archive link (`https://github.com/owner/repo/archive/refs/heads/main.zip`), a release asset, or any `.zip` on the web
- a single `SKILL.md` or markdown file link, including a GitHub `/blob/` link

It fetches and parses the collection, then shows a checklist of every prompt it found with its title and opening text. Nothing enters the library until you press **Add**: untick what you do not want, or select none. When a repository contains `SKILL.md` files, only those are imported; otherwise every non-documentation markdown file is split by its headings. Up to 200 files per collection, and unreadable files are reported rather than aborting the rest.

GitHub is read through its public API, which allows 60 requests an hour per address; one repo import uses one or two, and the raw file downloads are separate. If GitHub refuses with HTTP 403/429, the importer automatically falls back to downloading the repository archive and parsing that instead, so a shared or busy address still works.

Collections you can pull from (external projects — nothing is bundled with this extension, and each keeps its own license):

- [openclaw/openclaw](https://github.com/openclaw/openclaw) and its [skill format docs](https://docs.openclaw.ai/tools/skills)
- [AIPMAndy/awesome-openclaw-skills-CN](https://github.com/AIPMAndy/awesome-openclaw-skills-CN)
- [liyupi/openclaw-guide](https://github.com/liyupi/openclaw-guide)
- [friuns2/BlackFriday-GPTs-Prompts](https://github.com/friuns2/BlackFriday-GPTs-Prompts)

## Storage and privacy

- Prompt library, settings, chat thread (last 80 messages) and the optional Drive token live in `chrome.storage.local` / `chrome.storage.session` for this profile.
- Chat requests go **directly from the extension to the provider** you chose. There is no backend and no telemetry.
- With the built-in model, no chat or page data leaves the browser at all.
- Page text, notes and documents are never uploaded anywhere by the extension; imports are parsed in the panel.
- API keys are stored in plain text in the extension's storage. Treat a shared browser profile accordingly, and use **Forget saved key** before handing a machine over.
- The manifest requests `<all_urls>` host access: needed to read arbitrary pages and to reach whichever LLM endpoint you configure. Narrow it if you only use a few providers.

## Development

```bash
npm test     # parser, splitter, zip, search and manifest checks (no dependencies)
npm run check # syntax-check every source file
```

After editing, reload the extension on `chrome://extensions` and reopen the panel. There is no bundler; the side panel loads ES modules directly.

### Server-side agent

The agent in `app/`, `lib/` and `eval/` is a Next.js app and requires **Node 22.13 or newer**. It uses the built-in `node:sqlite` module, which shipped in 22.5.0 but stayed behind `--experimental-sqlite` until 22.13.0 — on 22.5–22.12 the import fails with `ERR_UNKNOWN_BUILTIN_MODULE`, and on Node 20 the module does not exist at all, so the agent tests fail with `Cannot find module 'node:sqlite'` and `npm run dev` breaks on the first cache call. The version is pinned in [`.nvmrc`](.nvmrc) and declared under `engines` in `package.json` (`npm` only warns about that field). On an older Node the server checks the requirement at startup and exits with these steps instead of failing later with `Cannot find module 'node:sqlite'`; the `test:agent`, `eval`, `eval:dry`, `dev`, `build` and `start` scripts run the same check before they load the cache or Next. That check compares the version and then imports `node:sqlite` itself, so a runtime that passes the comparison but cannot load the module (22.5–22.12, 23.0–23.3) stops there with an explanation instead of failing inside the cache.

```bash
nvm use            # reads .nvmrc
npm ci
npm run dev        # http://localhost:3000
npm run test:agent
npm run eval:dry   # validates the 20 eval questions, no keys or network
```

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs the extension checks, typecheck, `next build`, agent tests and eval dry run on Node 22 for every push to `main` and every pull request, and runs `test:agent` plus `eval:dry` on a matrix of the minimum supported Node (22.13.0), the latest 22.x and 26 so a version-specific failure cannot hide. A separate job runs both commands on Node 22.12.0, where they must exit 1 with the requirement message, so the refusal path is exercised on every push rather than only by hand. The matrix and that job read the floor out of `lib/runtime.mjs` instead of restating it, and `npm run check:floor` fails if `.nvmrc`, `engines.node`, the workflow or this documentation drift from it.

Known limitations: the built-in model needs Chrome 138+ desktop hardware (elsewhere use Ollama or a free-tier key), there is no PDF text extraction, Keep notes must come through Takeout/HTML/JSON, Google Docs need a signed-in session or link sharing (or the Drive client), and only text-like Drive files can be imported.

## License

MIT — see [LICENSE](LICENSE). Free to use, modify and redistribute, including commercially. The third-party skill and prompt collections linked above keep their own licenses.
