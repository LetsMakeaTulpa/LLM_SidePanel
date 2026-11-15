// Tolerant HTML -> text helpers. Regex based on purpose: they must run in the
// side panel, in the service worker (where DOMParser is missing) and in tests.

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '\u2013',
  mdash: '\u2014',
  hellip: '\u2026',
  rsquo: '\u2019',
  lsquo: '\u2018',
  ldquo: '\u201c',
  rdquo: '\u201d',
  bull: '\u2022',
  middot: '\u00b7',
};

export function decodeEntities(text) {
  return String(text || '').replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, entity) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    const lower = entity.toLowerCase();
    return ENTITIES[lower] ?? whole;
  });
}

export function stripTags(html) {
  return String(html || '').replace(/<[^>]*>/g, '');
}

/** Convert an HTML fragment to readable plain text, keeping list + line structure. */
export function htmlToText(html) {
  let out = String(html || '');
  out = out.replace(/<!--[\s\S]*?-->/g, '');
  out = out.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '');
  out = out.replace(/<br\s*\/?>/gi, '\n');
  out = out.replace(/<\/(p|div|section|h[1-6]|tr|blockquote|pre)>/gi, '\n');
  out = out.replace(/<li[^>]*>/gi, '\n- ');
  out = out.replace(/<\/(ul|ol)>/gi, '\n');
  out = out.replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, '\n[image: $1]\n');
  out = stripTags(out);
  out = decodeEntities(out);
  return out
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function htmlTitle(html) {
  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html);
  if (og) return decodeEntities(og[1]).trim();
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (title) return decodeEntities(title[1]).trim();
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  return h1 ? decodeEntities(stripTags(h1[1])).trim() : '';
}
