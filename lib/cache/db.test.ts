import test from 'node:test';
import assert from 'node:assert/strict';
import { cacheGet, cachePut, getSnapshot, resetDb, saveEvidenceNode, saveSnapshot } from './db';
import type { EvidenceNode } from '../types';

test('SQLite fetch cache is keyed by URL and day', () => {
  process.env.CACHE_DB = ':memory:';
  resetDb();

  const day = '2026-01-01';
  assert.equal(cacheGet('https://example.com/a', day), null);

  cachePut({
    url: 'https://example.com/a',
    day,
    status: 200,
    contentType: 'text/html',
    body: '<p>cached</p>',
    fetchedAt: '2026-01-01T00:00:00.000Z',
    finalUrl: 'https://example.com/a/',
  });

  const hit = cacheGet('https://example.com/a', day);
  assert.equal(hit?.body, '<p>cached</p>');
  assert.equal(hit?.finalUrl, 'https://example.com/a/');
  assert.equal(cacheGet('https://example.com/a', '2026-01-02'), null);

  resetDb();
});

test('evidence and snapshot rows persist', () => {
  process.env.CACHE_DB = ':memory:';
  resetDb();

  const node: EvidenceNode = {
    id: 'ev_test',
    url: 'https://example.com/a',
    canonical_url: 'https://example.com/a',
    fetched_at: '2026-01-01T00:00:00.000Z',
    sha256: 'a'.repeat(64),
    source_tool: 'fetch_page',
    extractor_version: 'test-v1',
    text: 'Some evidence text.',
    simhash: '0'.repeat(16),
    confidence: 0.7,
    provenance: ['fetch_page'],
    snapshot_url: 'https://web.archive.org/web/2026/https://example.com/a',
  };

  saveEvidenceNode(node);
  saveSnapshot(node.url, node.snapshot_url ?? null, node.fetched_at);

  const snapshot = getSnapshot(node.url);
  assert.equal(snapshot?.ok, true);
  assert.equal(snapshot?.snapshotUrl, node.snapshot_url);

  resetDb();
});
