import { getOrFetch } from '../cache/fetch-cache';
import { getSnapshot, saveSnapshot } from '../cache/db';
import { nowIso } from '../hash';

export interface CdxRow {
  timestamp: string;
  original: string;
  statuscode: string;
  mimetype: string;
  digest: string;
}

const CDX_ENDPOINT = 'https://web.archive.org/cdx/search/cdx';

export function cdxQueryUrl(target: string, limit = 5): string {
  return `${CDX_ENDPOINT}?url=${encodeURIComponent(target)}&output=json&fl=timestamp,original,statuscode,mimetype,digest&filter=statuscode:200&collapse=digest&limit=${limit}`;
}

/** Historical snapshots from the Wayback CDX index. Fail-open. */
export async function waybackLookup(target: string, limit = 5): Promise<CdxRow[]> {
  try {
    const page = await getOrFetch(cdxQueryUrl(target, limit), { accept: 'application/json' });
    if (!page || page.status >= 400) return [];

    const parsed: unknown = JSON.parse(page.body);
    if (!Array.isArray(parsed) || parsed.length < 2) return [];

    return (parsed.slice(1) as unknown[][])
      .map((row) => ({
        timestamp: String(row[0] ?? ''),
        original: String(row[1] ?? ''),
        statuscode: String(row[2] ?? ''),
        mimetype: String(row[3] ?? ''),
        digest: String(row[4] ?? ''),
      }))
      .filter((row) => row.original);
  } catch {
    return [];
  }
}

export function archiveUrl(timestamp: string, original: string): string {
  return `https://web.archive.org/web/${timestamp}/${original}`;
}

/**
 * Snapshot a cited URL to Wayback. Cached per URL so repeated investigations and
 * repeated citations do not hammer the save endpoint.
 */
export async function ensureSnapshot(target: string): Promise<string | null> {
  const existing = getSnapshot(target);
  if (existing) return existing.snapshotUrl;

  try {
    const page = await getOrFetch(`https://web.archive.org/save/${encodeURIComponent(target)}`, {
      forceRefresh: true,
      accept: 'text/html',
    });
    const snapshot = page && page.status < 400 && /\/web\/\d+/.test(page.finalUrl) ? page.finalUrl : null;
    saveSnapshot(target, snapshot, nowIso());
    return snapshot;
  } catch {
    try {
      saveSnapshot(target, null, nowIso());
    } catch {
      /* cache write is best effort */
    }
    return null;
  }
}
