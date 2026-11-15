import { state, bootstrap, setContext, persistMessages, setPrompts } from './state.js';
import * as store from '../lib/store.js';
import { PROVIDERS, providerConfig, providerLabel, streamChat } from '../lib/providers.js';
import { CHROME_AI_STATES, chromeAiStatus } from '../lib/chrome-ai.js';
import { extractPageContext } from '../lib/extract.js';
import { BUILTIN_PROMPTS } from '../prompts/builtin.js';
import { initLibrary, renderLibrary } from './library.js';
import { connectDrive as connectDriveAccount, disconnectDrive } from '../lib/import/gdocs.js';
import { exportPromptsAsJson } from '../lib/import/files.js';
import { $, $$, esc, toast, renderMarkdown, truncate, wordCount, openModal, download, copyText } from './ui.js';

/* ---------------- boot ---------------- */

async function init() {
  try {
    await bootstrap();
  } catch (error) {
    toast(`Could not load saved state: ${error.message}`, 'error');
  }

  populateProviderSelect();
  syncSettingsFields();
  renderModelLabel();
  renderMessages();
  renderContextBar();
  renderPageTabInfo();
  wireEvents();

  initLibrary({
    insert: insertPrompt,
    run: (text) => sendMessage(text),
    getContext: () => state.context,
  });
  renderLibrary();

  refreshActiveTab();
  refreshTabList();
  void consumePendingContext();
  void refreshDriveStatus();

  if (!state.settings.onboarded) void showFreeOptions();
}

/* ---------------- routing ---------------- */

function setTab(name) {
  state.tab = name;
  $$('.tab').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.tab === name));
  $$('.panel').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.panel === name));
  if (name === 'prompts') {
    renderLibrary();
    setTimeout(() => $('#prompt-search')?.focus(), 30);
  }
  if (name === 'page') {
    refreshActiveTab();
    refreshTabList();
    renderPagePreview();
  }
}

function wireEvents() {
  $$('.tab').forEach((tab) => tab.addEventListener('click', () => setTab(tab.dataset.tab)));

  $('#btn-send').addEventListener('click', () => sendMessage($('#input').value));
  $('#input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage($('#input').value);
    }
  });
  $('#input').addEventListener('input', autoGrow);
  $('#btn-stop').addEventListener('click', () => state.controller?.abort());
  $('#btn-attach').addEventListener('click', () => captureActiveTab());

  for (const quick of $$('[data-quick]')) {
    quick.addEventListener('click', () => {
      if (quick.dataset.quick === 'capture') captureActiveTab();
      if (quick.dataset.quick === 'library') setTab('prompts');
    });
  }

  $('#messages').addEventListener('click', onMessageAction);
  $('#context-bar').addEventListener('click', (event) => {
    if (event.target.closest('[data-clear-context]')) {
      setContext(null);
      renderContextBar();
      renderPagePreview();
      toast('Context removed');
    }
  });

  $('#btn-model').addEventListener('click', openSettings);
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-free-options').addEventListener('click', () => void showFreeOptions());
  $('#btn-close-settings').addEventListener('click', closeSettings);
  $('#drawer-backdrop').addEventListener('click', closeSettings);

  $('#btn-capture-page').addEventListener('click', () => captureActiveTab());
  $('#btn-capture-selection').addEventListener('click', () => captureActiveTab({ selectionOnly: true }));
  $('#page-tab-list').addEventListener('click', (event) => {
    const row = event.target.closest('[data-tab-id]');
    if (row) captureTab(Number(row.dataset.tabId));
  });

  wireSettingsFields();

  chrome.runtime.onMessage.addListener(() => {
    void consumePendingContext();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes.pendingContext?.newValue) void consumePendingContext();
  });
}

/* ---------------- chat ---------------- */

function typingHtml() {
  return '<span class="typing"><span></span><span></span><span></span></span>';
}

function messageHtml(message, index) {
  if (message.role === 'user') {
    return `<div class="message message-user" data-index="${index}">
      ${message.context ? `<div class="message-context" title="${esc(message.context.url)}">📄 ${esc(message.context.title || message.context.url)}</div>` : ''}
      <div class="bubble">${renderMarkdown(message.content)}</div>
      <div class="message-actions">
        <button class="mini" data-act="copy" data-index="${index}">Copy</button>
        <button class="mini" data-act="delete" data-index="${index}">Delete</button>
      </div>
    </div>`;
  }

  const pending = message.pending && !message.content;
  return `<div class="message message-assistant ${message.error ? 'message-error' : ''}" data-index="${index}">
    <div class="message-role">${esc(message.model || 'assistant')}${message.provider ? ` · ${esc(message.provider)}` : ''}</div>
    <div class="bubble">${message.notice ? `<p class="muted">${esc(message.notice)}</p>` : ''}${pending ? typingHtml() : renderMarkdown(message.content)}${message.error ? `<p class="muted">${esc(message.error)}</p>` : ''}</div>
    ${
      pending
        ? ''
        : `<div class="message-actions">
            <button class="mini" data-act="copy" data-index="${index}">Copy</button>
            <button class="mini" data-act="retry" data-index="${index}">Retry</button>
            <button class="mini" data-act="delete" data-index="${index}">Delete</button>
          </div>`
    }
  </div>`;
}

function renderMessages() {
  const box = $('#messages');
  box.innerHTML = state.messages.map((message, index) => messageHtml(message, index)).join('');
  $('#chat-empty').classList.toggle('hidden', state.messages.length > 0);
  scrollToBottom();
}

function scrollToBottom() {
  const scroll = $('#chat-scroll');
  scroll.scrollTop = scroll.scrollHeight;
}

let paintQueued = false;
function paintStreaming(message) {
  if (paintQueued) return;
  paintQueued = true;
  requestAnimationFrame(() => {
    paintQueued = false;
    const node = document.querySelector(`.message[data-index="${state.messages.length - 1}"] .bubble`);
    if (!node) {
      renderMessages();
      return;
    }
    node.innerHTML = `${message.notice ? `<p class="muted">${esc(message.notice)}</p>` : ''}${renderMarkdown(message.content)}${typingHtml()}`;
    scrollToBottom();
  });
}

function buildApiMessages() {
  const config = providerConfig(state.settings.providerId, state.settings);
  const configured = Number(state.settings.contextCharLimit) || 24000;
  // The on-device model has a small window, so cap page context harder for it.
  const limit = config.kind === 'chrome-ai' ? Math.min(configured, 8000) : configured;
  const entries = [];
  for (const message of state.messages) {
    if (message.pending || !message.content) continue;
    entries.push({ role: message.role, content: message.content, context: message.context || null });
  }

  // Only the most recent user message carries page context, so long chats do not
  // resend the same page text on every turn.
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.role !== 'user' || !entry.context) continue;
    const text = entry.context.selection || entry.context.text || '';
    if (text) {
      entry.content += `\n\n<page_context url="${entry.context.url}" title="${entry.context.title}">\n${truncate(text, limit)}\n</page_context>`;
    }
    break;
  }

  return entries.map(({ role, content }) => ({ role, content }));
}

function toggleStreamingUi() {
  $('#btn-send').classList.toggle('hidden', state.streaming);
  $('#btn-stop').classList.toggle('hidden', !state.streaming);
}

async function sendMessage(rawText) {
  const text = String(rawText || '').trim();
  if (!text || state.streaming) return;

  const config = providerConfig(state.settings.providerId, state.settings);
  if (!config.ready) {
    toast(
      config.needsKey && !config.apiKey ? `Add your ${config.label} API key in Settings.` : 'Finish the provider setup in Settings.',
      'warn'
    );
    openSettings();
    return;
  }

  if (config.kind === 'chrome-ai') {
    const status = await chromeAiStatus();
    if (!CHROME_AI_STATES.includes(status.state)) {
      toast(status.detail, 'warn');
      openSettings();
      return;
    }
  }

  const context = state.context;
  state.messages.push({
    role: 'user',
    content: text,
    ts: Date.now(),
    context: context
      ? { url: context.url, title: context.title, text: context.text, selection: context.selection }
      : null,
  });
  const assistant = {
    role: 'assistant',
    content: '',
    ts: Date.now(),
    pending: true,
    provider: config.label,
    model: config.model,
  };
  state.messages.push(assistant);

  $('#input').value = '';
  autoGrow();
  state.streaming = true;
  toggleStreamingUi();
  renderMessages();
  await persistMessages();

  const controller = new AbortController();
  state.controller = controller;

  try {
    for await (const delta of streamChat({
      settings: state.settings,
      messages: buildApiMessages(),
      system: state.settings.systemPrompt,
      signal: controller.signal,
      onStatus: (notice) => {
        assistant.notice = notice;
        paintStreaming(assistant);
      },
    })) {
      assistant.content += delta;
      if (assistant.notice) assistant.notice = '';
      paintStreaming(assistant);
    }
    if (!assistant.content.trim()) assistant.content = '_(The provider returned an empty response.)_';
  } catch (error) {
    if (error.name === 'AbortError') {
      assistant.content = `${assistant.content}${assistant.content ? '\n\n' : ''}_(stopped)_`;
    } else {
      assistant.error = error.message || String(error);
    }
  } finally {
    assistant.pending = false;
    state.streaming = false;
    state.controller = null;
    toggleStreamingUi();
    renderMessages();
    await persistMessages();
  }
}

async function onMessageAction(event) {
  const button = event.target.closest('[data-act]');
  if (!button) return;
  const index = Number(button.dataset.index);
  const message = state.messages[index];
  if (!message) return;

  if (button.dataset.act === 'copy') {
    const ok = await copyText(message.content);
    toast(ok ? 'Copied' : 'Copy failed', ok ? 'success' : 'error');
  }
  if (button.dataset.act === 'delete') {
    state.messages.splice(index, 1);
    renderMessages();
    await persistMessages();
  }
  if (button.dataset.act === 'retry') {
    let at = index - 1;
    while (at >= 0 && state.messages[at].role !== 'user') at -= 1;
    if (at < 0) return;
    const userText = state.messages[at].content;
    state.messages.splice(at, state.messages.length - at);
    renderMessages();
    await persistMessages();
    await sendMessage(userText);
  }
}

function insertPrompt(text) {
  setTab('chat');
  const input = $('#input');
  const value = input.value.trim();
  input.value = value ? `${value}\n\n${text}` : text;
  autoGrow();
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  toast('Prompt inserted — edit, then send');
}

function autoGrow() {
  const input = $('#input');
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
}

/* ---------------- page context ---------------- */

function renderContextBar() {
  const bar = $('#context-bar');
  if (!state.context) {
    bar.classList.add('hidden');
    bar.innerHTML = '';
    return;
  }
  const label = state.context.selection ? 'Selection' : 'Page';
  bar.classList.remove('hidden');
  bar.innerHTML = `<span class="context-chip" title="${esc(state.context.url)}">
      <span>📄 ${label}: ${esc(state.context.title || state.context.url)} · ${wordCount(state.context.selection || state.context.text)} words</span>
      <button data-clear-context="1" title="Remove context">✕</button>
    </span>`;
}

function renderPagePreview() {
  const block = $('#page-preview-block');
  if (!state.context) {
    block.classList.add('hidden');
    return;
  }
  block.classList.remove('hidden');
  $('#preview-meta').textContent = `${wordCount(state.context.selection || state.context.text)} words · ${new Date(state.context.capturedAt || Date.now()).toLocaleTimeString()}`;
  $('#page-preview').textContent = truncate(state.context.selection || state.context.text, 4000);
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab || null;
}

function blockedUrl(url) {
  return /^(chrome|edge|brave|about|devtools|view-source|chrome-extension|moz-extension|chrome-search|vivaldi):/i.test(url || '');
}

async function readTab(tab) {
  if (!tab?.id) throw new Error('No active tab.');
  if (blockedUrl(tab.url)) throw new Error('This is a browser page, not a web page. Open a normal site first.');
  let results;
  try {
    results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPageContext });
  } catch (error) {
    throw new Error(
      `Could not read this tab (${error.message}). PDFs, chrome:// pages and the Web Store block injection — select text there and use Capture selection.`
    );
  }
  const data = results?.[0]?.result;
  if (!data) throw new Error('The page returned no data.');
  if (!data.text && !data.selection) throw new Error('No readable text was found on this page.');
  return data;
}

async function captureActiveTab({ selectionOnly = false } = {}) {
  try {
    const tab = await activeTab();
    const data = await readTab(tab);
    attachContext(data, selectionOnly);
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function captureTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    const data = await readTab(tab);
    attachContext(data, false);
  } catch (error) {
    toast(error.message, 'error');
  }
}

function attachContext(data, selectionOnly) {
  const selection = data.selection || '';
  if (selectionOnly && !selection) {
    toast('Nothing is selected on the page. Highlight text, then try again.', 'warn');
    return;
  }
  const text = selectionOnly ? selection : data.text || selection;
  setContext({
    url: data.url,
    title: data.title,
    description: data.description || '',
    text,
    selection,
    capturedAt: Date.now(),
  });
  renderContextBar();
  renderPagePreview();
  setTab('chat');
  toast(selectionOnly ? 'Selection attached' : `Page attached · ${wordCount(text)} words`, 'success');
}

async function refreshActiveTab() {
  try {
    const tab = await activeTab();
    renderPageTabInfo(tab);
  } catch {
    renderPageTabInfo(null);
  }
}

function renderPageTabInfo(tab) {
  const status = $('#page-status');
  if (!tab) {
    status.textContent = 'No active tab found.';
    return;
  }
  status.innerHTML = `<p class="page-title">${esc(tab.title || 'Untitled')}</p><div class="page-url">${esc(tab.url || '')}</div>`;
}

async function refreshTabList() {
  const list = $('#page-tab-list');
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const usable = tabs.filter((tab) => tab.url && !blockedUrl(tab.url) && tab.id != null);
    if (!usable.length) {
      list.innerHTML = '<div class="muted">No scrapeable tabs in this window.</div>';
      return;
    }
    list.innerHTML = usable
      .map(
        (tab) =>
          `<button class="tab-row" data-tab-id="${tab.id}" title="${esc(tab.url)}"><span>${esc(tab.title || tab.url)}</span></button>`
      )
      .join('');
  } catch (error) {
    list.innerHTML = `<div class="muted">${esc(error.message)}</div>`;
  }
}

async function consumePendingContext() {
  try {
    const pending = await store.takePendingContext();
    if (!pending) return;
    if (pending.kind === 'page') {
      const tab = await activeTab();
      const data = await readTab(tab);
      attachContext(data, false);
      return;
    }
    setContext({
      url: pending.url,
      title: pending.title,
      description: '',
      text: pending.text,
      selection: pending.text,
      capturedAt: Date.now(),
    });
    renderContextBar();
    renderPagePreview();
    setTab('chat');
    toast('Selection attached from the context menu', 'success');
  } catch {
    /* context menus on restricted pages simply do nothing */
  }
}

/* ---------------- settings ---------------- */

let keyDirty = false;

function populateProviderSelect() {
  $('#setting-provider').innerHTML = Object.entries(PROVIDERS)
    .map(([id, provider]) => {
      const tag = provider.free ? ' · free' : provider.freeTier ? ' · free tier' : '';
      return `<option value="${id}">${esc(provider.label)}${tag}</option>`;
    })
    .join('');
}

function providerHint(config) {
  if (config.id === 'builtin') {
    return 'Free and on-device: no key, and page text never leaves this machine. Chrome 138+ desktop with Gemini Nano.';
  }
  if (config.id === 'ollama') return 'Free and local. Install Ollama, then run `ollama pull llama3.2` (or any model).';
  if (config.id === 'lmstudio') return 'Free and local. Start LM Studio with its local server enabled (port 1234).';
  if (config.editableBase) return 'Any OpenAI-compatible endpoint, including a self-hosted gateway.';
  if (config.freeTier) return 'Has a free tier; the key is still required.';
  return '';
}

function syncSettingsFields() {
  const settings = state.settings;
  const config = providerConfig(settings.providerId, settings);

  $('#setting-provider').value = settings.providerId;
  $('#setting-model').value = settings.model || '';
  $('#setting-model').placeholder = config.defaultModel || 'model id';
  $('#model-suggestions').innerHTML = (config.models || []).map((model) => `<option value="${esc(model)}"></option>`).join('');
  $('#setting-key').value = '';
  keyDirty = false;
  $('#setting-key').placeholder = settings.apiKeys[config.id]
    ? '•••••• saved'
    : config.needsKey
      ? 'paste the provider key'
      : 'not required';
  $('#key-help').textContent = config.keyUrl ? `Get a key: ${config.keyUrl}` : '';
  $('#field-key').classList.toggle('hidden', !config.needsKey);
  $('#provider-hint').textContent = providerHint(config);
  $('#field-base').classList.toggle('hidden', !config.editableBase);
  $('#setting-base').value = settings.customBaseUrl || '';
  $('#setting-temp').value = String(settings.temperature);
  $('#temp-value').textContent = String(settings.temperature);
  $('#setting-system').value = settings.systemPrompt;
  $('#setting-context-limit').value = String(settings.contextCharLimit);
  $('#setting-google-client').value = settings.googleClientId || '';
  $('#drive-redirect').textContent = chrome.identity?.getRedirectURL ? chrome.identity.getRedirectURL() : 'unavailable';
  $('#library-stats').textContent = `${state.prompts.length} prompts in library`;
}

function wireSettingsFields() {
  $('#setting-provider').addEventListener('change', async () => {
    await saveSettingsFromFields({ providerId: $('#setting-provider').value, model: '' }, { quiet: true });
    const config = providerConfig(state.settings.providerId, state.settings);
    state.settings = await store.saveSettings({ model: config.defaultModel });
    syncSettingsFields();
    renderModelLabel();
  });

  $('#setting-model').addEventListener('input', renderModelLabel);
  $('#setting-model').addEventListener('change', () =>
    saveSettingsFromFields({ model: $('#setting-model').value.trim() }, { quiet: true })
  );
  $('#setting-key').addEventListener('input', () => {
    keyDirty = true;
  });
  $('#setting-key').addEventListener('change', () => {
    if (!keyDirty) return;
    const providerId = state.settings.providerId;
    const value = $('#setting-key').value.trim();
    void saveSettingsFromFields({ apiKeys: { ...state.settings.apiKeys, [providerId]: value } });
    keyDirty = false;
  });
  $('#btn-forget-key').addEventListener('click', async () => {
    const apiKeys = { ...state.settings.apiKeys };
    delete apiKeys[state.settings.providerId];
    state.settings = await store.saveSettings({ apiKeys });
    syncSettingsFields();
    toast('Saved key removed');
  });
  $('#setting-base').addEventListener('change', () =>
    saveSettingsFromFields({ customBaseUrl: $('#setting-base').value.trim() })
  );
  $('#setting-temp').addEventListener('input', () => {
    $('#temp-value').textContent = $('#setting-temp').value;
    void saveSettingsFromFields({ temperature: Number($('#setting-temp').value) }, { quiet: true });
  });
  $('#setting-system').addEventListener('change', () =>
    saveSettingsFromFields({ systemPrompt: $('#setting-system').value })
  );
  $('#setting-context-limit').addEventListener('change', () =>
    saveSettingsFromFields({ contextCharLimit: Number($('#setting-context-limit').value) || 24000 })
  );
  $('#setting-google-client').addEventListener('change', () =>
    saveSettingsFromFields({ googleClientId: $('#setting-google-client').value.trim() })
  );

  $('#btn-connect-drive').addEventListener('click', async () => {
    const clientId = $('#setting-google-client').value.trim();
    if (!clientId) {
      toast('Add your Google OAuth client ID first', 'warn');
      return;
    }
    await saveSettingsFromFields({ googleClientId: clientId });
    try {
      await connectDriveAccount(clientId);
      toast('Google Drive connected', 'success');
      void refreshDriveStatus();
    } catch (error) {
      toast(error.message, 'error');
    }
  });
  $('#btn-disconnect-drive').addEventListener('click', async () => {
    await disconnectDrive();
    toast('Google Drive disconnected');
    void refreshDriveStatus();
  });

  $('#btn-load-starter').addEventListener('click', async () => {
    const result = await store.addPrompts(BUILTIN_PROMPTS);
    setPrompts(result.prompts);
    renderLibrary();
    syncSettingsFields();
    toast(`${result.added} starter prompts added${result.skipped ? `, ${result.skipped} already present` : ''}`, 'success');
  });
  $('#btn-export-all').addEventListener('click', () => exportAll());
  $('#btn-clear-library').addEventListener('click', clearLibrary);
  $('#btn-clear-chat').addEventListener('click', async () => {
    state.messages = [];
    await store.clearThread();
    renderMessages();
    toast('Chat cleared');
  });
}

async function saveSettingsFromFields(patch, { quiet = false } = {}) {
  try {
    state.settings = await store.saveSettings(patch);
    if (!quiet) toast('Saved', 'success');
    return state.settings;
  } catch (error) {
    toast(`Could not save: ${error.message}`, 'error');
    return state.settings;
  }
}

function openSettings() {
  syncSettingsFields();
  $('#settings-drawer').classList.remove('hidden');
  $('#drawer-backdrop').classList.remove('hidden');
}

function closeSettings() {
  $('#settings-drawer').classList.add('hidden');
  $('#drawer-backdrop').classList.add('hidden');
  renderModelLabel();
}

function renderModelLabel() {
  const config = providerConfig(state.settings.providerId, state.settings);
  const short = config.kind === 'chrome-ai' ? 'On-device' : config.label.split(' ')[0];
  $('#model-label').textContent = config.model ? `${short} · ${config.model}` : config.label;
  $('#model-label').title = providerLabel(state.settings.providerId, state.settings);
}

async function refreshDriveStatus() {
  try {
    const token = await store.getDriveToken();
    $('#btn-disconnect-drive').classList.toggle('hidden', !token);
  } catch {
    /* ignore */
  }
}

function exportAll() {
  if (!state.prompts.length) {
    toast('Library is empty', 'warn');
    return;
  }
  download(`prompts-${new Date().toISOString().slice(0, 10)}.json`, exportPromptsAsJson(state.prompts));
  toast(`Exported ${state.prompts.length} prompts`, 'success');
}

function clearLibrary() {
  openModal(
    `<h2>Clear the whole library?</h2>
     <p class="lead">This removes all ${state.prompts.length} prompts from this browser. Export first if you want a backup. Chat history and settings are kept.</p>
     <div class="modal-actions">
       <button class="ghost" data-act="cancel">Cancel</button>
       <button class="primary" data-act="confirm">Delete all prompts</button>
     </div>`,
    {
      onMount(body, close) {
        body.querySelector('[data-act="cancel"]').addEventListener('click', close);
        body.querySelector('[data-act="confirm"]').addEventListener('click', async () => {
          await store.clearPrompts();
          setPrompts([]);
          renderLibrary();
          syncSettingsFields();
          close();
          toast('Library cleared');
        });
      },
    }
  );
}

async function showFreeOptions() {
  openModal(
    `<h2>Free ways to run this</h2>
     <p class="lead">No account, no subscription, no telemetry. Pick a free path now; you can switch any time in Settings.</p>
     <div class="free-option">
       <div><strong>Chrome built-in AI</strong><div class="hint" id="ai-status-line">Checking this machine…</div></div>
       <button class="ghost" id="ai-choice" data-choice="builtin">Use it</button>
     </div>
     <div class="free-option">
       <div><strong>Ollama (local)</strong><div class="hint">Free local models on localhost. Install Ollama and pull a model.</div></div>
       <button class="ghost" data-choice="ollama">Use it</button>
     </div>
     <div class="free-option">
       <div><strong>Free API tiers</strong><div class="hint">Gemini, Groq, Mistral and OpenRouter offer free tiers; a key is still needed.</div></div>
       <button class="ghost" data-choice="key">Add key</button>
     </div>`,
    {
      onMount(body, close) {
        const aiButton = body.querySelector('#ai-choice');
        const statusLine = body.querySelector('#ai-status-line');

        // Seen once is enough: closing without choosing should not nag on reopen.
        void store.saveSettings({ onboarded: true }).then((settings) => {
          state.settings = settings;
        });

        chromeAiStatus()
          .then((status) => {
            statusLine.textContent = status.detail;
            if (!CHROME_AI_STATES.includes(status.state)) {
              aiButton.disabled = true;
              aiButton.textContent = 'Unavailable';
            }
          })
          .catch(() => {
            statusLine.textContent = 'Could not check the built-in model.';
            aiButton.disabled = true;
          });

        body.querySelectorAll('[data-choice]').forEach((button) => {
          button.addEventListener('click', async () => {
            const choice = button.dataset.choice;
            if (choice === 'builtin') {
              await store.saveSettings({ providerId: 'builtin', model: 'gemini-nano', onboarded: true });
            } else if (choice === 'ollama') {
              await store.saveSettings({ providerId: 'ollama', model: 'llama3.2', onboarded: true });
            } else {
              await store.saveSettings({ onboarded: true });
            }

            state.settings = await store.getSettings();
            syncSettingsFields();
            renderModelLabel();
            close();

            if (choice === 'key') openSettings();
            else toast('Provider set — change it any time in Settings');
          });
        });
      },
    }
  );
}

void init();
