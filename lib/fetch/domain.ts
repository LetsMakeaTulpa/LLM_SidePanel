import { hostOf } from '../canonical';

/** Pull a registrable-ish domain out of a URL or a free-text query. */
export function extractDomain(input: string): string | null {
  const text = String(input || '').trim();
  if (!text) return null;

  if (/^https?:\/\//i.test(text)) {
    const host = hostOf(text);
    return host || null;
  }

  const match = /(?:^|[\s(])((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,})(?=$|[\s)])/i.exec(text);
  return match?.[1] ? match[1].toLowerCase() : null;
}

export function isHttpUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
