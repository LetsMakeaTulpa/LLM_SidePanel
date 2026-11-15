// Prompt templating, splitting and search. Pure functions only so they can be
// unit-tested in plain Node (see tests/run.mjs).

export const TEMPLATE_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

export const BUILTIN_VARS = ['page', 'page_title', 'page_url', 'page_description', 'selection', 'date', 'time'];

export function extractVariables(body) {
  const found = [];
  for (const match of String(body || '').matchAll(TEMPLATE_RE)) {
    if (!found.includes(match[1])) found.push(match[1]);
  }
  return found;
}

/** Replace {{variables}}; unknown placeholders are left in place so they stay visible. */
export function renderTemplate(body, vars = {}) {
  return String(body || '').replace(TEMPLATE_RE, (whole, key) => {
    const value = vars[key];
    if (value === undefined || value === null || value === '') return whole;
    return String(value);
  });
}

export function firstLineTitle(body, max = 90) {
  const line = String(body || '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('---'));
  if (!line) return '';
  return line.replace(/^[#>*\-–—\d.)\s]+/, '').slice(0, max).trim();
}

/* ---------- splitting a big document into prompts ---------- */

function sectionPrompts(sections, fallbackTitle) {
  const out = [];
  for (const section of sections) {
    const body = String(section.body || '').replace(/\n{3,}/g, '\n\n').trim();
    if (body.length < 8) continue;
    const title =
      String(section.title || '').replace(/^[\s#*>\-–—]+/, '').replace(/[\s#*]+$/, '').slice(0, 120) ||
      firstLineTitle(body) ||
      fallbackTitle;
    out.push({ title: title || 'Untitled prompt', body });
  }
  return out;
}

function splitByHeadings(raw) {
  const lines = raw.split('\n');
  const headings = [];
  for (const line of lines) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (match) headings.push({ level: match[1].length, text: match[2].trim() });
  }
  if (headings.length < 2) return [];

  const counts = {};
  for (const h of headings) counts[h.level] = (counts[h.level] || 0) + 1;
  const level = Object.keys(counts)
    .map(Number)
    .sort((a, b) => a - b)
    .find((l) => counts[l] >= 2);
  if (!level) return [];

  const sections = [];
  let current = null;
  for (const line of lines) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (match && match[1].length === level) {
      if (current) sections.push(current);
      current = { title: match[2].trim(), body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) sections.push(current);
  return sectionPrompts(
    sections.map((s) => ({ title: s.title, body: s.body.join('\n') })),
    ''
  );
}

function splitByDelimiter(raw) {
  const chunks = raw.split(/^[ \t]*(?:-{3,}|\*{3,}|={3,})[ \t]*$/m);
  if (chunks.length < 2) return [];
  return sectionPrompts(
    chunks.map((chunk) => ({ title: '', body: chunk })),
    ''
  );
}

function splitByNumbered(raw) {
  const lines = raw.split('\n');
  const starts = [];
  lines.forEach((line, index) => {
    const explicit = /^\s*prompt\s*#?\s*(\d{1,3})\s*[.):\-\u2013\u2014]\s*(.+)$/i.exec(line);
    const generic = /^\s*(\d{1,3})\s*[.):\-\u2013\u2014]\s+(.+)$/.exec(line);
    const match = explicit || generic;
    if (match) starts.push({ index, title: match[2].trim(), explicit: Boolean(explicit) });
  });
  if (!starts.length) return [];

  // "Prompt 1:" labels are unambiguous even with only two of them; a bare
  // numbered list needs three entries before it is treated as a prompt set.
  const allExplicit = starts.every((start) => start.explicit);
  if (starts.length < 3 && !(allExplicit && starts.length >= 2)) return [];

  const sections = starts.map((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : lines.length;
    const body = [start.title, ...lines.slice(start.index + 1, end)].join('\n').trim();
    return { title: start.title, body };
  });

  const average = sections.reduce((sum, section) => sum + section.body.length, 0) / sections.length;
  if (!allExplicit && average < 40) return []; // an ordinary short list, not a prompt set
  return sectionPrompts(sections, '');
}

function splitByBullets(raw) {
  const lines = raw.split('\n');
  const items = [];
  let current = null;
  for (const line of lines) {
    const match = /^\s*[-*\u2022]\s+(.*)$/.exec(line);
    if (match) {
      if (current) items.push(current);
      current = [match[1]];
    } else if (current && line.trim()) {
      current.push(line.trim());
    } else if (current) {
      items.push(current);
      current = null;
    }
  }
  if (current) items.push(current);
  if (items.length < 3) return [];

  const bodies = items.map((parts) => parts.join(' ').trim()).filter((b) => b.length >= 40);
  if (bodies.length < 3) return [];
  return bodies.map((body) => ({ title: firstLineTitle(body) || 'Imported prompt', body }));
}

const MODES = ['auto', 'single', 'heading', 'numbered', 'delimiter', 'bullets'];

export function isSplitMode(mode) {
  return MODES.includes(mode);
}

/**
 * Split one big blob (a Keep note, a Google Doc, a markdown file...) into prompts.
 * @param {string} text
 * @param {{mode?: 'auto'|'single'|'heading'|'numbered'|'delimiter'|'bullets', title?: string}} options
 */
export function splitPrompts(text, options = {}) {
  const mode = isSplitMode(options.mode) ? options.mode : 'auto';
  const providedTitle = String(options.title || '').trim();
  const fallbackTitle = providedTitle || 'Imported prompt';
  const raw = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (!raw) return [];

  const single = () => {
    const body = raw.replace(/\n{3,}/g, '\n\n');
    if (body.length < 4) return [];
    return [{ title: providedTitle || firstLineTitle(body) || fallbackTitle, body }];
  };

  const pick = () => {
    if (mode === 'single') return single();
    if (mode === 'heading') return splitByHeadings(raw);
    if (mode === 'numbered') return splitByNumbered(raw);
    if (mode === 'delimiter') return splitByDelimiter(raw);
    if (mode === 'bullets') return splitByBullets(raw);

    // auto: use the most specific structure that yields at least two prompts
    for (const strategy of [splitByHeadings, splitByNumbered, splitByDelimiter, splitByBullets]) {
      const found = strategy(raw);
      if (found.length >= 2) return found;
    }
    return single();
  };

  let result = pick();
  if (mode !== 'single' && !result.length) result = single();
  return result.filter((p) => p.body.replace(/\s/g, '').length >= 4);
}

/* ---------- search ---------- */

function scorePrompt(prompt, needle, tokens) {
  const title = prompt.title.toLowerCase();
  const body = prompt.body.toLowerCase();
  const tags = (prompt.tags || []).join(' ').toLowerCase();
  const collection = (prompt.collection || '').toLowerCase();

  let score = 0;
  if (!needle) score = 1;
  else {
    if (title === needle) score += 200;
    if (title.startsWith(needle)) score += 80;
    if (title.includes(needle)) score += 50;
    if (tags.includes(needle)) score += 35;
    if (collection.includes(needle)) score += 20;
    if (body.includes(needle)) score += 15;
    for (const token of tokens) {
      if (title.includes(token)) score += 12;
      else if (tags.includes(token)) score += 8;
      else if (body.includes(token)) score += 3;
    }
    if (score === 0) return 0;
  }
  if (prompt.pinned) score += 25;
  score += Math.min(prompt.uses || 0, 20);
  return score;
}

/**
 * @param {Array} prompts
 * @param {{query?: string, collection?: string, tag?: string, source?: string, sort?: string}} filter
 */
export function searchPrompts(prompts, filter = {}) {
  const query = String(filter.query || '').trim().toLowerCase();
  const tokens = query.split(/\s+/).filter(Boolean);

  const filtered = prompts.filter((prompt) => {
    if (filter.collection && filter.collection !== 'all' && prompt.collection !== filter.collection) return false;
    if (filter.tag && filter.tag !== 'all' && !(prompt.tags || []).includes(filter.tag)) return false;
    if (filter.source && filter.source !== 'all' && prompt.source?.kind !== filter.source) return false;
    return true;
  });

  const scored = filtered
    .map((prompt) => ({ prompt, score: scorePrompt(prompt, query, tokens) }))
    .filter((entry) => entry.score > 0);

  const sort = filter.sort || 'relevance';
  if (sort === 'recent') scored.sort((a, b) => b.prompt.updatedAt - a.prompt.updatedAt);
  else if (sort === 'title') scored.sort((a, b) => a.prompt.title.localeCompare(b.prompt.title));
  else if (sort === 'uses') scored.sort((a, b) => (b.prompt.uses || 0) - (a.prompt.uses || 0));
  else scored.sort((a, b) => b.score - a.score || b.prompt.updatedAt - a.prompt.updatedAt);

  return scored.map((entry) => entry.prompt);
}

/** Counts used to build the filter chips. */
export function libraryFacets(prompts) {
  const collections = new Map();
  const tags = new Map();
  const sources = new Map();
  for (const prompt of prompts) {
    collections.set(prompt.collection || 'Library', (collections.get(prompt.collection || 'Library') || 0) + 1);
    for (const tag of prompt.tags || []) tags.set(tag, (tags.get(tag) || 0) + 1);
    const kind = prompt.source?.kind || 'manual';
    sources.set(kind, (sources.get(kind) || 0) + 1);
  }
  const top = (map, limit) =>
    [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([value, count]) => ({ value, count }));
  return {
    collections: top(collections, 12),
    tags: top(tags, 24),
    sources: top(sources, 8),
  };
}
