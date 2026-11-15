import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { EvidenceNode } from '../types';

export const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'cache.sqlite');

let instance: DatabaseSync | null = null;

export function dbPath(): string {
  return process.env.CACHE_DB || DEFAULT_DB_PATH;
}

export function getDb(): DatabaseSync {
  if (instance) return instance;
  const file = dbPath();
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });

  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS fetch_cache (
      url TEXT NOT NULL,
      day TEXT NOT NULL,
      status INTEGER NOT NULL,
      content_type TEXT NOT NULL,
      body TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      final_url TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (url, day)
    );
    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      canonical_url TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      source_tool TEXT NOT NULL,
      extractor_version TEXT NOT NULL,
      text TEXT NOT NULL,
      simhash TEXT NOT NULL,
      confidence REAL NOT NULL,
      snapshot_url TEXT
    );
    CREATE TABLE IF NOT EXISTS snapshots (
      url TEXT PRIMARY KEY,
      snapshot_url TEXT,
      attempted_at TEXT NOT NULL,
      ok INTEGER NOT NULL
    );
  `);
  // Older local caches predate final_url; add it without losing rows.
  try {
    db.exec("ALTER TABLE fetch_cache ADD COLUMN final_url TEXT NOT NULL DEFAULT ''");
  } catch {
    /* column already exists */
  }
  instance = db;
  return db;
}

export function resetDb(): void {
  instance?.close();
  instance = null;
}

export interface CachedPage {
  url: string;
  day: string;
  status: number;
  contentType: string;
  body: string;
  fetchedAt: string;
  finalUrl: string;
}

export function cacheGet(url: string, day: string): CachedPage | null {
  const row = getDb()
    .prepare('SELECT url, day, status, content_type, body, fetched_at, final_url FROM fetch_cache WHERE url = ? AND day = ?')
    .get(url, day) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    url: String(row.url),
    day: String(row.day),
    status: Number(row.status),
    contentType: String(row.content_type),
    body: String(row.body),
    fetchedAt: String(row.fetched_at),
    finalUrl: String(row.final_url ?? ''),
  };
}

export function cachePut(page: CachedPage): void {
  getDb()
    .prepare(
      `INSERT INTO fetch_cache (url, day, status, content_type, body, fetched_at, final_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(url, day) DO UPDATE SET
         status = excluded.status,
         content_type = excluded.content_type,
         body = excluded.body,
         fetched_at = excluded.fetched_at,
         final_url = excluded.final_url`
    )
    .run(page.url, page.day, page.status, page.contentType, page.body, page.fetchedAt, page.finalUrl);
}

export function saveEvidenceNode(node: EvidenceNode): void {
  getDb()
    .prepare(
      `INSERT INTO evidence (id, url, canonical_url, fetched_at, sha256, source_tool, extractor_version, text, simhash, confidence, snapshot_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET confidence = excluded.confidence, snapshot_url = excluded.snapshot_url`
    )
    .run(
      node.id,
      node.url,
      node.canonical_url,
      node.fetched_at,
      node.sha256,
      node.source_tool,
      node.extractor_version,
      node.text,
      node.simhash,
      node.confidence,
      node.snapshot_url ?? null
    );
}

export interface SnapshotRow {
  url: string;
  snapshotUrl: string | null;
  attemptedAt: string;
  ok: boolean;
}

export function getSnapshot(url: string): SnapshotRow | null {
  const row = getDb()
    .prepare('SELECT url, snapshot_url, attempted_at, ok FROM snapshots WHERE url = ?')
    .get(url) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    url: String(row.url),
    snapshotUrl: row.snapshot_url == null ? null : String(row.snapshot_url),
    attemptedAt: String(row.attempted_at),
    ok: Number(row.ok) === 1,
  };
}

export function saveSnapshot(url: string, snapshotUrl: string | null, attemptedAt: string): void {
  getDb()
    .prepare(
      `INSERT INTO snapshots (url, snapshot_url, attempted_at, ok) VALUES (?, ?, ?, ?)
       ON CONFLICT(url) DO UPDATE SET snapshot_url = excluded.snapshot_url, attempted_at = excluded.attempted_at, ok = excluded.ok`
    )
    .run(url, snapshotUrl, attemptedAt, snapshotUrl ? 1 : 0);
}
