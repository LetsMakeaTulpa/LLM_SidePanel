// Provider registry + streaming transport.
// Every provider is either `openai`-shaped (the overwhelming majority, including
// local servers) or has a small native adapter (Anthropic, Gemini, Chrome's
// built-in model).

import { chromeAiStream } from './chrome-ai.js';

export const PROVIDERS = {
  builtin: {
    label: 'Chrome built-in AI (Gemini Nano)',
    kind: 'chrome-ai',
    needsKey: false,
    free: true,
    models: ['gemini-nano'],
    defaultModel: 'gemini-nano',
  },
  openai: {
    label: 'OpenAI',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys',
    models: ['gpt-5', 'gpt-5-mini', 'gpt-4.1', 'gpt-4o', 'o4-mini'],
    defaultModel: 'gpt-5-mini',
  },
  anthropic: {
    label: 'Anthropic Claude',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    models: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5', 'claude-3-7-sonnet-latest'],
    defaultModel: 'claude-sonnet-4-5',
  },
  google: {
    label: 'Google Gemini',
    kind: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    keyUrl: 'https://aistudio.google.com/apikey',
    freeTier: true,
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
    defaultModel: 'gemini-2.5-flash',
  },
  mistral: {
    label: 'Mistral',
    kind: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    keyUrl: 'https://console.mistral.ai/api-keys',
    freeTier: true,
    models: ['mistral-small-latest', 'mistral-large-latest', 'codestral-latest'],
    defaultModel: 'mistral-small-latest',
  },
  groq: {
    label: 'Groq',
    kind: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyUrl: 'https://console.groq.com/keys',
    freeTier: true,
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'qwen-2.5-32b'],
    defaultModel: 'llama-3.3-70b-versatile',
  },
  openrouter: {
    label: 'OpenRouter (hundreds of models)',
    kind: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
    freeTier: true,
    models: [
      'meta-llama/llama-3.3-70b-instruct:free',
      'deepseek/deepseek-chat-v3-0324:free',
      'google/gemini-2.0-flash-exp:free',
      'openai/gpt-5',
      'anthropic/claude-sonnet-4.5',
    ],
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
  },
  deepseek: {
    label: 'DeepSeek',
    kind: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultModel: 'deepseek-chat',
  },
  xai: {
    label: 'xAI Grok',
    kind: 'openai',
    baseUrl: 'https://api.x.ai/v1',
    keyUrl: 'https://console.x.ai',
    models: ['grok-4', 'grok-3', 'grok-3-mini'],
    defaultModel: 'grok-4',
  },
  together: {
    label: 'Together AI',
    kind: 'openai',
    baseUrl: 'https://api.together.xyz/v1',
    keyUrl: 'https://api.together.ai/settings/api-keys',
    models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'Qwen/Qwen2.5-72B-Instruct-Turbo'],
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  },
  perplexity: {
    label: 'Perplexity',
    kind: 'openai',
    baseUrl: 'https://api.perplexity.ai',
    keyUrl: 'https://www.perplexity.ai/settings/api',
    models: ['sonar-pro', 'sonar'],
    defaultModel: 'sonar',
  },
  cerebras: {
    label: 'Cerebras',
    kind: 'openai',
    baseUrl: 'https://api.cerebras.ai/v1',
    keyUrl: 'https://cloud.cerebras.ai',
    models: ['llama-3.3-70b', 'qwen-3-32b'],
    defaultModel: 'llama-3.3-70b',
  },
  ollama: {
    label: 'Ollama (free, local)',
    kind: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    needsKey: false,
    free: true,
    models: ['llama3.2', 'qwen3', 'mistral', 'gemma3'],
    defaultModel: 'llama3.2',
  },
  lmstudio: {
    label: 'LM Studio (free, local)',
    kind: 'openai',
    baseUrl: 'http://localhost:1234/v1',
    needsKey: false,
    free: true,
    models: ['local-model'],
    defaultModel: 'local-model',
  },
  custom: {
    label: 'Custom OpenAI-compatible endpoint',
    kind: 'openai',
    baseUrl: '',
    editableBase: true,
    models: [],
    defaultModel: '',
  },
};

export function getProvider(providerId) {
  return PROVIDERS[providerId] || PROVIDERS.openai;
}

/** Resolved provider config for the current settings. */
export function providerConfig(providerId, settings) {
  const meta = getProvider(providerId);
  const baseUrl = meta.editableBase ? settings.customBaseUrl || '' : meta.baseUrl;
  const model = (settings.model || '').trim() || meta.defaultModel;
  const apiKey = settings.apiKeys?.[providerId] || '';
  const needsKey = meta.needsKey !== false;
  const needsBaseUrl = meta.kind !== 'chrome-ai';
  return {
    id: providerId,
    ...meta,
    baseUrl,
    model,
    apiKey,
    needsKey,
    ready: (!needsBaseUrl || Boolean(baseUrl)) && (!needsKey || Boolean(apiKey)) && Boolean(model),
  };
}

export function providerLabel(providerId, settings) {
  const cfg = providerConfig(providerId, settings);
  return `${cfg.label}${cfg.model ? ` · ${cfg.model}` : ''}`;
}

/* ---------- transport ---------- */

function endpoint(baseUrl, path) {
  return `${String(baseUrl).replace(/\/+$/, '')}${path}`;
}

async function readError(res, label) {
  let detail = '';
  try {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      detail = json?.error?.message || json?.message || json?.error || text;
    } catch {
      detail = text;
    }
  } catch {
    /* ignore */
  }
  const message = `${label} request failed (${res.status})${detail ? `: ${String(detail).slice(0, 400)}` : ''}`;
  const error = new Error(message);
  error.status = res.status;
  return error;
}

function isEventStream(res) {
  return (res.headers.get('content-type') || '').includes('text/event-stream');
}

async function* sseEvents(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event = '';
  let data = [];

  const flush = function* () {
    if (!data.length) return;
    yield { event, data: data.join('\n') };
    event = '';
    data = [];
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let cut;
    while ((cut = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, cut).replace(/\r$/, '');
      buffer = buffer.slice(cut + 1);
      if (!line) {
        yield* flush();
        continue;
      }
      if (line.startsWith(':')) continue;
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
  }
  if (buffer.trim()) {
    const line = buffer.trim();
    if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  yield* flush();
}

function messagePlainText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .filter(Boolean)
      .join('\n');
  }
  return String(content ?? '');
}

async function* openaiStream(cfg, messages, system, opts, signal) {
  const body = {
    model: cfg.model,
    stream: true,
    messages: system ? [{ role: 'system', content: system }, ...messages] : messages,
  };
  if (opts.temperature != null && opts.temperature !== '') body.temperature = Number(opts.temperature);

  const res = await fetch(endpoint(cfg.baseUrl, '/chat/completions'), {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      ...(cfg.id === 'openrouter' ? { 'HTTP-Referer': 'https://github.com/LetsMakeaTulpa/LLM_SidePanel', 'X-Title': 'LLM Side Panel' } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw await readError(res, cfg.label);

  if (!isEventStream(res)) {
    const json = await res.json();
    yield json?.choices?.[0]?.message?.content || '';
    return;
  }

  for await (const evt of sseEvents(res)) {
    if (evt.data === '[DONE]') return;
    let json;
    try {
      json = JSON.parse(evt.data);
    } catch {
      continue;
    }
    if (json.error) throw new Error(`${cfg.label}: ${json.error.message || 'stream error'}`);
    const choice = json.choices?.[0];
    const delta = choice?.delta?.content ?? choice?.message?.content;
    if (delta) yield delta;
  }
}

async function* anthropicStream(cfg, messages, system, opts, signal) {
  const body = {
    model: cfg.model,
    max_tokens: Number(opts.maxTokens) || 2048,
    stream: true,
    messages: messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: messagePlainText(m.content) })),
  };
  if (system) body.system = system;
  if (opts.temperature != null && opts.temperature !== '') body.temperature = Number(opts.temperature);

  const res = await fetch(endpoint(cfg.baseUrl, '/messages'), {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw await readError(res, cfg.label);

  if (!isEventStream(res)) {
    const json = await res.json();
    yield (json?.content || []).map((part) => part.text || '').join('');
    return;
  }

  for await (const evt of sseEvents(res)) {
    let json;
    try {
      json = JSON.parse(evt.data);
    } catch {
      continue;
    }
    if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') yield json.delta.text;
    if (json.type === 'error') throw new Error(`${cfg.label}: ${json.error?.message || 'stream error'}`);
  }
}

async function* googleStream(cfg, messages, system, opts, signal) {
  const model = cfg.model.replace(/^models\//, '');
  const url = `${endpoint(cfg.baseUrl, `/models/${encodeURIComponent(model)}:streamGenerateContent`)}?alt=sse&key=${encodeURIComponent(cfg.apiKey)}`;

  const body = {
    contents: messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: messagePlainText(m.content) }],
    })),
    generationConfig: {},
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (opts.temperature != null && opts.temperature !== '') body.generationConfig.temperature = Number(opts.temperature);
  if (opts.maxTokens) body.generationConfig.maxOutputTokens = Number(opts.maxTokens);

  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw await readError(res, cfg.label);

  const textOf = (json) =>
    (json?.candidates?.[0]?.content?.parts || [])
      .map((part) => part.text || '')
      .filter(Boolean)
      .join('');

  if (!isEventStream(res)) {
    yield textOf(await res.json());
    return;
  }

  for await (const evt of sseEvents(res)) {
    if (!evt.data || evt.data === '[DONE]') continue;
    let json;
    try {
      json = JSON.parse(evt.data);
    } catch {
      continue;
    }
    const text = textOf(json);
    if (text) yield text;
  }
}

/**
 * Stream a chat completion.
 * @param {{settings: object, messages: Array, system?: string, signal?: AbortSignal}} options
 * @returns {AsyncGenerator<string>} delta chunks
 */
export async function* streamChat({ settings, messages, system, signal, onStatus }) {
  const cfg = providerConfig(settings.providerId, settings);
  if (cfg.kind !== 'chrome-ai' && !cfg.baseUrl) throw new Error('No API base URL configured. Open Settings.');
  if (cfg.needsKey && !cfg.apiKey) throw new Error(`No API key for ${cfg.label}. Open Settings to add one.`);
  if (!cfg.model) throw new Error('No model selected. Open Settings.');

  const opts = { temperature: settings.temperature, maxTokens: settings.maxTokens };
  const trimmed = messages.slice(-20).map((m) => ({
    role: m.role,
    content: messagePlainText(m.content),
  }));

  if (cfg.kind === 'chrome-ai') yield* chromeAiStream({ messages: trimmed, system, signal, onStatus });
  else if (cfg.kind === 'anthropic') yield* anthropicStream(cfg, trimmed, system, opts, signal);
  else if (cfg.kind === 'google') yield* googleStream(cfg, trimmed, system, opts, signal);
  else yield* openaiStream(cfg, trimmed, system, opts, signal);
}
