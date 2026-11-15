// Chrome's built-in Prompt API (Gemini Nano).
//
// Stable for extensions since Chrome 138. Free and on-device: no API key, no
// network request, and the page text never leaves the machine. The model itself
// is downloaded by Chrome on first use (a few GB) on capable hardware.

function modelApi() {
  if (typeof globalThis.LanguageModel !== 'undefined') return globalThis.LanguageModel;
  // Older Chrome builds exposed the legacy namespace; probe both.
  return globalThis.ai?.languageModel || null;
}

export function chromeAiPresent() {
  return Boolean(modelApi());
}

async function availabilityOf(api) {
  try {
    if (typeof api.availability === 'function') return await api.availability();
    if (typeof api.capabilities === 'function') {
      const caps = await api.capabilities();
      if (caps?.available === 'readily') return 'available';
      if (caps?.available === 'after-download') return 'downloadable';
      return 'unavailable';
    }
  } catch {
    return 'unavailable';
  }
  return 'unavailable';
}

export const CHROME_AI_STATES = ['available', 'downloadable', 'downloading'];

/** @returns {Promise<{state: string, detail: string}>} */
export async function chromeAiStatus() {
  const api = modelApi();
  if (!api) {
    return {
      state: 'unsupported',
      detail: 'This browser does not expose the built-in AI (needs Chrome 138+ on desktop).',
    };
  }
  const state = await availabilityOf(api);
  const details = {
    available: 'Ready on this machine — free, on-device, no key.',
    downloadable: 'Chrome will download Gemini Nano once on first use (a few GB).',
    downloading: 'Gemini Nano is downloading now.',
    unavailable:
      'Chrome cannot run Gemini Nano on this machine (needs desktop, 16 GB+ RAM and ~22 GB free disk).',
  };
  return { state, detail: details[state] || 'Built-in model state unknown.' };
}

/**
 * Stream a reply from Gemini Nano.
 * @param {{messages: Array, system?: string, signal?: AbortSignal, onStatus?: (text: string) => void}} options
 */
export async function* chromeAiStream({ messages, system, signal, onStatus }) {
  const api = modelApi();
  if (!api) {
    throw new Error(
      'Chrome built-in AI is not available here. Use Ollama for free local models, or add a free-tier key in Settings.'
    );
  }

  const state = await availabilityOf(api);
  if (!CHROME_AI_STATES.includes(state)) {
    throw new Error(
      state === 'unavailable'
        ? 'Chrome cannot run its built-in model on this machine. Pick Ollama (free, local) or a free-tier provider in Settings.'
        : 'The built-in AI is not ready yet. Try again, or choose another provider in Settings.'
    );
  }
  if (state === 'downloadable') onStatus?.('Starting the one-time Gemini Nano download…');
  if (state === 'downloading') onStatus?.('Gemini Nano is still downloading…');

  const history = messages
    .slice(0, -1)
    .slice(-6)
    .map((message) => ({ role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content }));

  const initialPrompts = [];
  if (system) initialPrompts.push({ role: 'system', content: system });
  initialPrompts.push(...history);

  const session = await api.create({
    initialPrompts,
    signal,
    monitor(monitor) {
      monitor?.addEventListener?.('downloadprogress', (event) => {
        const percent = Math.round((event.loaded || 0) * 100);
        onStatus?.(`Downloading Gemini Nano… ${percent}%`);
      });
    },
  });

  const stop = () => {
    try {
      session.destroy?.();
    } catch {
      /* already gone */
    }
  };
  signal?.addEventListener('abort', stop, { once: true });

  try {
    const last = messages[messages.length - 1];
    if (!last) return;

    const stream = session.promptStreaming(last.content);
    let accumulated = '';

    for await (const chunk of stream) {
      if (signal?.aborted) break;
      if (typeof chunk !== 'string' || !chunk) continue;

      // Current Chrome yields deltas; older builds yielded cumulative text.
      let delta = chunk;
      if (accumulated && chunk.length > accumulated.length && chunk.startsWith(accumulated)) {
        delta = chunk.slice(accumulated.length);
      }
      accumulated += delta;
      if (delta) yield delta;
    }
  } finally {
    signal?.removeEventListener('abort', stop);
    stop();
  }
}
