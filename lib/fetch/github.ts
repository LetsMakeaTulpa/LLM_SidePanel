import { getOrFetch } from '../cache/fetch-cache';

export interface CodeHit {
  repo: string;
  path: string;
  url: string;
  fragment: string;
}

export function githubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN);
}

/** GitHub code search. Requires GITHUB_TOKEN; otherwise returns []. */
export async function githubCodeSearch(query: string, limit = 5): Promise<CodeHit[]> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return [];

  const url = `https://api.github.com/search/code?q=${encodeURIComponent(query)}&per_page=${limit}`;
  try {
    const page = await getOrFetch(url, {
      accept: 'application/vnd.github.text-match+json',
      headers: {
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
    });
    if (!page || page.status >= 400) return [];

    const parsed = JSON.parse(page.body) as { items?: unknown };
    if (!Array.isArray(parsed.items)) return [];

    return parsed.items
      .slice(0, limit)
      .map((raw) => {
        const item = raw as Record<string, unknown>;
        const repository = item.repository as Record<string, unknown> | undefined;
        const matches = Array.isArray(item.text_matches) ? item.text_matches : [];
        const fragment = matches
          .map((match) => String((match as Record<string, unknown>).fragment ?? ''))
          .filter(Boolean)
          .join('\n')
          .slice(0, 1200);
        return {
          repo: String(repository?.full_name ?? ''),
          path: String(item.path ?? ''),
          url: String(item.html_url ?? ''),
          fragment,
        };
      })
      .filter((hit) => hit.url.startsWith('http'));
  } catch {
    return [];
  }
}
