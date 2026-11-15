import { getOrFetch } from '../cache/fetch-cache';

export interface CertRecord {
  names: string[];
  issuer: string;
  notBefore: string;
}

export function crtshQueryUrl(domain: string): string {
  return `https://crt.sh/?q=${encodeURIComponent(`%.${domain}`)}&output=json`;
}

/** Certificate transparency lookup for a domain. Fail-open. */
export async function crtshLookup(domain: string, limit = 5): Promise<CertRecord[]> {
  try {
    const page = await getOrFetch(crtshQueryUrl(domain), { accept: 'application/json' });
    if (!page || page.status >= 400) return [];

    const parsed = JSON.parse(page.body) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .slice(0, limit)
      .map((raw) => {
        const row = raw as Record<string, unknown>;
        return {
          names: String(row.name_value ?? '')
            .split('\n')
            .map((name) => name.trim())
            .filter(Boolean)
            .slice(0, 6),
          issuer: String(row.issuer_name ?? ''),
          notBefore: String(row.not_before ?? ''),
        };
      })
      .filter((record) => record.names.length > 0);
  } catch {
    return [];
  }
}
