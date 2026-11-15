// Small DOM + rendering helpers shared by the panel and the library.

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function truncate(text, limit) {
  const value = String(text || '');
  if (!value || value.length <= limit) return value;
  return `${value.slice(0, limit)}\n\n[…truncated ${value.length - limit} characters]`;
}

export function wordCount(text) {
  const trimmed = String(text || '').trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function relTime(ts) {
  const value = Number(ts) || 0;
  if (!value) return '';
  const diff = Date.now() - value;
  const minute = 60000;
  const hour = minute * 60;
  const day = hour * 24;
  if (diff < minute) return 'just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < day * 30) return `${Math.floor(diff / day)}d ago`;
  return new Date(value).toLocaleDateString();
}

let toastTimer = null;
export function toast(message, kind = 'info') {
  const box = $('#toast');
  if (!box) return;
  box.textContent = message;
  box.className = `toast ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    box.className = 'toast hidden';
  }, kind === 'error' ? 6000 : 3200);
}

/* ---------- markdown-lite ---------- */

function inlineMd(text) {
  return text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noreferrer">$2</a>');
}

function renderBlocks(text) {
  const lines = esc(text).split('\n');
  const out = [];
  let list = null;
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(`<p>${inlineMd(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      out.push(`<${list.tag}>${list.items.map((item) => `<li>${inlineMd(item)}</li>`).join('')}</${list.tag}>`);
      list = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    let match;
    if ((match = /^(#{1,6})\s+(.*)$/.exec(line))) {
      flushParagraph();
      flushList();
      const level = Math.min(match[1].length + 2, 6);
      out.push(`<h${level}>${inlineMd(match[2])}</h${level}>`);
    } else if ((match = /^[-*\u2022]\s+(.*)$/.exec(line))) {
      flushParagraph();
      if (!list || list.tag !== 'ul') {
        flushList();
        list = { tag: 'ul', items: [] };
      }
      list.items.push(match[1]);
    } else if ((match = /^\d+[.)]\s+(.*)$/.exec(line))) {
      flushParagraph();
      if (!list || list.tag !== 'ol') {
        flushList();
        list = { tag: 'ol', items: [] };
      }
      list.items.push(match[1]);
    } else if ((match = /^&gt;\s?(.*)$/.exec(line))) {
      flushParagraph();
      flushList();
      out.push(`<blockquote>${inlineMd(match[1])}</blockquote>`);
    } else if (/^(-{3,}|\*{3,})$/.test(line)) {
      flushParagraph();
      flushList();
      out.push('<hr />');
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return out.join('');
}

export function renderMarkdown(source) {
  const parts = String(source ?? '').split(/```/);
  let html = '';
  parts.forEach((part, index) => {
    if (index % 2 === 1) {
      const newline = part.indexOf('\n');
      const language = newline >= 0 ? part.slice(0, newline).trim() : '';
      const code = newline >= 0 ? part.slice(newline + 1) : part;
      html += `<pre><code data-lang="${esc(language)}">${esc(code.replace(/\n$/, ''))}</code></pre>`;
    } else {
      html += renderBlocks(part);
    }
  });
  return html;
}

/* ---------- modal ---------- */

let currentModal = null;

export function openModal(html, { onMount, wide = false } = {}) {
  closeModal();
  const root = $('#modal-root');
  root.innerHTML = `
    <div class="modal-backdrop" data-close="1">
      <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">
        <button class="modal-close icon-btn" data-close="1" aria-label="Close">✕</button>
        <div class="modal-body">${html}</div>
      </div>
    </div>`;
  const backdrop = root.firstElementChild;
  backdrop.addEventListener('click', (event) => {
    if (event.target.dataset.close === '1') closeModal();
  });
  currentModal = backdrop;

  const onKey = (event) => {
    if (event.key === 'Escape') {
      closeModal();
    }
  };
  document.addEventListener('keydown', onKey);
  backdrop._onKey = onKey;

  onMount?.(backdrop.querySelector('.modal-body'), closeModal);
  return closeModal;
}

export function closeModal() {
  const root = $('#modal-root');
  if (currentModal?._onKey) document.removeEventListener('keydown', currentModal._onKey);
  currentModal = null;
  if (root) root.innerHTML = '';
}

export function download(filename, content, type = 'application/json') {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function debounce(fn, delay = 150) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
