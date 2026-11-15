export const EXTRACTOR_VERSION = 'html-text-v1';
export const EVIDENCE_MAX_CHARS = Number(process.env.EVIDENCE_MAX_CHARS || 12_000);

const ENTITIES: Record<string, string> = {
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
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, entity: string) => {
    if (entity.startsWith('#')) {
      const code =
        entity[1]?.toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[entity.toLowerCase()] ?? whole;
  });
}

function normalize(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function cap(text: string): string {
  return text.length > EVIDENCE_MAX_CHARS ? `${text.slice(0, EVIDENCE_MAX_CHARS)}\n[...truncated]` : text;
}

export function extractTitle(html: string): string {
  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html);
  if (og?.[1]) return decodeEntities(og[1]).trim();
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return title?.[1] ? decodeEntities(title[1]).trim() : '';
}

/** Convert an HTML/JSON/text response into bounded plain text evidence. */
export function extractText(body: string, contentType: string): { text: string; title: string } {
  if (!body) return { text: '', title: '' };

  if (/json/i.test(contentType)) {
    try {
      return { text: cap(JSON.stringify(JSON.parse(body), null, 2)), title: '' };
    } catch {
      return { text: cap(normalize(body)), title: '' };
    }
  }

  const looksLikeHtml = /html|xml/i.test(contentType) || /<(html|body|article|main)[\s>]/i.test(body);
  if (!looksLikeHtml) return { text: cap(normalize(body)), title: '' };

  const title = extractTitle(body);
  let html = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|template|svg|canvas|nav|footer|header|aside|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote|pre)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ');

  html = decodeEntities(html);
  return { text: cap(normalize(html)), title };
}
