export const FETCH_USER_AGENT = 'investigation-agent/0.1 (+https://github.com/LetsMakeaTulpa/LLM_SidePanel)';

export const TOOL_TIMEOUT_MS = Number(process.env.TOOL_TIMEOUT_MS || 10_000);

export interface FetchedText {
  text: string;
  status: number;
  contentType: string;
  finalUrl: string;
}

export interface FetchTextOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  accept?: string;
}

/** Fetch text with a hard timeout. Throws on network/HTTP-layer failure. */
export async function fetchText(url: string, options: FetchTextOptions = {}): Promise<FetchedText> {
  const timeoutMs = options.timeoutMs ?? TOOL_TIMEOUT_MS;
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'user-agent': FETCH_USER_AGENT,
      accept: options.accept ?? 'text/html,application/json,text/plain;q=0.9,*/*;q=0.5',
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  return {
    text,
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    finalUrl: response.url || url,
  };
}

/** Fail-open variant: any failure becomes null. */
export async function tryFetchText(url: string, options: FetchTextOptions = {}): Promise<FetchedText | null> {
  try {
    return await fetchText(url, options);
  } catch {
    return null;
  }
}
