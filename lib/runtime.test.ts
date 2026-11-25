import test from 'node:test';
import assert from 'node:assert/strict';
import { checkFloor } from '../scripts/node-floor.mjs';
import {
  MIN_NODE,
  assertSqliteLoads,
  isSupportedNode,
  nodeVersionMessage,
  parseNodeVersion,
  sqliteLoads,
  sqliteProbeMessage,
} from './runtime';

test('22.12.999 is below the unflagged node:sqlite boundary', () => {
  assert.equal(isSupportedNode('v22.4.999'), false);
  assert.equal(isSupportedNode('v22.12.999'), false);
});

test('22.13.0 is the first supported version', () => {
  assert.equal(isSupportedNode('v22.13.0'), true);
});

test('a leading v and surrounding whitespace are ignored', () => {
  assert.equal(isSupportedNode('  v22.13.0\n'), true);
  assert.equal(isSupportedNode('  v22.12.999\n'), false);
  assert.deepEqual(parseNodeVersion(' v22.13.1 '), [22, 13, 1]);
});

test('a newer major is treated as supported', () => {
  assert.equal(isSupportedNode('v23.0.0'), true);
});

test('a garbage version is treated as unsupported', () => {
  assert.equal(isSupportedNode('not-a-version'), false);
  assert.deepEqual(parseNodeVersion('not-a-version'), [0, 0, 0]);
});

test('the message names the running and the minimum version', () => {
  const message = nodeVersionMessage('v22.12.999');
  assert.match(message, new RegExp(MIN_NODE.join('\\.')));
  assert.match(message, /v22\.12\.999/);
});

test('node:sqlite actually loads on the runtime running this test', async () => {
  assert.equal(await sqliteLoads(), true);
});

test('the probe failure message explains the flag window', () => {
  const message = sqliteProbeMessage('v23.0.0');
  assert.match(message, /v23\.0\.0/);
  assert.match(message, /did not load/);
  assert.match(message, /--experimental-sqlite/);
  assert.match(message, /\.nvmrc/);
});

test('assertSqliteLoads stays quiet on a supported runtime', async () => {
  await assert.doesNotReject(() => assertSqliteLoads('v22.13.0'));
});

test('.nvmrc, engines, CI and the docs agree with MIN_NODE', () => {
  assert.deepEqual(checkFloor(), [], 'each message names the stale copy; fix it to match MIN_NODE');
});
