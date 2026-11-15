import type { ZodType } from 'zod';
import { sleep } from './async';
import { llmSemaphore } from './queue';
import type { LlmRole, RoleConfig } from './types';

export class LlmUnavailableError extends Error {
  constructor(message = 'FEATHERLESS_API_KEY is not set; live investigation and evals need it.') {
    super(message);
    this.name = 'LlmUnavailableError';
  }
}

const BASE_URL = (process.env.FEATHERLESS_BASE_URL || 'https://api.featherless.ai/v1').replace(/\/+$/, '');

function envModel(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

/** Per-role model + parameter map. Override models through env, not code. */
export const ROLE_CONFIG: Record<LlmRole, RoleConfig> = {
  planner: {
    model: envModel('ROLE_PLANNER_MODEL', 'Qwen/Qwen2.5-72B-Instruct'),
    temperature: 0.2,
    max_tokens: 700,
    timeout_ms: 60_000,
  },
  synthesizer: {
    model: envModel('ROLE_SYNTH_MODEL', 'deepseek-ai/DeepSeek-V3-0324'),
    temperature: 0.1,
    max_tokens: 1800,
    timeout_ms: 90_000,
  },
  gapfinder: {
    model: envModel('ROLE_GAP_MODEL', 'Qwen/Qwen2.5-72B-Instruct'),
    temperature: 0.3,
    max_tokens: 700,
    timeout_ms: 60_000,
  },
};

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function llmAvailable(): boolean {
  return Boolean(process.env.FEATHERLESS_API_KEY);
}

function abortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

function combineSignals(caller: AbortSignal | undefined, timeout: AbortSignal): AbortSignal {
  if (!caller) return timeout;
  const controller = new AbortController();
  const abort = () => controller.abort();
  caller.addEventListener('abort', abort, { once: true });
  timeout.addEventListener('abort', abort, { once: true });
  return controller.signal;
}

/** One completion. All calls share the process-wide semaphore (max 3). */
export async function chat(
  role: LlmRole,
  messages: ChatMessage[],
  options: { signal?: AbortSignal } = {}
): Promise<string> {
  const apiKey = process.env.FEATHERLESS_API_KEY;
  if (!apiKey) throw new LlmUnavailableError();

  const config = ROLE_CONFIG[role];
  const body = JSON.stringify({
    model: config.model,
    messages,
    temperature: config.temperature,
    max_tokens: config.max_tokens,
  });

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (options.signal?.aborted) throw abortError();
    const timeout = AbortSignal.timeout(config.timeout_ms);
    const signal = combineSignals(options.signal, timeout);

    try {
      const response = await llmSemaphore.run(() =>
        fetch(`${BASE_URL}/chat/completions`, {
          method: 'POST',
          signal,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body,
        })
      );

      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        const error = new Error(`Featherless ${response.status}: ${detail || response.statusText}`);
        if (response.status === 429 || response.status >= 500) {
          lastError = error;
          await sleep(400 * 2 ** attempt);
          continue;
        }
        throw error;
      }

      const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = payload.choices?.[0]?.message?.content;
      if (!content?.trim()) throw new Error('Featherless returned an empty completion');
      return content;
    } catch (error) {
      if (options.signal?.aborted) throw abortError();
      const name = error instanceof Error ? error.name : '';
      if (name === 'TimeoutError') throw new Error(`Featherless ${role} call timed out after ${config.timeout_ms}ms`);
      if (name === 'AbortError') throw error;
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === 2) break;
      await sleep(400 * 2 ** attempt);
    }
  }

  throw lastError ?? new Error('Featherless request failed');
}

export function parseJsonLoose(text: string): unknown {
  const trimmed = String(text || '').trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = (fenced?.[1] ?? trimmed).trim();

  try {
    return JSON.parse(candidate);
  } catch {
    // Fall through to brace extraction.
  }

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object found in model output');
  return JSON.parse(candidate.slice(start, end + 1));
}

/** Validate model JSON at the boundary; retry once with the validator's complaint. */
export async function chatJson<T>(role: LlmRole, messages: ChatMessage[], schema: ZodType<T>): Promise<T> {
  let feedback = '';
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt: ChatMessage[] = feedback
      ? [...messages, { role: 'user', content: `The previous reply did not validate: ${feedback}. Return corrected JSON only.` }]
      : messages;

    const content = await chat(role, prompt);
    try {
      return schema.parse(parseJsonLoose(content));
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      feedback = lastError.message.slice(0, 400);
    }
  }

  throw new Error(`Invalid JSON from ${role}: ${lastError?.message ?? 'unknown validation error'}`);
}
