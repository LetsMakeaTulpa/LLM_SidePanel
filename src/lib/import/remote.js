// Remote skills collections: a GitHub repository, a zip URL, or a raw markdown URL.
// Fetches and parses only; the caller previews the result before adding anything.

import { splitPrompts } from '../prompts.js';
import { importMarkdownZip, importSkillMarkdown, parseFrontmatter } from './files.js';
import { isZipBuffer } from './zip.js';

const MAX_FILES = 200;
const MAX_FILE_CHARS = 400_000;
const CONCURRENCY = 6;
const FETCH_TIMEOUT_MS = 20_000;
const ZIP_TIMEOUT_MS = 60_000;
const DOC_FILE_RE = /(^|\/)(readme|changelog|contributing|code_of_conduct|license|security)\.(md|markdown)$/i;

function rawFileUrl(owner, repo, ref, path) {
  const encodePath = (value) => value.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodePath(ref)}/${encodePath(path)}`;
}

function httpError(url, status) {
  const rateLimited = /api\.github\.com/.test(url) && (status === 403 || status === 429);
  const error = new Error(
    rateLimited
      ? `GitHub refused the request (HTTP ${status}). The public API allows 60 requests an hour per address — try the repository's zip URL instead, or wait a few minutes.`
      : `Fetching that URL returned HTTP ${status}.`
  );
  error.status = status;
  return error;
}

async function request(url, fetchImpl, as = 'text') {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: as === 'json' ? 'application/vnd.github+json' : '*/*' },
  });
  if (!response.ok) throw httpError(url, response.status);
  if (as === 'json') return response.json();
  if (as === 'buffer') return response.arrayBuffer();
  return response.text();
}

async function mapLimit(items, limit, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const at = index++;
      if (at >= items.length) return;
      await worker(items[at], at);
    }
  });
  await Promise.all(runners);
}

/**
 * Classify a pasted link. Returns one of:
 *   { kind: 'github', owner, repo, ref, path, label }
 *   { kind: 'zip', url, label }
 *   { kind: 'markdown', url, label, filename }
 */
export function parseCollectionUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('Paste a GitHub repository or a zip URL.');
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;

  let url;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error('That is not a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http(s) links can be imported.');

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  let segments;
  try {
    segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    throw new Error('That URL has an unreadable path.');
  }

  if (host === 'github.com') {
    const [owner, repoRaw, mode, ...rest] = segments;
    if (!owner || !repoRaw) throw new Error('A GitHub link needs an owner and a repository.');
    const repo = repoRaw.replace(/\.git$/i, '');
    const label = `${owner}/${repo}`;

    if (mode === 'tree' || mode === 'blob') {
      const ref = rest.shift();
      if (!ref) throw new Error('That GitHub link is missing a branch or tag.');
      const path = rest.join('/');
      if (mode === 'blob') {
        if (!/\.(md|markdown|txt)$/i.test(path)) {
          throw new Error('Only markdown or text files can be imported one at a time.');
        }
        return { kind: 'markdown', url: rawFileUrl(owner, repo, ref, path), filename: path.split('/').pop(), label };
      }
      return { kind: 'github', owner, repo, ref, path, label };
    }

    if (mode === 'archive') return { kind: 'zip', url: url.href, label };

    if (mode) throw new Error('Use a repository link, a /tree/ link, a zip or a raw markdown file.');
    return { kind: 'github', owner, repo, ref: null, path: '', label };
  }

  if (host === 'raw.githubusercontent.com') {
    const [owner, repo, ref, ...rest] = segments;
    const path = rest.join('/');
    if (!owner || !repo || !ref || !path) throw new Error('That raw GitHub link is incomplete.');
    const label = `${owner}/${repo}`;
    if (/\.zip$/i.test(path)) return { kind: 'zip', url: url.href, label };
    return { kind: 'markdown', url: url.href, label, filename: path.split('/').pop() };
  }

  if (host === 'codeload.github.com') {
    const [owner, repo] = segments;
    return { kind: 'zip', url: url.href, label: [owner, repo].filter(Boolean).join('/') || 'GitHub collection' };
  }

  const filename = segments[segments.length - 1] || 'collection';
  if (/\.zip$/i.test(filename)) return { kind: 'zip', url: url.href, label: filename.replace(/\.zip$/i, '') };
  if (/\.(md|markdown|txt)$/i.test(filename)) {
    return { kind: 'markdown', url: url.href, label: filename.replace(/\.[^.]+$/, ''), filename };
  }
  throw new Error('That link is not a GitHub repository, a .zip file, or a markdown file.');
}

function toPrompts(files, label) {
  const prompts = [];
  for (const file of files) {
    const skill = importSkillMarkdown(file.text, file.path);
    if (skill) {
      prompts.push({
        ...skill,
        collection: label,
        source: { kind: 'skill', label, ref: file.path, url: file.url },
      });
      continue;
    }
    const { data, body } = parseFrontmatter(file.text);
    const fallback = file.path.split('/').pop().replace(/\.(md|markdown)$/i, '');
    const title = data.title || data.name || fallback;
    for (const piece of splitPrompts(body || file.text, { mode: 'auto', title })) {
      prompts.push({
        ...piece,
        tags: [],
        collection: label,
        source: { kind: 'file', label, ref: file.path, url: file.url },
      });
    }
  }
  return prompts;
}

async function collectGitHubTree(parsed, { fetchImpl = fetch } = {}) {
  let ref = parsed.ref;
  if (!ref) {
    const repo = await request(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, fetchImpl, 'json');
    ref = repo?.default_branch || 'main';
  }

  const treeUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
  const tree = await request(treeUrl, fetchImpl, 'json');
  const prefix = parsed.path ? `${parsed.path.replace(/\/+$/, '')}/` : '';

  const markdown = (Array.isArray(tree?.tree) ? tree.tree : []).filter(
    (entry) =>
      entry.type === 'blob' &&
      /\.(md|markdown)$/i.test(entry.path) &&
      (!prefix || entry.path.startsWith(prefix)) &&
      !DOC_FILE_RE.test(entry.path)
  );

  // A skills collection imports SKILL.md files only; a plain prompt repo uses its markdown.
  const skillFiles = markdown.filter((entry) => /(^|\/)SKILL\.md$/i.test(entry.path));
  const chosen = skillFiles.length ? skillFiles : markdown;
  if (!chosen.length) {
    throw new Error(
      prefix ? `No SKILL.md or markdown files under “${prefix}” in that repository.` : 'No SKILL.md or markdown files in that repository.'
    );
  }

  const files = [];
  let filesFailed = 0;
  await mapLimit(chosen.slice(0, MAX_FILES), CONCURRENCY, async (entry) => {
    try {
      const text = await request(rawFileUrl(parsed.owner, parsed.repo, ref, entry.path), fetchImpl);
      if (text.length > MAX_FILE_CHARS) {
        filesFailed += 1;
        return;
      }
      const encodedPath = entry.path.split('/').map(encodeURIComponent).join('/');
      files.push({
        path: entry.path,
        text,
        url: `https://github.com/${parsed.owner}/${parsed.repo}/blob/${ref}/${encodedPath}`,
      });
    } catch {
      filesFailed += 1;
    }
  });
  files.sort((a, b) => a.path.localeCompare(b.path));

  const prompts = toPrompts(files, parsed.label);
  if (!prompts.length) throw new Error('Those files had no usable prompt text.');
  return {
    prompts,
    label: parsed.label,
    sourceUrl: `https://github.com/${parsed.owner}/${parsed.repo}`,
    filesRead: files.length,
    filesFailed,
    truncated: chosen.length > MAX_FILES,
  };
}

function archivePath(ref) {
  return String(ref || '').split('/').slice(1).join('/');
}

/** Read a GitHub repository as its archive zip; used when the API is rate-limited. */
async function collectGitHubArchive(parsed, { fetchImpl = fetch } = {}) {
  const ref = parsed.ref || 'HEAD';
  const archiveUrl = `https://github.com/${parsed.owner}/${parsed.repo}/archive/${ref
    .split('/')
    .map(encodeURIComponent)
    .join('/')}.zip`;
  const response = await fetchImpl(archiveUrl, { signal: AbortSignal.timeout(ZIP_TIMEOUT_MS) });
  if (!response.ok) throw httpError(archiveUrl, response.status);
  const buffer = await response.arrayBuffer();
  if (!isZipBuffer(buffer)) throw new Error('GitHub did not return a zip archive for that repository.');

  const all = await importMarkdownZip(buffer);
  const prefix = parsed.path ? `${parsed.path.replace(/\/+$/, '')}/` : '';
  const scoped = prefix ? all.filter((prompt) => archivePath(prompt.source?.ref).startsWith(prefix)) : all;
  const skills = scoped.filter((prompt) => /(^|\/)SKILL\.md$/i.test(String(prompt.source?.ref || '')));
  const chosen = skills.length ? skills : scoped;
  if (!chosen.length) {
    throw new Error(prefix ? `No SKILL.md or markdown files under “${prefix}” in that repository.` : 'No SKILL.md or markdown files in that repository.');
  }

  return {
    prompts: chosen.map((prompt) => ({
      ...prompt,
      collection: parsed.label,
      source: { ...prompt.source, label: parsed.label, url: `https://github.com/${parsed.owner}/${parsed.repo}` },
    })),
    label: parsed.label,
    sourceUrl: `https://github.com/${parsed.owner}/${parsed.repo}`,
    filesRead: new Set(chosen.map((prompt) => prompt.source?.ref).filter(Boolean)).size,
    filesFailed: 0,
    truncated: false,
  };
}

export async function collectGitHubCollection(parsed, options = {}) {
  try {
    return await collectGitHubTree(parsed, options);
  } catch (error) {
    if (error?.status === 403 || error?.status === 429) return collectGitHubArchive(parsed, options);
    throw error;
  }
}

export async function collectZipCollection(parsed, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(parsed.url, { signal: AbortSignal.timeout(ZIP_TIMEOUT_MS) });
  if (!response.ok) throw httpError(parsed.url, response.status);
  const buffer = await response.arrayBuffer();
  if (!isZipBuffer(buffer)) throw new Error('That link did not return a zip file.');

  const prompts = await importMarkdownZip(buffer);
  const filesRead = new Set(prompts.map((prompt) => prompt.source?.ref).filter(Boolean)).size;
  return {
    prompts: prompts.map((prompt) => ({
      ...prompt,
      collection: parsed.label,
      source: { ...prompt.source, label: parsed.label, url: parsed.url },
    })),
    label: parsed.label,
    sourceUrl: parsed.url,
    filesRead,
    filesFailed: 0,
    truncated: false,
  };
}

export async function collectMarkdownCollection(parsed, { fetchImpl = fetch } = {}) {
  const text = await request(parsed.url, fetchImpl);
  const prompts = toPrompts([{ path: parsed.filename || 'SKILL.md', text, url: parsed.url }], parsed.label);
  if (!prompts.length) throw new Error('That file had no usable prompt text.');
  return { prompts, label: parsed.label, sourceUrl: parsed.url, filesRead: 1, filesFailed: 0, truncated: false };
}

/** Fetch and parse a collection without adding it to the library. */
export async function collectRemoteCollection(input, options = {}) {
  const parsed = parseCollectionUrl(input);
  if (parsed.kind === 'github') return collectGitHubCollection(parsed, options);
  if (parsed.kind === 'zip') return collectZipCollection(parsed, options);
  return collectMarkdownCollection(parsed, options);
}
