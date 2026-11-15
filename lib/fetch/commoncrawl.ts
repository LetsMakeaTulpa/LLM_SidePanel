import { getOrFetch } from '../cache/fetch-cache';

export interface CrawlRecord {
  url: string;
  status: string;
  mime: string;
  timestamp: string;
}

const COLLINFO_URL = 'https://index.commoncrawl.org/collinfo.json';

let cachedIndex: { endpoint: string; at: number } | null = null;

async function latestIndexEndpoint(): Promise<string | null> {
  const override = process.env.COMMON_CRAWL_INDEX;
  if (override) return override;

  if (cachedIndex && Date.now() - cachedIndex.at < 60 * 60 * 1000) return cachedIndex.endpoint;

  const page = await getOrFetch(COLLINFO_URL, { accept: 'application/json' });
  if (!page || page.status >= 400) return null;

  const parsed = JSON.parse(page.body) as Array<Record<string, unknown>>;
  const id = parsed[0]?.id;
  if (typeof id !== 'string') return null;

  const endpoint = `https://index.commoncrawl.org/${id}-index`;
  cachedIndex = { endpoint, at: Date.now() };
  return endpoint;
}

export function commonCrawlQueryUrl(endpoint: string, target: string, limit: number): string {
  return `${endpoint}?url=${encodeURIComponent(target)}&output=json&limit=${limit}`;
}

/** Common Crawl index rows for a URL or domain. Fail-open. */
export async function commonCrawlLookup(target: string, limit = 5): Promise<CrawlRecord[]> {
  try {
    const endpoint = await latestIndexEndpoint();
    if (!endpoint) return [];

    const page = await getOrFetch(commonCrawlQueryUrl(endpoint, target, limit), { accept: 'application/json' });
    if (!page || page.status >= 400) return [];

    return page.body
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, limit)
      .flatMap((line) => {
        try {
          const row = JSON.parse(line) as Record<string, unknown>;
          return [
            {
              url: String(row.url ?? ''),
              status: String(row.status ?? ''),
              mime: String(row.mime ?? ''),
              timestamp: String(row.timestamp ?? ''),
            },
          ];
        } catch {
          return [];
        }
      })
      .filter((record) => record.url);
  } catch {
    return [];
  }
}
