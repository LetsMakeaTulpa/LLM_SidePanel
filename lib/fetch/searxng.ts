import { getOrFetch } from '../cache/fetch-cache';

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  engine?: string;
}

export function searxngConfigured(): boolean {
  return Boolean(process.env.SEARXNG_URL);
}

/** Query a SearXNG instance. Missing configuration and failures return []. */
export async function searchWeb(query: string, limit = 8): Promise<SearchHit[]> {
  const base = process.env.SEARXNG_URL;
  if (!base) return [];

  const url = `${base.replace(/\/+$/, '')}/search?q=${encodeURIComponent(query)}&format=json&safesearch=1`;
  try {
    const page = await getOrFetch(url, { accept: 'application/json' });
    if (!page || page.status >= 400) return [];

    const parsed = JSON.parse(page.body) as { results?: unknown };
    if (!Array.isArray(parsed.results)) return [];

    return parsed.results
      .slice(0, limit)
      .map((raw) => {
        const hit = raw as Record<string, unknown>;
        return {
          title: String(hit.title ?? '').trim(),
          url: String(hit.url ?? '').trim(),
          snippet: String(hit.content ?? hit.snippet ?? '').trim(),
          engine: typeof hit.engine === 'string' ? hit.engine : undefined,
        };
      })
      .filter((hit) => hit.url.startsWith('http'));
  } catch {
    return [];
  }
}
