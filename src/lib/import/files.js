// Generic file import: markdown, plain text, CSV, JSON and SKILL.md collections.

import { splitPrompts } from '../prompts.js';
import { readZip } from './zip.js';

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const source = String(text || '').replace(/\r\n?/g, '\n');

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim()));
}

const FRONTMATTER_RE = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/;

/** Read YAML-ish frontmatter (name: value lines) without a YAML dependency. */
export function parseFrontmatter(text) {
  const source = String(text || '').replace(/\r\n?/g, '\n');
  const match = FRONTMATTER_RE.exec(source);
  if (!match) return { data: {}, body: source.trim(), hasFrontmatter: false };

  const data = {};
  for (const line of match[1].split('\n')) {
    const entry = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!entry) continue;
    let value = entry[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value) data[entry[1]] = value;
  }
  return { data, body: source.slice(match[0].length).trim(), hasFrontmatter: true };
}

/**
 * SKILL.md / Agent Skills file: `name` + `description` frontmatter, markdown body.
 * Returns null when the file has no skill metadata.
 */
export function importSkillMarkdown(text, filename = '') {
  const { data, body } = parseFrontmatter(text);
  if (!data.name && !data.description) return null;

  const fallbackTitle = String(filename).split('/').pop().replace(/\.md$/i, '');
  const tags = ['skill'];
  if (data['allowed-tools']) tags.push('tools');

  return {
    title: data.name || fallbackTitle || 'Skill',
    body: body || data.description || '',
    tags,
    collection: 'Skills',
    source: { kind: 'skill', label: 'Skills', ref: filename },
  };
}

/** Import every .md prompt or SKILL.md inside a zip of a skills collection. */
const DOC_FILE_RE = /(^|\/)(readme|changelog|contributing|code_of_conduct|license|security)\.md$/i;

export async function importMarkdownZip(buffer, { mode = 'auto' } = {}) {
  const entries = await readZip(buffer);
  const decoder = new TextDecoder();
  const prompts = [];

  for (const [path, bytes] of entries) {
    if (!/\.md$/i.test(path)) continue;
    if (DOC_FILE_RE.test(path)) continue; // repo documentation, not prompts
    const text = decoder.decode(bytes);
    const skill = importSkillMarkdown(text, path);
    if (skill) {
      prompts.push({ ...skill, source: { ...skill.source, ref: path } });
      continue;
    }
    const { data, body } = parseFrontmatter(text);
    const title = data.title || path.split('/').pop().replace(/\.md$/i, '');
    for (const piece of splitPrompts(body, { mode, title })) {
      prompts.push({
        ...piece,
        tags: [],
        collection: 'Skills',
        source: { kind: 'file', label: 'Skills', ref: path },
      });
    }
  }

  if (!prompts.length) throw new Error('No SKILL.md or markdown prompt files were found in that zip.');
  return prompts;
}

const HEADER_ALIASES = {
  title: ['title', 'name', 'prompt', 'prompt_title', 'subject'],
  body: ['body', 'text', 'prompt_text', 'content', 'description'],
  tags: ['tags', 'tag', 'labels'],
  collection: ['collection', 'folder', 'category', 'group'],
};

function headerIndex(header) {
  const index = {};
  header.forEach((cell, i) => {
    const key = cell.trim().toLowerCase();
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (index[field] == null && aliases.includes(key)) index[field] = i;
    }
  });
  return index;
}

export function importCsvPrompts(text, collection = 'CSV import') {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('That CSV needs a header row and at least one prompt.');
  const index = headerIndex(rows[0]);
  if (index.body == null && index.title == null) {
    throw new Error('CSV needs a "title" and/or "body" column (also accepts text, prompt, content).');
  }

  const prompts = [];
  for (const row of rows.slice(1)) {
    const body = index.body != null ? row[index.body] || '' : row[index.title] || '';
    if (!body.trim()) continue;
    prompts.push({
      title: (index.title != null ? row[index.title] : '') || body.slice(0, 80),
      body,
      tags: index.tags != null ? String(row[index.tags] || '').split(/[;|]/).map((t) => t.trim()).filter(Boolean) : [],
      collection: (index.collection != null && row[index.collection]) || collection,
      source: { kind: 'file', label: collection },
    });
  }
  if (!prompts.length) throw new Error('No prompts with text were found in that CSV.');
  return prompts;
}

export function importJsonPrompts(text, collection = 'JSON import') {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }

  const list = Array.isArray(data)
    ? data
    : Array.isArray(data.prompts)
      ? data.prompts
      : Array.isArray(data.items)
        ? data.items
        : null;
  if (!list) throw new Error('JSON must be an array of prompts or an object with a "prompts" array.');

  const prompts = [];
  for (const item of list) {
    if (typeof item === 'string') {
      prompts.push({ title: item.slice(0, 80), body: item, tags: [], collection, source: { kind: 'file', label: collection } });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const body = item.body ?? item.text ?? item.prompt ?? item.content ?? item.value ?? '';
    if (!String(body).trim()) continue;
    const tags = Array.isArray(item.tags) ? item.tags : String(item.tags || item.labels || '').split(',').filter(Boolean);
    prompts.push({
      title: String(item.title || item.name || body).slice(0, 200),
      body: String(body),
      tags,
      collection: item.collection || item.folder || item.category || collection,
      source: { kind: 'file', label: collection, ref: item.id || '' },
    });
  }
  if (!prompts.length) throw new Error('No prompts with text were found in that JSON.');
  return prompts;
}

/**
 * Route a single dropped/picked text file to the right importer.
 * @param {{name: string, text: string, mode?: string}} input
 */
export function importTextFile({ name, text, mode = 'auto' }) {
  const lower = String(name || '').toLowerCase();
  const collection = String(name || 'File import').replace(/\.[^.]+$/, '').slice(0, 120) || 'File import';

  if (lower.endsWith('.json')) return importJsonPrompts(text, collection);
  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) return importCsvPrompts(text, collection);

  const skill = importSkillMarkdown(text, name);
  if (skill) return [skill];

  const { data, body, hasFrontmatter } = parseFrontmatter(text);
  const source = hasFrontmatter ? body : text;
  const pieces = splitPrompts(source, { mode, title: data.title || data.name || collection });
  if (!pieces.length) throw new Error('That file had no usable text.');
  return pieces.map((piece) => ({
    ...piece,
    tags: [],
    collection,
    source: { kind: 'file', label: collection, ref: name },
  }));
}

export function exportPromptsAsJson(prompts) {
  return JSON.stringify(
    prompts.map(({ title, body, tags, collection }) => ({ title, body, tags, collection })),
    null,
    2
  );
}

export function exportPromptsAsMarkdown(prompts) {
  return prompts
    .map((prompt) => `## ${prompt.title}\n\n${prompt.tags?.length ? `Tags: ${prompt.tags.join(', ')}\n\n` : ''}${prompt.body}\n`)
    .join('\n---\n\n');
}
