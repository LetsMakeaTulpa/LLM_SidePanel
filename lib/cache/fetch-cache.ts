import { cacheGet, cachePut, type CachedPage } from './db';
import { fetchText, tryFetchText, type FetchTextOptions } from '../fetch/http';
import { nowIso, today } from '../hash';

const MAX_CACHE_BYTES = Number(process.env.MAX_CACHE_BYTES || 2_000_000);

export interface GetOrFetchOptions extends FetchTextOptions {
  forceRefresh?: boolean;
}

/**
 * Every outbound fetch goes through here. Responses are cached in SQLite keyed
 * by URL + UTC date, so a rerun on the same day is offline and deterministic.
 */
export async function getOrFetch(url: string, options: GetOrFetchOptions = {}): Promise<CachedPage | null> {
  const day = today();
  if (!options.forceRefresh) {
    const hit = cacheGet(url, day);
    if (hit) return hit;
  }

  const response = await tryFetchText(url, options);
  if (!response) return null;

  const page: CachedPage = {
    url,
    day,
    status: response.status,
    contentType: response.contentType,
    body: response.text.length > MAX_CACHE_BYTES ? response.text.slice(0, MAX_CACHE_BYTES) : response.text,
    fetchedAt: nowIso(),
    finalUrl: response.finalUrl,
  };

  try {
    cachePut(page);
  } catch {
    // A cache write must never fail a tool.
  }
  return page;
}

/** Throwing fetch for callers that want to distinguish cached vs network errors. */
export async function getOrFetchOrThrow(url: string, options: GetOrFetchOptions = {}): Promise<CachedPage> {
  const page = await getOrFetch(url, options);
  if (!page) throw new Error(`Fetch failed: ${url}`);
  return page;
}

export async function fetchDirect(url: string, options: FetchTextOptions = {}) {
  return fetchText(url, options);
}
