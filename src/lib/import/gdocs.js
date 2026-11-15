// Google Docs / Drive import.
//
// Two paths, no server required:
//  1. Link import — pull a Doc/Sheet/Drive file's text with the browser's own
//     Google session (export endpoints), which works for anything the user can
//     already open.
//  2. Drive API — an optional OAuth client the user creates, so we can list and
//     pull files by picker/search instead of pasting links.

import { getDriveToken, setDriveToken, clearDriveToken } from '../store.js';
import { splitPrompts } from '../prompts.js';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const DOC_MIME = 'application/vnd.google-apps.document';
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';

export function parseGoogleLinks(input) {
  const found = [];
  const seen = new Set();
  const patterns = [
    { kind: 'doc', re: /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]{20,})/ },
    { kind: 'sheet', re: /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/ },
    { kind: 'file', re: /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{20,})/ },
    { kind: 'folder', re: /drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]{20,})/ },
    { kind: 'file', re: /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]{20,})/ },
    { kind: 'file', re: /drive\.google\.com\/uc\?.*?\bid=([a-zA-Z0-9_-]{20,})/ },
  ];
  for (const line of String(input || '').split(/[\s,]+/)) {
    for (const { kind, re } of patterns) {
      const match = re.exec(line);
      if (match && !seen.has(match[1])) {
        seen.add(match[1]);
        found.push({ kind, id: match[1], url: line });
        break;
      }
    }
  }
  return found;
}

async function assertOk(res, what) {
  if (res.ok) return;
  let detail = '';
  try {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      detail = json?.error?.message || text;
    } catch {
      detail = text;
    }
  } catch {
    /* ignore */
  }
  const hint =
    res.status === 401 || res.status === 403
      ? ' Sign in to Google in this browser, share the file as "Anyone with the link", or connect Drive below.'
      : res.status === 404
        ? ' The file may have moved or you may not have access.'
        : '';
  throw new Error(`${what} failed (${res.status}).${hint}${detail ? ` ${String(detail).slice(0, 200)}` : ''}`);
}

function looksLikeSignIn(text, url) {
  const haystack = `${url || ''} ${text.slice(0, 4000)}`;
  return /accounts\.google\.com|ServiceLogin|Sign in - Google Accounts/i.test(haystack);
}

/* ---------- link import (browser session) ---------- */

export async function fetchDocText(id) {
  const res = await fetch(`https://docs.google.com/document/d/${id}/export?format=txt`, { credentials: 'include' });
  await assertOk(res, 'Doc export');
  const text = await res.text();
  if (looksLikeSignIn(text, res.url)) throw new Error('Google returned a sign-in page. Sign in to Google in this browser, or connect Drive in Settings.');
  return text;
}

export async function fetchSheetCsv(id) {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv`, { credentials: 'include' });
  await assertOk(res, 'Sheet export');
  const text = await res.text();
  if (looksLikeSignIn(text, res.url)) throw new Error('Google returned a sign-in page. Sign in to Google in this browser, or connect Drive in Settings.');
  return text;
}

export async function fetchDriveFileText(id) {
  const res = await fetch(`https://drive.google.com/uc?export=download&id=${id}`, { credentials: 'include' });
  await assertOk(res, 'Drive download');
  const type = res.headers.get('content-type') || '';
  if (!/text\/|json|csv|markdown|octet-stream/i.test(type)) {
    throw new Error(`That Drive file is ${type || 'an unsupported type'}; only text-like files can be imported.`);
  }
  return res.text();
}

export async function fetchGoogleItemText(item) {
  if (item.kind === 'doc') return fetchDocText(item.id);
  if (item.kind === 'sheet') return fetchSheetCsv(item.id);
  return fetchDriveFileText(item.id);
}

/**
 * Turn pasted links into prompts. Each Doc is split into prompts by its
 * headings, so one "prompt doc" can become dozens of prompts.
 */
export async function importGoogleLinks(linksText, { mode = 'auto', collection = '' } = {}) {
  const items = parseGoogleLinks(linksText).filter((item) => item.kind !== 'folder');
  if (!items.length) throw new Error('No Google Doc, Sheet or Drive file links were found.');
  if (items.length > 20) throw new Error('Import at most 20 links at a time.');

  const prompts = [];
  const failures = [];
  for (const item of items) {
    try {
      const text = await fetchGoogleItemText(item);
      const label = collection || `Google ${item.kind === 'doc' ? 'Docs' : item.kind === 'sheet' ? 'Sheets' : 'Drive'}`;
      const pieces = splitPrompts(text, { mode, title: `${label} ${item.id.slice(0, 6)}` });
      for (const piece of pieces) {
        prompts.push({
          ...piece,
          tags: ['google'],
          collection: label,
          source: { kind: item.kind === 'doc' ? 'gdoc' : 'gdrive', label, ref: item.id, url: item.url },
        });
      }
    } catch (error) {
      failures.push(`${item.id.slice(0, 8)}: ${error.message}`);
    }
  }

  if (!prompts.length) throw new Error(failures[0] || 'Nothing could be imported from those links.');
  return { prompts, failures };
}

/* ---------- Drive API (optional OAuth client) ---------- */

export async function connectDrive(clientId) {
  if (!clientId) throw new Error('Add your Google OAuth client ID in Settings first.');
  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('scope', DRIVE_SCOPE);
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('include_granted_scopes', 'true');

  const responseUrl = await chrome.identity.launchWebAuthFlow({ url: authUrl.toString(), interactive: true });
  if (!responseUrl) throw new Error('Google sign-in was cancelled.');

  const params = new URLSearchParams((responseUrl.split('#')[1] || '').replace(/^\?/, ''));
  const accessToken = params.get('access_token');
  if (!accessToken) throw new Error('Google did not return an access token. Check the client ID and redirect URI.');

  const expiresIn = Number(params.get('expires_in') || 3600);
  const token = { accessToken, expiresAt: Date.now() + expiresIn * 1000 - 60000 };
  await setDriveToken(token);
  return token;
}

export async function disconnectDrive() {
  await clearDriveToken();
}

async function accessToken({ interactive = false, clientId = '' } = {}) {
  const cached = await getDriveToken();
  if (cached) return cached.accessToken;
  if (!interactive) return null;
  const token = await connectDrive(clientId);
  return token.accessToken;
}

async function driveApi(path, { token, method = 'GET' } = {}) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  await assertOk(res, 'Drive API');
  return res;
}

export async function listDriveFiles({ token, query = '', pageSize = 50 } = {}) {
  const clauses = ['trashed = false', `(mimeType = '${DOC_MIME}' or mimeType = 'text/plain' or mimeType = 'text/markdown' or mimeType = 'application/json')`];
  if (query) clauses.push(`name contains '${String(query).replace(/'/g, "\\'")}'`);
  const params = new URLSearchParams({
    q: clauses.join(' and '),
    orderBy: 'modifiedTime desc',
    pageSize: String(pageSize),
    fields: 'files(id,name,mimeType,modifiedTime,webViewLink)',
  });
  const res = await driveApi(`files?${params}`, { token });
  const json = await res.json();
  return json.files || [];
}

export async function fetchDriveApiText(file, token) {
  if (file.mimeType === DOC_MIME) {
    const res = await driveApi(`files/${file.id}/export?mimeType=text/plain`, { token });
    return res.text();
  }
  const res = await driveApi(`files/${file.id}?alt=media`, { token });
  return res.text();
}

export async function importDriveFiles(files, { token, mode = 'auto', collection = 'Google Drive' } = {}) {
  if (!token) throw new Error('Connect Google Drive first.');
  const prompts = [];
  const failures = [];
  for (const file of files) {
    try {
      const text = await fetchDriveApiText(file, token);
      const pieces = splitPrompts(text, { mode, title: file.name.replace(/\.\w+$/, '') });
      for (const piece of pieces) {
        prompts.push({
          ...piece,
          tags: ['google', 'drive'],
          collection,
          source: { kind: 'gdrive', label: collection, ref: file.id, url: file.webViewLink || '' },
        });
      }
    } catch (error) {
      failures.push(`${file.name}: ${error.message}`);
    }
  }
  if (!prompts.length) throw new Error(failures[0] || 'Nothing could be imported from Drive.');
  return { prompts, failures };
}

export async function ensureDriveAccess(clientId) {
  return accessToken({ interactive: true, clientId });
}
