// Google Keep importers.
//
// Google has no consumer Keep API (the Workspace Keep API is enterprise-only and
// needs domain-wide delegation), so the supported path is Google Takeout, which
// exports every note as an HTML file inside Takeout/Keep/. Those files are read
// straight out of the zip, plus a JSON path for Keep API dumps or hand exports.

import { isZipBuffer, readZip } from './zip.js';
import { decodeEntities, htmlToText, stripTags } from './html.js';

function firstMatch(html, pattern) {
  const match = pattern.exec(html);
  return match ? match[1] : '';
}

/**
 * Parse a single Takeout note HTML file.
 * @returns {{title: string, body: string, labels: string[], archived: boolean, sourceUrl: string}|null}
 */
export function parseKeepNoteHtml(html, fallbackTitle = '') {
  const text = String(html || '');
  if (!text.trim()) return null;

  const title =
    decodeEntities(stripTags(firstMatch(text, /<div[^>]+class="[^"]*\btitle\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i))).trim() ||
    decodeEntities(firstMatch(text, /<title[^>]*>([\s\S]*?)<\/title>/i)).trim() ||
    fallbackTitle;

  const textContent = firstMatch(text, /<div[^>]+class="[^"]*\btext-content\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<|$)/i);
  let body = htmlToText(textContent);

  if (!body) {
    const listHtml = firstMatch(text, /<ul[^>]+class="[^"]*\blist-content\b[^"]*"[^>]*>([\s\S]*?)<\/ul>/i);
    if (listHtml) {
      const items = [...listHtml.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => htmlToText(m[1])).filter(Boolean);
      body = items.map((item) => `- ${item}`).join('\n');
    }
  }

  if (!body) {
    // Last resort: the whole .content block minus labels/chips.
    const content = firstMatch(text, /<div[^>]+class="[^"]*\bcontent\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/body>/i);
    if (content) body = htmlToText(content);
  }

  if (!body) return null;

  const labels = [...text.matchAll(/<span[^>]+class="[^"]*(?:label-name|label)\b[^"]*"[^>]*>([\s\S]*?)<\/span>/gi)]
    .map((m) => decodeEntities(stripTags(m[1])).trim())
    .filter(Boolean);

  return {
    title: title || fallbackTitle || 'Keep note',
    body,
    labels: [...new Set(labels)].slice(0, 20),
    archived: /class="[^"]*\barchived\b/i.test(text),
  };
}

function noteTitleFromFilename(path) {
  const name = path.split('/').pop() || '';
  return name
    .replace(/\.html?$/i, '')
    .replace(/\s*\(\d+\)$/, '')
    .trim();
}

function looksLikeKeepPath(path) {
  return /(^|\/)Keep\//i.test(path) && /\.html?$/i.test(path);
}

/**
 * Extract prompts from a Takeout zip (or a folder of Keep HTML files).
 * @param {ArrayBuffer} buffer
 * @returns {Promise<Array<{title:string, body:string, tags:string[], collection:string, source:object}>>}
 */
export async function importKeepTakeoutZip(buffer) {
  if (!isZipBuffer(buffer)) throw new Error('That file is not a zip archive.');
  const entries = await readZip(buffer);
  const decoder = new TextDecoder();
  const prompts = [];
  const collection = 'Google Keep';

  for (const [path, bytes] of entries) {
    if (!looksLikeKeepPath(path)) continue;
    const html = decoder.decode(bytes);
    const note = parseKeepNoteHtml(html, noteTitleFromFilename(path));
    if (!note || note.archived) continue;
    prompts.push({
      title: note.title,
      body: note.body,
      tags: note.labels,
      collection,
      source: { kind: 'keep', label: collection, ref: path },
    });
  }

  if (!prompts.length) {
    const hasKeepFolder = [...entries.keys()].some((p) => /(^|\/)Keep\//i.test(p));
    throw new Error(
      hasKeepFolder
        ? 'The Keep folder in this archive has no readable HTML notes.'
        : 'No Takeout/Keep notes found in this zip. In Takeout, select only Keep and keep the default HTML format.'
    );
  }
  return prompts;
}

/** Import loose .html files exported from Keep. */
export async function importKeepHtmlFiles(files, collection = 'Google Keep') {
  const prompts = [];
  for (const file of files) {
    const html = await file.text();
    const note = parseKeepNoteHtml(html, noteTitleFromFilename(file.name));
    if (!note || note.archived) continue;
    prompts.push({
      title: note.title,
      body: note.body,
      tags: note.labels,
      collection,
      source: { kind: 'keep', label: collection, ref: file.name },
    });
  }
  return prompts;
}

/**
 * Accept Keep API JSON (`{name, title, body:{text:{text}}, labels:[...]}`),
 * arrays of notes, or a simple `{notes:[...]}` wrapper.
 */
export function importKeepJson(text, collection = 'Google Keep') {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }

  const notes = Array.isArray(data) ? data : Array.isArray(data.notes) ? data.notes : Array.isArray(data.items) ? data.items : [data];
  const prompts = [];

  for (const note of notes) {
    if (!note || typeof note !== 'object') continue;
    const body =
      note.body?.text?.text ??
      note.body?.text ??
      note.textContent ??
      note.text ??
      note.body ??
      note.content ??
      '';
    const title = note.title || note.subject || 'Keep note';
    const labels = Array.isArray(note.labels)
      ? note.labels.map((label) => (typeof label === 'string' ? label : label?.name || '')).filter(Boolean)
      : Array.isArray(note.tags)
        ? note.tags
        : [];
    if (!String(body).trim()) continue;
    prompts.push({
      title: String(title),
      body: String(body),
      tags: labels,
      collection,
      source: { kind: 'keep', label: collection, ref: note.name || '' },
    });
  }

  if (!prompts.length) throw new Error('No notes with text were found in that JSON.');
  return prompts;
}
