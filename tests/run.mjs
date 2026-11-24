// Dependency-free checks for the pure logic: splitting, templating, Keep parsing,
// CSV/JSON import, zip reading, prompt search, and the unpacked extension (the
// manifest, the CSS/JS its HTML pages load, and its ES module graph).
// Run with: npm test

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitPrompts, extractVariables, renderTemplate, searchPrompts, libraryFacets } from '../src/lib/prompts.js';
import { parseKeepNoteHtml, importKeepJson, importKeepTakeoutZip } from '../src/lib/import/keep.js';
import {
  importCsvPrompts,
  importJsonPrompts,
  importTextFile,
  exportPromptsAsMarkdown,
  parseFrontmatter,
  importSkillMarkdown,
  importMarkdownZip,
} from '../src/lib/import/files.js';
import { PROVIDERS, providerConfig } from '../src/lib/providers.js';
import { htmlToText, decodeEntities } from '../src/lib/import/html.js';
import { readZip } from '../src/lib/import/zip.js';
import { parseCollectionUrl, collectRemoteCollection } from '../src/lib/import/remote.js';

let passed = 0;
function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      throw new Error('test returned a promise; wrap async tests in run()');
    }
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(`      ${error.message}`);
    process.exitCode = 1;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(`      ${error.message}`);
    process.exitCode = 1;
  }
}

/* ---------- templating ---------- */

test('extractVariables keeps order and removes duplicates', () => {
  assert.deepEqual(extractVariables('{{page}} then {{ tone }} then {{page}}'), ['page', 'tone']);
});

test('renderTemplate fills known vars and preserves unknown placeholders', () => {
  const out = renderTemplate('Hi {{name}}, read {{page_title}} about {{missing}}', {
    name: 'Ada',
    page_title: 'Zips',
  });
  assert.equal(out, 'Hi Ada, read Zips about {{missing}}');
});

test('renderTemplate treats empty values as missing (visible placeholder)', () => {
  assert.equal(renderTemplate('x {{page}}', { page: '' }), 'x {{page}}');
});

/* ---------- splitting ---------- */

test('splitPrompts splits markdown headings', () => {
  const text = `## Summarize\nSummarize the attached page in five bullets, exactly.\n\n## Translate\nTranslate the selected text into French, keeping tone.`;
  const prompts = splitPrompts(text);
  assert.equal(prompts.length, 2);
  assert.equal(prompts[0].title, 'Summarize');
  assert.equal(prompts[1].title, 'Translate');
  assert.match(prompts[0].body, /five bullets/);
});

test('splitPrompts splits numbered prompt lists', () => {
  const text = `1. Review this diff\nCheck the diff for correctness, edge cases and security problems in detail.\n\n2. Write tests\nCover the happy path, two boundaries and one loud failure case.\n\n3. Explain the error\nExplain what caused the error and list the three most likely fixes.`;
  const prompts = splitPrompts(text);
  assert.equal(prompts.length, 3);
  assert.equal(prompts[0].title, 'Review this diff');
  assert.match(prompts[2].body, /most likely fixes/);
});

test('splitPrompts handles "Prompt 1:" style notes', () => {
  const text = `Prompt 1: Outline the article\nProduce three outlines with the reader takeaway stated up front.\n\nPrompt 2: Tighten the intro\nHalve the intro without losing any of the facts it states.`;
  const prompts = splitPrompts(text);
  assert.equal(prompts.length, 2);
  assert.equal(prompts[1].title, 'Tighten the intro');
});

test('splitPrompts splits on --- delimiters', () => {
  const text = `First prompt title\nBody of the first prompt, long enough to survive the filter.\n\n---\n\nSecond prompt title\nBody of the second prompt, also long enough to survive.`;
  const prompts = splitPrompts(text);
  assert.equal(prompts.length, 2);
  assert.match(prompts[1].body, /second prompt/);
});

test('splitPrompts keeps plain text as one prompt', () => {
  const prompts = splitPrompts('Just one instruction with no structure at all.');
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].body, 'Just one instruction with no structure at all.');
});

test('splitPrompts respects an explicit single mode', () => {
  const text = `1. one\n2. two\n3. three`;
  const prompts = splitPrompts(text, { mode: 'single', title: 'Note' });
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].title, 'Note');
});

/* ---------- search ---------- */

const library = [
  { id: 'a', title: 'Summarize page', body: 'Summarize {{page}} in bullets', tags: ['summary'], collection: 'Page', source: { kind: 'builtin' }, pinned: true, uses: 2, updatedAt: 10 },
  { id: 'b', title: 'Haiku', body: 'Write a haiku about {{topic}}', tags: ['writing'], collection: 'Writing', source: { kind: 'keep' }, pinned: false, uses: 0, updatedAt: 20 },
  { id: 'c', title: 'Code review', body: 'Review this diff carefully', tags: ['code'], collection: 'Coding', source: { kind: 'gdoc' }, pinned: false, uses: 9, updatedAt: 30 },
];

test('searchPrompts finds by title, tag and body', () => {
  assert.equal(searchPrompts(library, { query: 'haiku' })[0].id, 'b');
  assert.equal(searchPrompts(library, { query: 'writing' })[0].id, 'b');
  assert.equal(searchPrompts(library, { query: 'code' })[0].id, 'c');
  assert.equal(searchPrompts(library, { query: 'bullets' })[0].id, 'a');
});

test('searchPrompts filters by collection and source', () => {
  assert.equal(searchPrompts(library, { collection: 'Writing' }).length, 1);
  assert.equal(searchPrompts(library, { source: 'keep' })[0].id, 'b');
  assert.equal(searchPrompts(library, { query: 'zzz' }).length, 0);
});

test('searchPrompts ranks pinned and used prompts well', () => {
  assert.equal(searchPrompts(library, { sort: 'uses' })[0].id, 'c');
  assert.equal(searchPrompts(library, { sort: 'recent' })[0].id, 'c');
});

test('libraryFacets counts collections and tags', () => {
  const facets = libraryFacets(library);
  assert.equal(facets.collections.length, 3);
  assert.ok(facets.tags.some((tag) => tag.value === 'writing' && tag.count === 1));
});

/* ---------- HTML / Keep ---------- */

test('decodeEntities handles named and numeric entities', () => {
  assert.equal(decodeEntities('a &amp; b &#39;c&#39; &#x41;'), "a & b 'c' A");
});

test('htmlToText keeps list structure and drops scripts', () => {
  const text = htmlToText('<p>One</p><ul><li>A</li><li>B</li></ul><script>bad()</script><p>Two</p>');
  assert.match(text, /One/);
  assert.match(text, /- A/);
  assert.doesNotMatch(text, /bad/);
});

const TAKEKEEP_HTML = `<!DOCTYPE html><html><head><title>Note title</title></head><body>
<div class="content">
  <div class="title">Prompt pack</div>
  <div class="labels"><span class="label-name">prompts</span><span class="label-name">work</span></div>
  <div class="text-content">Write a haiku about {{page_title}}.<br>Keep it short &amp; sharp.<br><br>Thanks!</div>
</div></body></html>`;

test('parseKeepNoteHtml extracts title, body and labels', () => {
  const note = parseKeepNoteHtml(TAKEKEEP_HTML, 'fallback');
  assert.equal(note.title, 'Prompt pack');
  assert.match(note.body, /Write a haiku about \{\{page_title\}\}\./);
  assert.match(note.body, /short & sharp/);
  assert.deepEqual(note.labels, ['prompts', 'work']);
  assert.equal(note.archived, false);
});

test('parseKeepNoteHtml handles list notes', () => {
  const note = parseKeepNoteHtml(`<div class="content"><div class="title">Todo</div>
    <ul class="list-content"><li>First item</li><li>Second item</li></ul></div>`);
  assert.equal(note.title, 'Todo');
  assert.match(note.body, /- First item/);
});

test('importKeepJson reads Keep API style notes', () => {
  const prompts = importKeepJson(
    JSON.stringify([{ title: 'Idea', body: { text: { text: 'A raw idea' } }, labels: [{ name: 'x' }] }])
  );
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].body, 'A raw idea');
  assert.deepEqual(prompts[0].tags, ['x']);
});

/* ---------- zip ---------- */

function makeZip(files) {
  const encoder = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = encoder.encode(file.text);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    locals.push(local, data);
    centrals.push(central);
    offset += local.length + data.length;
  }

  const centralSize = centrals.reduce((sum, chunk) => sum + chunk.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const chunks = [...locals, ...centrals, eocd];
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return out.buffer;
}

await testAsync('readZip reads stored entries', async () => {
  const buffer = makeZip([
    { name: 'Takeout/Keep/My prompts.html', text: TAKEKEEP_HTML },
    { name: 'Takeout/Keep/Archived.html', text: '<div class="content archived"><div class="title">Old</div><div class="text-content">Old note</div></div>' },
  ]);
  const entries = await readZip(buffer);
  assert.equal(entries.size, 2);
  assert.ok(entries.has('Takeout/Keep/My prompts.html'));
});

await testAsync('importKeepTakeoutZip converts notes and skips archived ones', async () => {
  const buffer = makeZip([
    { name: 'Takeout/Keep/My prompts.html', text: TAKEKEEP_HTML },
    { name: 'Takeout/Keep/Archived.html', text: '<div class="content archived"><div class="title">Old</div><div class="text-content">Old note</div></div>' },
    { name: 'Takeout/Keep/Labels.json', text: '{}' },
  ]);
  const prompts = await importKeepTakeoutZip(buffer);
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].title, 'Prompt pack');
  assert.deepEqual(prompts[0].tags, ['prompts', 'work']);
  assert.equal(prompts[0].source.kind, 'keep');
});

await testAsync('importKeepTakeoutZip reports a useful error for unrelated zips', async () => {
  const buffer = makeZip([{ name: 'notes.txt', text: 'hello' }]);
  await assert.rejects(() => importKeepTakeoutZip(buffer), /No Takeout\/Keep notes found/);
});

await testAsync('importMarkdownZip reads a skills collection', async () => {
  const buffer = makeZip([
    {
      name: 'skills/release/SKILL.md',
      text: '---\nname: release-notes\ndescription: Notes\n---\n1. List PRs since the last tag.',
    },
    {
      name: 'skills/plain.md',
      text: '## One\nFirst instruction body long enough.\n\n## Two\nSecond instruction body long enough.',
    },
  ]);
  const prompts = await importMarkdownZip(buffer);
  const skill = prompts.find((prompt) => prompt.title === 'release-notes');
  assert.ok(skill);
  assert.equal(skill.collection, 'Skills');
  assert.equal(skill.source.kind, 'skill');
  assert.ok(prompts.some((prompt) => prompt.title === 'One'));
});

/* ---------- CSV / JSON / files ---------- */

test('importCsvPrompts reads title/body/tags columns', () => {
  const csv = `title,body,tags\nGreeting,"Write a hello to {{name}}, warmly",email;short\nReview,"Review this diff for bugs",code`;
  const prompts = importCsvPrompts(csv, 'csv');
  assert.equal(prompts.length, 2);
  assert.equal(prompts[0].title, 'Greeting');
  assert.match(prompts[0].body, /hello to \{\{name\}\}, warmly/);
  assert.deepEqual(prompts[0].tags, ['email', 'short']);
});

test('importCsvPrompts rejects files without text columns', () => {
  assert.throws(() => importCsvPrompts('a,b\n1,2'), /title/);
});

test('importJsonPrompts accepts arrays, strings and prompt objects', () => {
  assert.equal(importJsonPrompts('["one prompt here"]').length, 1);
  const prompts = importJsonPrompts(JSON.stringify({ prompts: [{ name: 'T', prompt: 'Body here', folder: 'F' }] }));
  assert.equal(prompts[0].title, 'T');
  assert.equal(prompts[0].collection, 'F');
});

test('importTextFile routes markdown and splits sections', () => {
  const markdown = `## One\nFirst instruction body that is long enough.\n\n## Two\nSecond instruction body that is long enough.`;
  const prompts = importTextFile({ name: 'set.md', text: markdown });
  assert.equal(prompts.length, 2);
  assert.equal(prompts[0].collection, 'set');
});

test('parseFrontmatter reads SKILL.md metadata and keeps the body', () => {
  const { data, body, hasFrontmatter } = parseFrontmatter(
    '---\nname: release-notes\ndescription: "Draft release notes."\n---\n\n# Release\nDo it.'
  );
  assert.equal(hasFrontmatter, true);
  assert.equal(data.name, 'release-notes');
  assert.equal(data.description, 'Draft release notes.');
  assert.match(body, /# Release/);
});

test('importSkillMarkdown turns a skill into a Skills prompt', () => {
  const prompt = importSkillMarkdown(
    '---\nname: haiku\ndescription: Write haiku\nallowed-tools: shell\n---\nBody text',
    'SKILL.md'
  );
  assert.equal(prompt.title, 'haiku');
  assert.equal(prompt.body, 'Body text');
  assert.deepEqual(prompt.tags, ['skill', 'tools']);
  assert.equal(prompt.collection, 'Skills');
  assert.equal(prompt.source.kind, 'skill');
});

test('importSkillMarkdown returns null for ordinary markdown', () => {
  assert.equal(importSkillMarkdown('# Just a note\nNo frontmatter here.', 'note.md'), null);
});

test('importTextFile recognises SKILL.md', () => {
  const prompts = importTextFile({ name: 'SKILL.md', text: '---\nname: tidy\ndescription: Tidy notes\n---\nSteps' });
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].title, 'tidy');
  assert.equal(prompts[0].body, 'Steps');
});

/* ---------- remote collections ---------- */

test('parseCollectionUrl reads GitHub repos, tree links and raw files', () => {
  const repo = parseCollectionUrl('github.com/acme/skills.git');
  assert.equal(repo.kind, 'github');
  assert.equal(repo.owner, 'acme');
  assert.equal(repo.repo, 'skills');
  assert.equal(repo.ref, null);

  const tree = parseCollectionUrl('https://github.com/acme/skills/tree/main/skills/writing');
  assert.equal(tree.kind, 'github');
  assert.equal(tree.ref, 'main');
  assert.equal(tree.path, 'skills/writing');

  const blob = parseCollectionUrl('https://github.com/acme/skills/blob/main/skills/writing/SKILL.md');
  assert.equal(blob.kind, 'markdown');
  assert.equal(blob.filename, 'SKILL.md');
  assert.equal(blob.url, 'https://raw.githubusercontent.com/acme/skills/main/skills/writing/SKILL.md');
});

test('parseCollectionUrl reads zip and markdown URLs and rejects other links', () => {
  assert.equal(parseCollectionUrl('https://example.com/packs/prompts.zip').kind, 'zip');
  assert.equal(parseCollectionUrl('https://example.com/prompts.md').kind, 'markdown');
  assert.throws(() => parseCollectionUrl('https://example.com/'), /not a GitHub repository/);
  assert.throws(() => parseCollectionUrl(''), /Paste a GitHub repository/);
});

await testAsync('collectGitHubCollection prefers SKILL.md and reads only those files', async () => {
  const root = 'https://raw.githubusercontent.com/acme/skills/main/';
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url === 'https://api.github.com/repos/acme/skills') {
      return { ok: true, status: 200, json: async () => ({ default_branch: 'main' }) };
    }
    if (url === 'https://api.github.com/repos/acme/skills/git/trees/main?recursive=1') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          tree: [
            { type: 'blob', path: 'SKILL.md' },
            { type: 'blob', path: 'writing/SKILL.md' },
            { type: 'blob', path: 'README.md' },
            { type: 'blob', path: 'notes.md' },
          ],
        }),
      };
    }
    if (url === `${root}SKILL.md`) {
      return { ok: true, status: 200, text: async () => '---\nname: alpha\ndescription: A\n---\nDo alpha.' };
    }
    if (url === `${root}writing/SKILL.md`) {
      return { ok: true, status: 200, text: async () => '---\nname: beta\ndescription: B\n---\nDo beta.' };
    }
    return { ok: false, status: 404, text: async () => '' };
  };

  const collection = await collectRemoteCollection('https://github.com/acme/skills', { fetchImpl });
  assert.equal(collection.prompts.length, 2);
  assert.deepEqual(collection.prompts.map((prompt) => prompt.title), ['alpha', 'beta']);
  assert.equal(collection.prompts[0].collection, 'acme/skills');
  assert.equal(collection.prompts[0].source.kind, 'skill');
  assert.match(collection.prompts[0].source.url, /\/blob\/main\/SKILL\.md$/);
  assert.equal(collection.filesRead, 2);
  assert.equal(collection.filesFailed, 0);
  assert.ok(!calls.some((url) => url.endsWith('README.md')));
});

await testAsync('collectGitHubCollection falls back to the archive when the API is rate-limited', async () => {
  const buffer = makeZip([
    { name: 'skills-main/SKILL.md', text: '---\nname: fallback\ndescription: F\n---\nFallback body' },
    { name: 'skills-main/README.md', text: '# readme' },
  ]);
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.startsWith('https://api.github.com/')) return { ok: false, status: 403, json: async () => ({ message: 'rate limit' }) };
    if (url === 'https://github.com/acme/skills/archive/HEAD.zip') {
      return { ok: true, status: 200, arrayBuffer: async () => buffer };
    }
    return { ok: false, status: 404 };
  };

  const collection = await collectRemoteCollection('https://github.com/acme/skills', { fetchImpl });
  assert.equal(collection.prompts.length, 1);
  assert.equal(collection.prompts[0].title, 'fallback');
  assert.ok(calls.some((url) => url.endsWith('/archive/HEAD.zip')));
});

await testAsync('collectRemoteCollection reads a zip URL', async () => {
  const buffer = makeZip([{ name: 'pkg/SKILL.md', text: '---\nname: zipped\ndescription: Z\n---\nZip body' }]);
  const fetchImpl = async () => ({ ok: true, status: 200, arrayBuffer: async () => buffer });
  const collection = await collectRemoteCollection('https://example.com/pkg.zip', { fetchImpl });
  assert.equal(collection.prompts.length, 1);
  assert.equal(collection.prompts[0].title, 'zipped');
  assert.equal(collection.label, 'pkg');
  assert.equal(collection.prompts[0].source.label, 'pkg');
});

await testAsync('collectRemoteCollection reads a single markdown URL', async () => {
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => '# Note\nOne plain instruction body.' });
  const collection = await collectRemoteCollection('https://example.com/note.md', { fetchImpl });
  assert.equal(collection.prompts.length, 1);
  assert.equal(collection.prompts[0].title, 'note');
});

test('free providers are present and the on-device one needs no key', () => {
  assert.equal(PROVIDERS.builtin.free, true);
  assert.equal(PROVIDERS.builtin.kind, 'chrome-ai');
  assert.equal(PROVIDERS.ollama.free, true);
  assert.equal(PROVIDERS.groq.freeTier, true);

  const config = providerConfig('builtin', { apiKeys: {}, model: '' });
  assert.equal(config.needsKey, false);
  assert.equal(config.ready, true);
  assert.equal(config.model, 'gemini-nano');

  const custom = providerConfig('custom', { apiKeys: {}, model: 'x', customBaseUrl: '' });
  assert.equal(custom.ready, false);
});

test('exportPromptsAsMarkdown writes headings', () => {
  const markdown = exportPromptsAsMarkdown([{ title: 'T', body: 'B', tags: ['x'] }]);
  assert.match(markdown, /^## T/);
  assert.match(markdown, /Tags: x/);
});

/* ---------- unpacked extension ---------- */

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

function readJson(file) {
  return JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
}

// Every local file the manifest points at, from the background worker and side
// panel to content-script CSS/JS, icon maps and web-accessible resources.
function manifestFileRefs(manifest) {
  const refs = [];
  const add = (value) => {
    if (Array.isArray(value)) value.forEach(add);
    else if (value && typeof value === 'object') Object.values(value).forEach(add);
    else if (typeof value === 'string' && value.trim()) refs.push(value.trim());
  };

  add(manifest.background?.service_worker);
  add(manifest.background?.page);
  add(manifest.background?.scripts);
  add(manifest.side_panel?.default_path);
  add(manifest.action?.default_popup);
  add(manifest.action?.default_icon);
  add(manifest.icons);
  add(manifest.options_page);
  add(manifest.options_ui?.page);
  add(manifest.devtools_page);
  add(manifest.storage?.managed_schema);
  add(manifest.sandbox?.pages);
  for (const entry of manifest.content_scripts ?? []) {
    add(entry.js);
    add(entry.css);
  }
  for (const entry of manifest.web_accessible_resources ?? []) add(entry.resources);
  for (const entry of manifest.declarative_net_request?.rule_resources ?? []) add(entry.path);
  add(Object.values(manifest.chrome_url_overrides ?? {}));

  return [...new Set(refs)];
}

const SKIP_DIRS = new Set(['node_modules', '.next', '.git']);

function listRepoFiles(dir = repoRoot, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      return SKIP_DIRS.has(entry.name) ? [] : listRepoFiles(path.join(dir, entry.name), relative);
    }
    return [relative];
  });
}

function referenceExists(ref) {
  if (!ref.includes('*')) return existsSync(path.join(repoRoot, ref));
  // Web-accessible resources may be globs; one match is enough.
  const pattern = new RegExp(`^${ref.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  return listRepoFiles().some((file) => pattern.test(file));
}

// A manifest can name an HTML page that loads a stylesheet or script which is
// not there; Chrome only complains when the unpacked extension is loaded. These
// helpers resolve the <link href>, <script src> and <img src> references of
// every manifest HTML page relative to that page, and report the missing ones.
const NOT_A_LOCAL_FILE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

function htmlAssetRefs(html) {
  const refs = [];
  for (const tag of html.match(/<(?:link|script|img)\b[^>]*>/gi) ?? []) {
    const element = /^<(link|script|img)/i.exec(tag)?.[1]?.toLowerCase();
    const pattern = new RegExp(`\\b${element === 'link' ? 'href' : 'src'}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i');
    const match = pattern.exec(tag);
    const value = match ? (match[1] ?? match[2] ?? match[3] ?? '').trim() : '';
    if (value) refs.push(value);
  }
  return refs;
}

/** Repo path an HTML reference points at, or null when it is not a local file. */
function resolveHtmlAsset(page, ref) {
  if (!ref || NOT_A_LOCAL_FILE.test(ref)) return null;
  const clean = ref.split('#')[0].split('?')[0].trim();
  if (!clean) return null;
  const base = clean.startsWith('/') ? '' : path.posix.dirname(page);
  return path.posix.normalize(path.posix.join(base, clean.replace(/^\/+/, '')));
}

function findMissingHtmlAssets(
  pages,
  read = (file) => readFileSync(path.join(repoRoot, file), 'utf8'),
  has = (file) => existsSync(path.join(repoRoot, file))
) {
  const missing = [];
  let checked = 0;

  for (const page of pages) {
    for (const ref of htmlAssetRefs(read(page))) {
      const asset = resolveHtmlAsset(page, ref);
      if (!asset) continue;
      checked += 1;
      // Never look outside the repository, and never let an escaping path pass.
      if (asset.startsWith('..')) missing.push(`${page} -> ${ref} (outside the repository)`);
      else if (!has(asset)) missing.push(`${page} -> ${ref}`);
    }
  }

  return { checked, missing };
}

// Every ES module the extension ships. A relative import that points at nothing,
// or a bare specifier Chrome cannot resolve without an import map, only fails
// when the unpacked extension is loaded, so check the graph offline.
const RELATIVE_IMPORT = /^(?:\.{1,2}\/|\/)/;

function extensionModuleFiles() {
  return listRepoFiles().filter((file) => file === 'background.js' || /^src\/.*\.js$/.test(file));
}

/** Static imports and re-exports, plus literal dynamic `import('…')` calls. */
function moduleSpecifiers(source) {
  const patterns = [
    /\bimport\s+(?:[^'"();]+?\s+from\s*)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?:\*|\{[^}]*\})\s*(?:as\s+\w+\s*)?from\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  const specs = [];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specs.push(match[1]);
  }
  return [...new Set(specs)];
}

function findModuleProblems(
  files,
  read = (file) => readFileSync(path.join(repoRoot, file), 'utf8'),
  has = (file) => existsSync(path.join(repoRoot, file))
) {
  const problems = [];
  const scanned = [];

  for (const file of files) {
    for (const spec of moduleSpecifiers(read(file))) {
      scanned.push(spec);
      if (!RELATIVE_IMPORT.test(spec)) {
        const kind = /^[a-z][a-z0-9+.-]*:/i.test(spec) ? 'remote or non-file URL' : 'bare specifier';
        problems.push(`${file} -> ${spec} (${kind}; a Chrome extension can only import local files)`);
        continue;
      }

      const clean = spec.split(/[?#]/)[0];
      const base = clean.startsWith('/') ? '' : path.posix.dirname(file);
      const target = path.posix.normalize(path.posix.join(base, clean.replace(/^\/+/, '')));
      if (target.startsWith('..')) problems.push(`${file} -> ${spec} (outside the repository)`);
      else if (!has(target)) problems.push(`${file} -> ${spec} (missing ${target})`);
    }
  }

  return { problems, scanned };
}

test('manifest.json parses and is Manifest V3', () => {
  const manifest = readJson('manifest.json');
  assert.equal(manifest.manifest_version, 3);
  assert.equal(typeof manifest.name, 'string');
  assert.ok(manifest.name.length > 0);
});

test('every file manifest.json references exists', () => {
  const manifest = readJson('manifest.json');
  const refs = manifestFileRefs(manifest);
  assert.equal(typeof manifest.background?.service_worker, 'string', 'background service worker is declared');
  assert.equal(typeof manifest.side_panel?.default_path, 'string', 'side panel HTML is declared');

  const missing = refs.filter((ref) => !referenceExists(ref));
  assert.deepEqual(missing, [], `missing from manifest.json references: ${missing.join(', ')}`);
});

test('every CSS/JS asset the manifest HTML pages load exists', () => {
  const manifest = readJson('manifest.json');
  const pages = manifestFileRefs(manifest).filter((ref) => /\.html?$/i.test(ref));
  assert.ok(pages.includes('src/sidepanel/panel.html'), 'the side panel page is in the scan');

  const { checked, missing } = findMissingHtmlAssets(pages);
  assert.ok(checked >= 2, `expected the panel to load a stylesheet and a script, resolved ${checked}`);
  assert.deepEqual(missing, [], `HTML pages load files that do not exist: ${missing.join(', ')}`);
});

test('the HTML asset scan resolves relative paths and ignores remote or inline ones', () => {
  const html = [
    '<link rel="stylesheet" href="panel.css" />',
    '<script type="module" src="../lib/panel.js?v=3"></script>',
    '<img src="/icons/panel-16.png">',
    '<link rel="icon" href="https://example.com/favicon.ico">',
    '<img src="data:image/png;base64,AAAA">',
    '<a href="missing-page.html">not an asset</a>',
    '<script src="#inline"></script>',
  ].join('\n');

  const files = new Set(['src/sidepanel/panel.css', 'src/lib/panel.js', 'icons/panel-16.png']);
  const read = () => html;
  const has = (file) => files.has(file);

  const intact = findMissingHtmlAssets(['src/sidepanel/panel.html'], read, has);
  assert.equal(intact.checked, 3, 'only the three local assets are resolved');
  assert.deepEqual(intact.missing, []);

  files.delete('src/lib/panel.js');
  const broken = findMissingHtmlAssets(['src/sidepanel/panel.html'], read, has);
  assert.deepEqual(broken.missing, ['src/sidepanel/panel.html -> ../lib/panel.js?v=3']);
});

test('every ES module import in the extension resolves to a local file', () => {
  const files = extensionModuleFiles();
  assert.ok(files.includes('background.js'), 'the service worker is scanned');
  assert.ok(files.includes('src/sidepanel/panel.js'), 'the panel is scanned');

  const { problems, scanned } = findModuleProblems(files);
  assert.ok(scanned.length >= 20, `expected the extension to import its own modules, found ${scanned.length}`);
  assert.deepEqual(problems, [], `unloadable module imports: ${problems.join(', ')}`);
});

test('the module scan resolves relative specifiers and rejects missing or bare ones', () => {
  const entry = 'src/entry.js';
  const source = [
    "import { a } from './a.js';",
    'import * as b from "../lib/b.js";',
    "import '/src/root.js';",
    "export { c } from './c.js';",
    "import 'lodash';",
    "const lazy = await import('./d.js');",
    "import 'https://cdn.example.com/x.js';",
  ].join('\n');

  const files = new Set(['src/a.js', 'lib/b.js', 'src/root.js', 'src/c.js', 'src/d.js']);
  const read = () => source;
  const has = (file) => files.has(file);

  const intact = findModuleProblems([entry], read, has);
  assert.equal(intact.scanned.length, 7, 'every specifier is collected, including dynamic imports');
  assert.deepEqual(intact.problems, [
    'src/entry.js -> lodash (bare specifier; a Chrome extension can only import local files)',
    'src/entry.js -> https://cdn.example.com/x.js (remote or non-file URL; a Chrome extension can only import local files)',
  ]);

  files.delete('lib/b.js');
  files.delete('src/d.js');
  const broken = findModuleProblems([entry], read, has);
  assert.deepEqual(
    broken.problems.filter((problem) => problem.includes('missing')),
    [
      'src/entry.js -> ../lib/b.js (missing lib/b.js)',
      'src/entry.js -> ./d.js (missing src/d.js)',
    ]
  );
});

test('manifest version matches package.json', () => {
  assert.equal(readJson('manifest.json').version, readJson('package.json').version);
});

console.log(`\n${passed} checks passed${process.exitCode ? ' (with failures)' : ''}.`);
