// Persistence helpers. All extension state lives in chrome.storage.local
// (unlimitedStorage), with the transient context-menu payload in session storage.

const NS = 'llmsp.v2.';
const K = {
  settings: `${NS}settings`,
  prompts: `${NS}prompts`,
  thread: `${NS}thread`,
  drive: `${NS}drive`,
  pending: 'pendingContext',
};

export const DEFAULT_SETTINGS = {
  providerId: 'builtin',
  model: 'gemini-nano',
  apiKeys: {},
  customBaseUrl: '',
  temperature: 0.7,
  maxTokens: 2048,
  systemPrompt:
    'You are a precise assistant living in a browser side panel. When page context is attached, ground your answer in it and say plainly when the page does not contain the answer.',
  contextCharLimit: 24000,
  autoSend: false,
  googleClientId: '',
  starterLoaded: false,
  onboarded: false,
};

export const DEFAULT_PROVIDER_SETTINGS = {
  providerId: 'openai',
  model: '',
};

/* ---------- settings ---------- */

export async function getSettings() {
  const got = await chrome.storage.local.get(K.settings);
  const saved = got[K.settings] || {};
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    apiKeys: { ...(saved.apiKeys || {}) },
  };
}

export async function saveSettings(patch) {
  const current = await getSettings();
  // A supplied apiKeys map replaces the stored one, so removing a key persists.
  const { apiKeys, ...rest } = patch || {};
  const next = { ...current, ...rest, apiKeys: apiKeys ? { ...apiKeys } : current.apiKeys };
  await chrome.storage.local.set({ [K.settings]: next });
  return next;
}

/* ---------- prompts ---------- */

export async function listPrompts() {
  const got = await chrome.storage.local.get(K.prompts);
  return Array.isArray(got[K.prompts]) ? got[K.prompts] : [];
}

export async function savePrompts(list) {
  await chrome.storage.local.set({ [K.prompts]: list });
  return list;
}

export function uid() {
  return `p_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

/** Stable, cheap fingerprint used to skip re-imports of the same prompt. */
export function fingerprint(title, body) {
  const src = `${normalize(title)}\n${normalize(body)}`;
  let hash = 5381;
  for (let i = 0; i < src.length; i++) hash = ((hash << 5) + hash + src.charCodeAt(i)) | 0;
  return `fp_${(hash >>> 0).toString(36)}_${src.length.toString(36)}`;
}

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizePrompt(input) {
  const title = String(input.title || 'Untitled prompt').trim().slice(0, 200);
  const body = String(input.body || '').replace(/\r\n?/g, '\n').trim();
  const tags = Array.isArray(input.tags)
    ? input.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 24)
    : String(input.tags || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 24);
  const now = Date.now();
  return {
    id: input.id || uid(),
    title,
    body,
    tags,
    collection: String(input.collection || input.source?.label || 'Library').trim().slice(0, 120),
    source: {
      kind: input.source?.kind || 'manual',
      label: input.source?.label || 'Manual',
      ref: input.source?.ref || '',
      url: input.source?.url || '',
    },
    fingerprint: input.fingerprint || fingerprint(title, body),
    pinned: Boolean(input.pinned),
    uses: Number(input.uses) || 0,
    createdAt: input.createdAt || now,
    updatedAt: now,
    lastUsedAt: input.lastUsedAt || 0,
  };
}

/**
 * Add prompts, skipping duplicates by fingerprint (or by id when overwriting).
 * Returns the fresh list plus counts so the importer can report honestly.
 */
export async function addPrompts(incoming, { replace = false } = {}) {
  const existing = await listPrompts();
  const seen = new Map();
  for (const p of existing) seen.set(p.fingerprint, p);

  let added = 0;
  let skipped = 0;
  const next = [...existing];

  for (const raw of incoming) {
    const prompt = normalizePrompt(raw);
    if (!prompt.body && !prompt.title) {
      skipped += 1;
      continue;
    }
    const dup = seen.get(prompt.fingerprint);
    if (dup && !replace) {
      skipped += 1;
      continue;
    }
    if (dup && replace) {
      const at = next.findIndex((p) => p.id === dup.id);
      const merged = { ...prompt, id: dup.id, uses: dup.uses, createdAt: dup.createdAt, pinned: dup.pinned };
      if (at >= 0) next[at] = merged;
      seen.set(merged.fingerprint, merged);
      continue;
    }
    seen.set(prompt.fingerprint, prompt);
    next.push(prompt);
    added += 1;
  }

  await savePrompts(next);
  return { prompts: next, added, skipped };
}

export async function updatePrompt(id, patch) {
  const list = await listPrompts();
  const at = list.findIndex((p) => p.id === id);
  if (at < 0) return null;
  const merged = normalizePrompt({ ...list[at], ...patch, id });
  merged.createdAt = list[at].createdAt;
  merged.uses = patch.uses != null ? patch.uses : list[at].uses;
  merged.pinned = patch.pinned != null ? patch.pinned : list[at].pinned;
  list[at] = merged;
  await savePrompts(list);
  return merged;
}

export async function deletePrompt(id) {
  const list = await listPrompts();
  const next = list.filter((p) => p.id !== id);
  await savePrompts(next);
  return next;
}

export async function clearPrompts() {
  await savePrompts([]);
  return [];
}

/* ---------- chat thread ---------- */

export async function getThread() {
  const got = await chrome.storage.local.get(K.thread);
  return Array.isArray(got[K.thread]) ? got[K.thread] : [];
}

export async function saveThread(messages) {
  await chrome.storage.local.set({ [K.thread]: messages.slice(-80) });
}

export async function clearThread() {
  await chrome.storage.local.set({ [K.thread]: [] });
}

/* ---------- Google Drive token ---------- */

export async function getDriveToken() {
  const got = await chrome.storage.local.get(K.drive);
  const token = got[K.drive];
  if (!token?.accessToken) return null;
  if (token.expiresAt && token.expiresAt < Date.now()) return null;
  return token;
}

export async function setDriveToken(token) {
  await chrome.storage.local.set({ [K.drive]: token });
}

export async function clearDriveToken() {
  await chrome.storage.local.remove(K.drive);
}

/* ---------- context-menu handoff ---------- */

export async function setPendingContext(payload) {
  await chrome.storage.session.set({ [K.pending]: payload });
}

export async function takePendingContext() {
  const got = await chrome.storage.session.get(K.pending);
  const payload = got[K.pending] || null;
  if (payload) await chrome.storage.session.remove(K.pending);
  return payload;
}
