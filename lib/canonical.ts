const TRACKING_PARAMS = [/^utm_/i, /^fbclid$/i, /^gclid$/i, /^mc_cid$/i, /^mc_eid$/i, /^ref$/i, /^source$/i];

/** Canonical URL used for first-pass deduplication. */
export function canonicalUrl(raw: string): string {
  const input = String(raw || '').trim();
  if (!input) return '';
  try {
    const url = new URL(input);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');

    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.some((pattern) => pattern.test(key))) url.searchParams.delete(key);
    }
    url.searchParams.sort();

    let pathname = url.pathname.replace(/\/{2,}/g, '/');
    if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '');
    url.pathname = pathname;

    return url.toString();
  } catch {
    return input.toLowerCase();
  }
}

export function hostOf(raw: string): string {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}
