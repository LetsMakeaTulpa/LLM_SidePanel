import { state, setPrompts } from './state.js';
import * as store from '../lib/store.js';
import {
  searchPrompts,
  splitPrompts,
  extractVariables,
  renderTemplate,
  libraryFacets,
} from '../lib/prompts.js';
import { BUILTIN_PROMPTS } from '../prompts/builtin.js';
import { importKeepTakeoutZip, importKeepHtmlFiles, importKeepJson, parseKeepNoteHtml } from '../lib/import/keep.js';
import { htmlToText } from '../lib/import/html.js';
import {
  connectDrive,
  listDriveFiles,
  importDriveFiles,
  importGoogleLinks,
  parseGoogleLinks,
} from '../lib/import/gdocs.js';
import { importTextFile, exportPromptsAsJson, importMarkdownZip } from '../lib/import/files.js';
import { collectRemoteCollection } from '../lib/import/remote.js';
import { $, $$, esc, toast, openModal, closeModal, download, copyText, debounce, relTime } from './ui.js';

let handlers = { insert() {}, run() {}, getContext: () => null };
let loadedDriveFiles = [];

const SPLIT_MODES = [
  ['auto', 'Auto-detect sections'],
  ['single', 'One prompt (whole text)'],
  ['heading', 'Markdown headings'],
  ['numbered', 'Numbered list'],
  ['delimiter', 'Lines of ---'],
  ['bullets', 'Bulleted list'],
];

export function initLibrary(nextHandlers) {
  handlers = { ...handlers, ...nextHandlers };

  $('#prompt-search').addEventListener(
    'input',
    debounce((event) => {
      state.libFilter.query = event.target.value;
      state.libLimit = 80;
      renderLibrary();
    }, 140)
  );
  $('#prompt-search').addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.target.value = '';
      state.libFilter.query = '';
      renderLibrary();
    }
  });

  $('#lib-filters').addEventListener('click', (event) => {
    const chip = event.target.closest('[data-filter]');
    if (!chip) return;
    const { filter, value } = chip.dataset;
    if (value === 'all') {
      state.libFilter.collection = 'all';
      state.libFilter.tag = 'all';
    } else if (state.libFilter[filter] === value) {
      state.libFilter[filter] = 'all';
    } else {
      state.libFilter[filter] = value;
      if (filter === 'collection') state.libFilter.tag = 'all';
    }
    state.libLimit = 80;
    renderLibrary();
  });

  $('#prompt-list').addEventListener('click', async (event) => {
    const more = event.target.closest('[data-more]');
    if (more) {
      state.libLimit += 80;
      renderLibrary();
      return;
    }
    const button = event.target.closest('[data-act]');
    if (button) {
      const prompt = state.prompts.find((item) => item.id === button.dataset.id);
      if (!prompt) return;
      await onPromptAction(button.dataset.act, prompt);
      return;
    }
    const card = event.target.closest('.prompt-card');
    if (card) {
      const prompt = state.prompts.find((item) => item.id === card.dataset.id);
      if (prompt) await deployPrompt(prompt, { run: false });
    }
  });

  $('#lib-footer').addEventListener('change', (event) => {
    if (event.target.id === 'lib-sort') state.libFilter.sort = event.target.value;
    if (event.target.id === 'lib-source') state.libFilter.source = event.target.value;
    renderLibrary();
  });

  $('#btn-new-prompt').addEventListener('click', () => promptEditor());
  $('#btn-import').addEventListener('click', openImportModal);
  $('#btn-export').addEventListener('click', exportAll);
}

/* ---------------- rendering ---------------- */

export function renderLibrary() {
  const count = $('#prompt-count');
  if (count) count.textContent = String(state.prompts.length);
  const stats = $('#library-stats');
  if (stats) stats.textContent = `${state.prompts.length} prompts in library`;

  renderFilters();
  renderPromptList();
  renderFooter();
}

function renderFilters() {
  const facets = libraryFacets(state.prompts);
  const chips = [`<button class="chip ${state.libFilter.collection === 'all' && state.libFilter.tag === 'all' ? 'is-active' : ''}" data-filter="collection" data-value="all">All ${state.prompts.length}</button>`];

  for (const collection of facets.collections.slice(0, 8)) {
    const active = state.libFilter.collection === collection.value;
    chips.push(
      `<button class="chip ${active ? 'is-active' : ''}" data-filter="collection" data-value="${esc(collection.value)}">${esc(collection.value)} ${collection.count}</button>`
    );
  }
  for (const tag of facets.tags.slice(0, 6)) {
    if (state.libFilter.collection !== 'all') break;
    const active = state.libFilter.tag === tag.value;
    chips.push(`<button class="chip ${active ? 'is-active' : ''}" data-filter="tag" data-value="${esc(tag.value)}">#${esc(tag.value)}</button>`);
  }

  $('#lib-filters').innerHTML = chips.join('');
}

function sourceLabel(prompt) {
  const kind = prompt.source?.kind || 'manual';
  const labels = {
    manual: 'Manual',
    keep: 'Keep',
    gdoc: 'Docs',
    gdrive: 'Drive',
    file: 'File',
    skill: 'Skill',
    builtin: 'Starter',
  };
  return labels[kind] || kind;
}

function renderPromptList() {
  const list = $('#prompt-list');
  const results = searchPrompts(state.prompts, state.libFilter);

  if (!state.prompts.length) {
    list.innerHTML = `<div class="empty-state">
      <strong>Your prompt library is empty</strong>
      Import from Google Keep, Drive and Docs, or add the starter pack.
      <div class="row" style="margin-top:10px">
        <button class="primary" data-act="open-import">Import prompts</button>
        <button class="ghost" data-act="load-starter">Add starter pack</button>
      </div>
    </div>`;
    list.querySelector('[data-act="open-import"]').addEventListener('click', openImportModal);
    list.querySelector('[data-act="load-starter"]').addEventListener('click', addStarterPack);
    return;
  }

  if (!results.length) {
    list.innerHTML = '<div class="empty-state"><strong>No prompt matches</strong>Try a shorter search or clear the filters.</div>';
    return;
  }

  const shown = results.slice(0, state.libLimit);
  const cards = shown.map((prompt) => {
    const tags = (prompt.tags || []).slice(0, 2);
    return `<article class="prompt-card" data-id="${prompt.id}">
      <div class="prompt-top">
        <h3 class="prompt-title">${esc(prompt.title)}</h3>
        ${prompt.uses ? `<span class="prompt-uses">${prompt.uses}×</span>` : ''}
      </div>
      <p class="prompt-snippet">${esc(prompt.body.replace(/\s+/g, ' ').slice(0, 180))}</p>
      <div class="prompt-meta">
        <span class="tag tag-source">${esc(sourceLabel(prompt))}</span>
        ${prompt.collection && prompt.collection !== 'Library' ? `<span class="tag">${esc(prompt.collection)}</span>` : ''}
        ${tags.map((tag) => `<span class="tag">#${esc(tag)}</span>`).join('')}
      </div>
      <div class="prompt-actions">
        <button class="mini primary" data-act="deploy" data-id="${prompt.id}">Deploy</button>
        <button class="mini" data-act="run" data-id="${prompt.id}">Run</button>
        <button class="mini" data-act="copy" data-id="${prompt.id}">Copy</button>
        <button class="mini" data-act="more" data-id="${prompt.id}" title="More actions">⋯</button>
      </div>
    </article>`;
  });

  if (shown.length < results.length) {
    cards.push(`<button class="ghost" data-more="1" style="margin-top:2px">Show ${Math.min(80, results.length - shown.length)} more · ${results.length - shown.length} left</button>`);
  }
  list.innerHTML = cards.join('');
}

function renderFooter() {
  const results = searchPrompts(state.prompts, state.libFilter);
  const facets = libraryFacets(state.prompts);
  const sources = facets.sources
    .map(({ value, count }) => `<option value="${esc(value)}" ${state.libFilter.source === value ? 'selected' : ''}>${esc(value)} (${count})</option>`)
    .join('');
  const sort = state.libFilter.sort;

  $('#lib-footer').innerHTML = `
    <span>${results.length} of ${state.prompts.length}</span>
    <span class="row" style="margin:0;gap:4px">
      <select id="lib-source" title="Filter by source">
        <option value="all">All sources</option>
        ${sources}
      </select>
      <select id="lib-sort" title="Sort">
        <option value="relevance" ${sort === 'relevance' ? 'selected' : ''}>Relevance</option>
        <option value="recent" ${sort === 'recent' ? 'selected' : ''}>Recent</option>
        <option value="title" ${sort === 'title' ? 'selected' : ''}>A–Z</option>
        <option value="uses" ${sort === 'uses' ? 'selected' : ''}>Most used</option>
      </select>
    </span>`;
}

/* ---------------- actions ---------------- */

async function onPromptAction(action, prompt) {
  if (action === 'deploy') return deployPrompt(prompt, { run: false });
  if (action === 'run') return deployPrompt(prompt, { run: true });
  if (action === 'copy') {
    const ok = await copyText(prompt.body);
    toast(ok ? 'Prompt copied' : 'Copy failed', ok ? 'success' : 'error');
    return;
  }
  if (action === 'more') return promptMenu(prompt);
}

async function addStarterPack() {
  const result = await store.addPrompts(BUILTIN_PROMPTS);
  setPrompts(result.prompts);
  renderLibrary();
  toast(`${result.added} starter prompts added${result.skipped ? `, ${result.skipped} already present` : ''}`, 'success');
}

function exportAll() {
  if (!state.prompts.length) {
    toast('Library is empty', 'warn');
    return;
  }
  download(`prompts-${new Date().toISOString().slice(0, 10)}.json`, exportPromptsAsJson(state.prompts));
}

/* ---------------- deploy ---------------- */

function contextValues() {
  const context = handlers.getContext?.() || null;
  const now = new Date();
  return {
    page: context?.text || '',
    page_title: context?.title || '',
    page_url: context?.url || '',
    page_description: context?.description || '',
    selection: context?.selection || '',
    date: now.toLocaleDateString(),
    time: now.toLocaleTimeString(),
  };
}

async function markUsed(prompt) {
  const saved = await store.updatePrompt(prompt.id, { uses: (prompt.uses || 0) + 1, lastUsedAt: Date.now() });
  if (saved) state.prompts = state.prompts.map((item) => (item.id === saved.id ? saved : item));
  renderLibrary();
}

async function deployPrompt(prompt, { run = false } = {}) {
  const variables = extractVariables(prompt.body);
  const values = contextValues();

  const finish = async (text) => {
    await markUsed(prompt);
    if (run) handlers.run(text);
    else handlers.insert(text);
  };

  if (!variables.length) {
    await finish(renderTemplate(prompt.body, values));
    return;
  }

  const LONG = new Set(['page', 'selection', 'notes', 'text', 'content']);
  const fields = variables
    .map((name) => {
      const value = values[name] ?? '';
      const long = value.length > 120 || LONG.has(name);
      const id = `var-${name.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      const label = name.replace(/[_.-]+/g, ' ');
      return `<label class="field" for="${id}">
        <span>${esc(label)} ${value ? '' : '<span class="muted">(empty)</span>'}</span>
        ${
          long
            ? `<textarea id="${id}" name="${esc(name)}" rows="4">${esc(value)}</textarea>`
            : `<input id="${id}" name="${esc(name)}" value="${esc(value)}" />`
        }
      </label>`;
    })
    .join('');

  const pageAttached = Boolean(handlers.getContext?.()?.text);

  openModal(
    `<h2>${esc(prompt.title)}</h2>
     <p class="lead">${
       pageAttached
         ? 'Page context is filled in below. Everything you leave blank stays as a {{placeholder}}.'
         : 'No page captured yet — page fields are empty. Capture the page from the Page tab, or fill them in here.'
     }</p>
     <form id="deploy-form">
       ${fields}
       <div class="modal-actions">
         <button type="button" class="ghost" data-act="insert">Insert</button>
         <button type="submit" class="primary">Deploy &amp; run</button>
       </div>
     </form>`,
    {
      onMount(body, close) {
        const form = body.querySelector('#deploy-form');
        const collect = () => {
          const data = new FormData(form);
          const out = {};
          for (const [key, value] of data.entries()) out[key] = String(value);
          return { ...values, ...out };
        };
        form.querySelector('[data-act="insert"]').addEventListener('click', async () => {
          const text = renderTemplate(prompt.body, collect());
          close();
          await markUsed(prompt);
          handlers.insert(text);
        });
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const text = renderTemplate(prompt.body, collect());
          close();
          await markUsed(prompt);
          handlers.run(text);
        });
      },
    }
  );
}

function promptMenu(prompt) {
  openModal(
    `<h2>${esc(prompt.title)}</h2>
     <p class="lead">${esc(prompt.collection || 'Library')} · ${esc(sourceLabel(prompt))}${prompt.uses ? ` · used ${prompt.uses}×` : ''}${prompt.lastUsedAt ? ` · ${relTime(prompt.lastUsedAt)}` : ''}</p>
     <div class="row">
       <button class="ghost" data-act="edit">Edit</button>
       <button class="ghost" data-act="duplicate">Duplicate</button>
       <button class="ghost" data-act="pin">${prompt.pinned ? 'Unpin' : 'Pin'}</button>
     </div>
     <div class="row">
       <button class="ghost" data-act="copy">Copy text</button>
       <button class="ghost" data-act="download">Download .md</button>
       <button class="ghost danger" data-act="delete">Delete</button>
     </div>`,
    {
      onMount(body, close) {
        const bind = (action, fn) => body.querySelector(`[data-act="${action}"]`).addEventListener('click', fn);
        bind('edit', () => {
          close();
          promptEditor(prompt);
        });
        bind('duplicate', async () => {
          close();
          const result = await store.addPrompts([
            {
              ...prompt,
              id: undefined,
              title: `${prompt.title} (copy)`,
              fingerprint: undefined,
              uses: 0,
              pinned: false,
            },
          ]);
          setPrompts(result.prompts);
          renderLibrary();
          toast('Duplicated', 'success');
        });
        bind('pin', async () => {
          close();
          const saved = await store.updatePrompt(prompt.id, { pinned: !prompt.pinned });
          if (saved) state.prompts = state.prompts.map((item) => (item.id === saved.id ? saved : item));
          renderLibrary();
        });
        bind('copy', async () => {
          await copyText(prompt.body);
          close();
          toast('Prompt copied', 'success');
        });
        bind('download', () => {
          download(`${prompt.title.replace(/[^\w -]+/g, '').slice(0, 60) || 'prompt'}.md`, `## ${prompt.title}\n\n${prompt.body}\n`, 'text/markdown');
        });
        bind('delete', async () => {
          close();
          const next = await store.deletePrompt(prompt.id);
          setPrompts(next);
          renderLibrary();
          toast('Prompt deleted');
        });
      },
    }
  );
}

function promptEditor(prompt = null) {
  const editing = Boolean(prompt);
  openModal(
    `<h2>${editing ? 'Edit prompt' : 'New prompt'}</h2>
     <form id="editor-form">
       <label class="field"><span>Title</span><input name="title" value="${esc(prompt?.title || '')}" required /></label>
       <label class="field"><span>Prompt body · use {{page}}, {{selection}} or your own {{placeholders}}</span><textarea name="body" rows="9" required>${esc(prompt?.body || '')}</textarea></label>
       <label class="field"><span>Collection</span><input name="collection" value="${esc(prompt?.collection || 'Library')}" /></label>
       <label class="field"><span>Tags (comma separated)</span><input name="tags" value="${esc((prompt?.tags || []).join(', '))}" /></label>
       <div class="modal-actions">
         <button type="button" class="ghost" data-act="cancel">Cancel</button>
         <button type="submit" class="primary">${editing ? 'Save' : 'Add prompt'}</button>
       </div>
     </form>`,
    {
      onMount(body, close) {
        const form = body.querySelector('#editor-form');
        form.querySelector('[data-act="cancel"]').addEventListener('click', close);
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const data = new FormData(form);
          const payload = {
            title: String(data.get('title') || '').trim(),
            body: String(data.get('body') || '').trim(),
            collection: String(data.get('collection') || '').trim() || 'Library',
            tags: String(data.get('tags') || ''),
          };
          if (!payload.body) {
            toast('A prompt needs a body', 'warn');
            return;
          }
          if (editing) {
            const saved = await store.updatePrompt(prompt.id, payload);
            if (saved) state.prompts = state.prompts.map((item) => (item.id === saved.id ? saved : item));
            toast('Prompt saved', 'success');
          } else {
            const result = await store.addPrompts([{ ...payload, source: { kind: 'manual', label: 'Manual' } }]);
            setPrompts(result.prompts);
            toast('Prompt added', 'success');
          }
          close();
          renderLibrary();
        });
      },
    }
  );
}

/* ---------------- import ---------------- */

function splitModeField(id, label = 'Split into prompts') {
  return `<label class="field"><span>${label}</span><select id="${id}">
    ${SPLIT_MODES.map(([value, text]) => `<option value="${value}">${text}</option>`).join('')}
  </select></label>`;
}

async function runImport(prompts, label) {
  const result = await store.addPrompts(prompts);
  setPrompts(result.prompts);
  renderLibrary();
  toast(
    `${label}: ${result.added} added${result.skipped ? `, ${result.skipped} duplicate${result.skipped === 1 ? '' : 's'} skipped` : ''}`,
    'success'
  );
  return result;
}

function openImportModal() {
  openModal(
    `<h2>Import prompts</h2>
     <p class="lead">Bring in a Google Takeout zip, Keep HTML/JSON, Google Doc links, any text, markdown, CSV or JSON file, or a skills collection straight from a GitHub repo or zip URL. Long documents are split into individual prompts.</p>
     <div class="modal-tabs">
       <button class="chip is-active" data-mode="keep">Google Keep</button>
       <button class="chip" data-mode="google">Drive &amp; Docs</button>
       <button class="chip" data-mode="file">File</button>
       <button class="chip" data-mode="remote">Skills URL</button>
       <button class="chip" data-mode="paste">Paste</button>
     </div>
     <div id="import-body"></div>`,
    {
      wide: true,
      onMount(body) {
        const tabs = $$('.modal-tabs .chip', body);
        const pane = body.querySelector('#import-body');
        const show = (mode) => {
          tabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.mode === mode));
          renderImportPane(mode, pane);
        };
        tabs.forEach((tab) => tab.addEventListener('click', () => show(tab.dataset.mode)));
        show('keep');
      },
    }
  );
}

function renderImportPane(mode, pane) {
  if (mode === 'keep') renderKeepPane(pane);
  if (mode === 'google') void renderGooglePane(pane);
  if (mode === 'file') renderFilePane(pane);
  if (mode === 'remote') renderRemotePane(pane);
  if (mode === 'paste') renderPastePane(pane);
}

function renderKeepPane(pane) {
  pane.innerHTML = `
    <label class="drop-zone" id="keep-drop" for="keep-file">
      <strong>Drop your Takeout zip, or click to pick files</strong>
      Google Takeout → Keep → export as HTML, then import the whole zip.<br />
      Loose .html notes and Keep JSON dumps work too.
    </label>
    <input type="file" id="keep-file" class="hidden" accept=".zip,.html,.htm,.json,application/zip,text/html,application/json" multiple />
    <p class="hint">Takeout path: takeout.google.com → deselect all → tick Keep → Export once → download the zip. Nothing is uploaded; parsing happens in this panel.</p>
    <div class="import-plan" id="keep-plan">Waiting for a file…</div>`;

  const drop = pane.querySelector('#keep-drop');
  const input = pane.querySelector('#keep-file');
  const plan = pane.querySelector('#keep-plan');

  input.addEventListener('change', async () => {
    if (!input.files?.length) return;
    plan.textContent = 'Reading…';
    try {
      const prompts = await collectKeepFiles([...input.files]);
      plan.innerHTML = `<b>${prompts.length}</b> note${prompts.length === 1 ? '' : 's'} parsed from ${input.files.length} file(s), importing…`;
      await runImport(prompts, 'Google Keep');
      closeModal();
    } catch (error) {
      plan.textContent = error.message;
      toast(error.message, 'error');
    }
  });

  for (const type of ['dragenter', 'dragover']) {
    drop.addEventListener(type, (event) => {
      event.preventDefault();
      drop.classList.add('is-over');
    });
  }
  for (const type of ['dragleave', 'drop']) {
    drop.addEventListener(type, () => drop.classList.remove('is-over'));
  }
  drop.addEventListener('drop', async (event) => {
    event.preventDefault();
    const files = [...(event.dataTransfer?.files || [])];
    if (!files.length) return;
    plan.textContent = 'Reading…';
    try {
      const prompts = await collectKeepFiles(files);
      plan.innerHTML = `<b>${prompts.length}</b> note${prompts.length === 1 ? '' : 's'} parsed from ${files.length} file(s), importing…`;
      await runImport(prompts, 'Google Keep');
      closeModal();
    } catch (error) {
      plan.textContent = error.message;
      toast(error.message, 'error');
    }
  });
}

async function collectKeepFiles(files) {
  const prompts = [];
  let zipSeen = false;
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      zipSeen = true;
      prompts.push(...(await importKeepTakeoutZip(await file.arrayBuffer())));
    } else if (/\.json$/i.test(file.name)) {
      prompts.push(...importKeepJson(await file.text(), 'Google Keep'));
    } else {
      prompts.push(...(await importKeepHtmlFiles([file], 'Google Keep')));
    }
  }
  if (!prompts.length) {
    throw new Error(
      zipSeen
        ? 'No Keep notes found in that archive.'
        : 'No notes parsed. Pick the Takeout .zip, a Keep .html note, or a Keep JSON dump.'
    );
  }
  return prompts;
}

async function renderGooglePane(pane) {
  const tokenRecord = await store.getDriveToken();
  const token = tokenRecord?.accessToken || null;

  pane.innerHTML = `
    ${splitModeField('g-mode')}
    <label class="field"><span>Paste Google Doc / Drive links (one per line)</span>
      <textarea id="g-links" rows="3" placeholder="https://docs.google.com/document/d/…&#10;https://drive.google.com/file/d/…"></textarea>
    </label>
    <div class="row"><button id="g-import-links" class="primary">Import links</button></div>
    <p class="hint">Docs and Sheets are exported as text using your browser's Google session, so you need to be signed in to Google or have the file shared publicly. Links are split into prompts by headings.</p>
    <h3>Your Drive</h3>
    <div id="g-drive">
      ${
        token
          ? `<div class="row"><button id="g-load" class="ghost">Load my Docs</button></div>`
          : `<div class="row"><button id="g-connect" class="ghost">Connect Google Drive</button></div>
             <p class="hint">Connecting needs an OAuth client ID saved in Settings. Link import works without it.</p>`
      }
    </div>
    <div id="g-files"></div>`;

  const links = pane.querySelector('#g-links');
  const plan = document.createElement('div');
  plan.className = 'import-plan';
  plan.id = 'g-plan';
  plan.textContent = 'Paste a link to see what will be imported.';
  pane.querySelector('#g-import-links').after(plan);

  links.addEventListener(
    'input',
    debounce(() => {
      const items = parseGoogleLinks(links.value);
      plan.innerHTML = items.length
        ? `<b>${items.length}</b> item${items.length === 1 ? '' : 's'} detected: ${items.map((item) => item.kind).join(', ')}. Prompt count is known after download.`
        : 'No Google Doc, Sheet or Drive link detected yet.';
    }, 200)
  );

  pane.querySelector('#g-import-links').addEventListener('click', async () => {
    const button = pane.querySelector('#g-import-links');
    button.disabled = true;
    plan.textContent = 'Downloading from Google…';
    try {
      const { prompts, failures } = await importGoogleLinks(links.value, { mode: pane.querySelector('#g-mode').value });
      plan.innerHTML = `<b>${prompts.length}</b> prompt${prompts.length === 1 ? '' : 's'} parsed, importing…`;
      await runImport(prompts, 'Google links');
      if (failures.length) toast(`${failures.length} link(s) failed. ${failures[0]}`, 'warn');
      else closeModal();
    } catch (error) {
      plan.textContent = error.message;
      toast(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });

  const connectButton = pane.querySelector('#g-connect');
  connectButton?.addEventListener('click', async () => {
    try {
      await connectDrive(state.settings.googleClientId);
      toast('Drive connected', 'success');
      await renderGooglePane(pane);
    } catch (error) {
      toast(error.message, 'error');
    }
  });

  pane.querySelector('#g-load')?.addEventListener('click', async () => {
    const filesBox = pane.querySelector('#g-files');
    const record = await store.getDriveToken();
    if (!record?.accessToken) {
      filesBox.innerHTML = '<p class="hint">Drive session expired. Connect again.</p>';
      return;
    }
    filesBox.textContent = 'Loading your Docs…';
    try {
      loadedDriveFiles = await listDriveFiles({ token: record.accessToken });
      if (!loadedDriveFiles.length) {
        filesBox.innerHTML = '<p class="hint">No Docs, text or markdown files found in your Drive.</p>';
        return;
      }
      filesBox.innerHTML = `
        <ul class="import-list">
          ${loadedDriveFiles
            .map(
              (file, index) =>
                `<li><input type="checkbox" id="drive-${index}" data-drive-id="${esc(file.id)}" checked /><label for="drive-${index}">${esc(file.name)}</label></li>`
            )
            .join('')}
        </ul>
        <div class="row"><button id="g-import-drive" class="primary">Import selected</button></div>`;
      filesBox.querySelector('#g-import-drive').addEventListener('click', async () => {
        const ids = new Set($$('input[data-drive-id]:checked', filesBox).map((input) => input.dataset.driveId));
        const chosen = loadedDriveFiles.filter((file) => ids.has(file.id));
        if (!chosen.length) {
          toast('Select at least one file', 'warn');
          return;
        }
        filesBox.querySelector('#g-import-drive').disabled = true;
        try {
          const { prompts, failures } = await importDriveFiles(chosen, {
            token: record.accessToken,
            mode: pane.querySelector('#g-mode').value,
          });
          await runImport(prompts, 'Google Drive');
          if (failures.length) toast(`${failures.length} file(s) failed. ${failures[0]}`, 'warn');
          else closeModal();
        } catch (error) {
          toast(error.message, 'error');
          filesBox.querySelector('#g-import-drive').disabled = false;
        }
      });
    } catch (error) {
      filesBox.innerHTML = `<p class="hint">${esc(error.message)}</p>`;
      toast(error.message, 'error');
    }
  });
}

function renderFilePane(pane) {
  pane.innerHTML = `
    <label class="drop-zone" id="data-drop" for="data-file">
      <strong>Drop files, or click to pick</strong>
      .md and SKILL.md, .txt, .csv, .json, a Takeout zip, a skills zip, or a saved .html page
    </label>
    <input type="file" id="data-file" class="hidden" multiple accept=".md,.markdown,.txt,.csv,.json,.html,.htm,.zip,text/plain,text/markdown,text/csv,application/json,application/zip,text/html" />
    ${splitModeField('data-mode')}
    <div class="import-plan" id="data-plan">Pick a file to see how many prompts it contains.</div>`;

  const drop = pane.querySelector('#data-drop');
  const input = pane.querySelector('#data-file');
  const mode = pane.querySelector('#data-mode');
  const plan = pane.querySelector('#data-plan');

  const collect = async (files) => {
    const prompts = [];
    let label = files.length === 1 ? files[0].name : `${files.length} files`;

    for (const file of files) {
      if (/\.zip$/i.test(file.name)) {
        const buffer = await file.arrayBuffer();
        let archivePrompts;
        try {
          archivePrompts = await importKeepTakeoutZip(buffer);
        } catch {
          // Not a Takeout archive: try a skills / markdown bundle instead.
          archivePrompts = await importMarkdownZip(buffer, { mode: mode.value });
        }
        prompts.push(...archivePrompts);
        label = file.name;
        continue;
      }
      if (/\.html?$/i.test(file.name)) {
        const html = await file.text();
        const note = parseKeepNoteHtml(html, file.name.replace(/\.[^.]+$/, ''));
        if (note) {
          prompts.push({
            title: note.title,
            body: note.body,
            tags: note.labels,
            collection: 'Google Keep',
            source: { kind: 'keep', label: 'Google Keep' },
          });
          continue;
        }
        const pieces = splitPrompts(htmlToText(html), { mode: mode.value, title: file.name });
        prompts.push(
          ...pieces.map((piece) => ({
            ...piece,
            collection: file.name.replace(/\.[^.]+$/, ''),
            source: { kind: 'file', label: 'Saved page' },
          }))
        );
        continue;
      }
      const text = await file.text();
      prompts.push(...importTextFile({ name: file.name, text, mode: mode.value }));
    }

    return { prompts, label };
  };

  const preview = async (fileList) => {
    const files = [...(fileList || [])];
    if (!files.length) return;
    plan.textContent = 'Reading…';
    try {
      const { prompts, label } = await collect(files);
      if (!prompts.length) throw new Error('No prompts found in those files.');
      plan.innerHTML = `<b>${prompts.length}</b> prompt${prompts.length === 1 ? '' : 's'} detected. Importing…`;
      await runImport(prompts, label);
      closeModal();
    } catch (error) {
      plan.textContent = error.message;
      toast(error.message, 'error');
    }
  };

  input.addEventListener('change', () => preview(input.files));
  for (const type of ['dragenter', 'dragover']) {
    drop.addEventListener(type, (event) => {
      event.preventDefault();
      drop.classList.add('is-over');
    });
  }
  for (const type of ['dragleave', 'drop']) {
    drop.addEventListener(type, () => drop.classList.remove('is-over'));
  }
  drop.addEventListener('drop', (event) => {
    event.preventDefault();
    preview(event.dataTransfer?.files);
  });
}

function renderRemotePane(pane) {
  pane.innerHTML = `
    <label class="field"><span>GitHub repository or zip URL</span>
      <input id="remote-url" placeholder="https://github.com/owner/repo or https://example.com/skills.zip" autocomplete="off" spellcheck="false" />
    </label>
    <div class="row"><button id="remote-preview" class="primary">Preview collection</button></div>
    <p class="hint">GitHub repos are read through the public GitHub API: <code>SKILL.md</code> files are imported when the repo has them, otherwise its markdown files. Zip URLs are downloaded and read in the panel. Nothing is added until you confirm below.</p>
    <div class="import-plan" id="remote-plan">Paste a link to preview what it contains.</div>
    <div id="remote-preview-box"></div>`;

  const urlInput = pane.querySelector('#remote-url');
  const previewButton = pane.querySelector('#remote-preview');
  const plan = pane.querySelector('#remote-plan');
  const box = pane.querySelector('#remote-preview-box');

  const fetchPreview = async () => {
    const value = urlInput.value.trim();
    if (!value) {
      toast('Paste a collection URL first', 'warn');
      return;
    }
    previewButton.disabled = true;
    box.innerHTML = '';
    plan.textContent = 'Fetching collection…';
    try {
      const collection = await collectRemoteCollection(value);
      renderRemotePreview(collection, plan, box);
    } catch (error) {
      plan.textContent = error.message;
      toast(error.message, 'error');
    } finally {
      previewButton.disabled = false;
    }
  };

  previewButton.addEventListener('click', fetchPreview);
  urlInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void fetchPreview();
  });
}

function renderRemotePreview({ prompts, label, filesRead, filesFailed, truncated }, plan, box) {
  const fileWord = filesRead === 1 ? 'file' : 'files';
  plan.innerHTML = `<b>${prompts.length}</b> prompt${prompts.length === 1 ? '' : 's'} from ${filesRead} ${fileWord} in ${esc(label)}${
    truncated ? ' (first 200 files)' : ''
  }${filesFailed ? ` · ${filesFailed} file(s) could not be read` : ''}. Review, then add the ones you want.`;

  box.innerHTML = `
    <ul class="import-list skill-preview">
      ${prompts
        .map(
          (prompt, index) => `<li>
            <input id="remote-item-${index}" type="checkbox" data-index="${index}" checked />
            <label for="remote-item-${index}">
              <strong>${esc(prompt.title)}</strong>
              <span>${esc(prompt.body.replace(/\s+/g, ' ').slice(0, 160))}</span>
            </label>
          </li>`
        )
        .join('')}
    </ul>
    <div class="row" style="margin-top:8px">
      <button id="remote-add" class="primary">Add ${prompts.length}</button>
      <button id="remote-toggle" class="ghost">Select none</button>
    </div>`;

  const boxes = [...box.querySelectorAll('input[data-index]')];
  const addButton = box.querySelector('#remote-add');
  const toggleButton = box.querySelector('#remote-toggle');

  const selected = () => prompts.filter((_, index) => boxes[index]?.checked);
  const update = () => {
    const count = selected().length;
    addButton.textContent = count ? `Add ${count}` : 'Add selected';
    addButton.disabled = count === 0;
    toggleButton.textContent = boxes.every((item) => item.checked) ? 'Select none' : 'Select all';
  };

  boxes.forEach((item) => item.addEventListener('change', update));
  toggleButton.addEventListener('click', () => {
    const selectAll = boxes.some((item) => !item.checked);
    boxes.forEach((item) => {
      item.checked = selectAll;
    });
    update();
  });
  addButton.addEventListener('click', async () => {
    const chosen = selected();
    if (!chosen.length) {
      toast('Select at least one prompt', 'warn');
      return;
    }
    addButton.disabled = true;
    try {
      await runImport(chosen, label);
      closeModal();
    } catch (error) {
      addButton.disabled = false;
      toast(error.message, 'error');
    }
  });
  update();
}

function renderPastePane(pane) {
  pane.innerHTML = `
    <label class="field"><span>Paste prompts</span><textarea id="paste-text" rows="8" placeholder="## Prompt one&#10;...&#10;&#10;## Prompt two&#10;..."></textarea></label>
    <label class="field"><span>Collection name</span><input id="paste-collection" value="Pasted prompts" /></label>
    ${splitModeField('paste-mode')}
    <div class="import-plan" id="paste-plan">Nothing pasted yet.</div>
    <div class="modal-actions"><button id="paste-import" class="primary">Import</button></div>`;

  const text = pane.querySelector('#paste-text');
  const mode = pane.querySelector('#paste-mode');
  const plan = pane.querySelector('#paste-plan');

  const update = () => {
    const count = splitPrompts(text.value, { mode: mode.value }).length;
    plan.innerHTML = text.value.trim()
      ? `<b>${count}</b> prompt${count === 1 ? '' : 's'} detected with “${mode.options[mode.selectedIndex].text}”.`
      : 'Nothing pasted yet.';
  };
  text.addEventListener('input', debounce(update, 150));
  mode.addEventListener('change', update);

  pane.querySelector('#paste-import').addEventListener('click', async () => {
    try {
      const collection = pane.querySelector('#paste-collection').value.trim() || 'Pasted prompts';
      if (!text.value.trim()) {
        toast('Paste some text first', 'warn');
        return;
      }
      const pieces = splitPrompts(text.value, { mode: mode.value, title: collection });
      if (!pieces.length) {
        toast('No prompts found in that text', 'warn');
        return;
      }
      await runImport(
        pieces.map((piece) => ({ ...piece, collection, source: { kind: 'manual', label: 'Pasted' } })),
        'Paste'
      );
      closeModal();
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}

