// Injected into the active tab by chrome.scripting.executeScript.
// Must stay self-contained: no imports, no closure references.

export function extractPageContext() {
  const SKIP = [
    'script', 'style', 'noscript', 'template', 'svg', 'canvas', 'iframe', 'video', 'audio',
    'object', 'embed', 'nav', 'footer', 'aside', 'form', 'button', 'select', 'input',
    'textarea', 'label', 'dialog', 'menu',
  ].join(',');
  const SKIP_SELECTORS = [
    '[aria-hidden="true"]', '[hidden]', '[role="navigation"]', '[role="banner"]',
    '[role="complementary"]', '[role="contentinfo"]', '[role="search"]',
  ].join(',');

  const clean = (text) =>
    String(text || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();

  const meta = (name) => {
    const el =
      document.querySelector(`meta[name="${name}"]`) ||
      document.querySelector(`meta[property="${name}"]`) ||
      document.querySelector(`meta[property="og:${name}"]`);
    return el?.getAttribute('content')?.trim() || '';
  };

  const selection = String(window.getSelection?.()?.toString() || '').trim();

  // Score candidate content roots by how much readable text they hold.
  const candidates = [
    ...document.querySelectorAll(
      'article, main, [role="main"], [itemprop="articleBody"], .post-content, .entry-content, .article-body, .markdown-body, #content, #main, .content'
    ),
  ];
  let root = null;
  let bestScore = 0;
  for (const node of candidates) {
    const text = node.innerText || '';
    const score = text.trim().length + (node.tagName === 'ARTICLE' ? 500 : 0);
    if (score > bestScore) {
      bestScore = score;
      root = node;
    }
  }
  if (!root || bestScore < 400) root = document.body;
  if (!root) return { title: document.title, url: location.href, text: '', headings: [], links: [], images: [], selection };

  const clone = root.cloneNode(true);
  clone.querySelectorAll(SKIP).forEach((n) => n.remove());
  clone.querySelectorAll(SKIP_SELECTORS).forEach((n) => n.remove());
  clone.querySelectorAll('table').forEach((table) => {
    const rows = [...table.querySelectorAll('tr')].map((tr) =>
      [...tr.querySelectorAll('th,td')].map((cell) => clean(cell.innerText).replace(/\n+/g, ' ')).join(' | ')
    );
    const pre = document.createElement('pre');
    pre.textContent = rows.join('\n');
    table.replaceWith(pre);
  });

  const serialize = (node, depth) => {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue.replace(/\s+/g, ' ');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName.toLowerCase();
    const kids = (n) => [...n.childNodes].map((child) => serialize(child, depth + 1)).join('');

    if (/^h[1-6]$/.test(tag)) {
      const level = Math.min(Number(tag[1]) + 1, 6);
      const text = clean(kids(node)).replace(/\n/g, ' ');
      return text ? `\n\n${'#'.repeat(level)} ${text}\n\n` : '';
    }
    if (tag === 'li') {
      const text = clean(kids(node)).replace(/\n+/g, ' ');
      return text ? `\n- ${text}` : '';
    }
    if (tag === 'pre') return `\n\n\`\`\`\n${node.innerText.trim()}\n\`\`\`\n\n`;
    if (tag === 'code' && node.parentElement?.tagName.toLowerCase() !== 'pre') {
      const text = node.innerText.trim();
      return text ? `\`${text}\`` : '';
    }
    if (tag === 'blockquote') return `\n\n> ${clean(node.innerText).replace(/\n/g, '\n> ')}\n\n`;
    if (tag === 'br') return '\n';
    if (tag === 'img') {
      const alt = node.getAttribute('alt')?.trim();
      return alt ? `\n[image: ${alt}]\n` : '';
    }
    if (tag === 'hr') return '\n\n---\n\n';
    if (/^(p|div|section|article|header|figure|figcaption|dd|dt)$/.test(tag)) {
      const inner = kids(node);
      return inner.trim() ? `\n\n${inner}\n\n` : '';
    }
    return kids(node);
  };

  const text = clean(serialize(clone, 0)).slice(0, 120000);
  const fallback = clean(document.body?.innerText || '').slice(0, 120000);
  const finalText = text.length > 120 ? text : fallback;

  const headings = [...document.querySelectorAll('h1, h2, h3')]
    .map((h) => clean(h.innerText).replace(/\n/g, ' '))
    .filter(Boolean)
    .slice(0, 40);

  const seenLinks = new Set();
  const links = [];
  for (const a of document.querySelectorAll('a[href]')) {
    const href = a.href;
    if (!href || href.startsWith('javascript:') || seenLinks.has(href)) continue;
    const label = clean(a.innerText).replace(/\n/g, ' ').slice(0, 120);
    if (!label) continue;
    seenLinks.add(href);
    links.push({ text: label, href });
    if (links.length >= 40) break;
  }

  return {
    title: document.title || meta('title') || location.hostname,
    url: location.href,
    description: meta('description') || meta('og:description') || '',
    siteName: meta('og:site_name') || location.hostname,
    author: meta('author') || meta('article:author') || '',
    language: document.documentElement.lang || '',
    text: finalText,
    wordCount: finalText ? finalText.split(/\s+/).length : 0,
    headings,
    links,
    media: [...document.querySelectorAll('img[src]')]
      .map((img) => ({ src: img.src, alt: img.getAttribute('alt') || '' }))
      .filter((i) => i.alt)
      .slice(0, 20),
    selection,
    truncated: finalText.length >= 120000,
    capturedAt: Date.now(),
  };
}
