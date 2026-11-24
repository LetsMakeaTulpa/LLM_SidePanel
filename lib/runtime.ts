/**
 * Typed entry point for the Node requirement. The implementation lives in
 * `runtime.mjs` so the npm scripts (`scripts/require-node.mjs`) can check the
 * version with a bare `node`, before `tsx` or `node:sqlite` is loaded.
 */
export {
  MIN_NODE,
  parseNodeVersion,
  isSupportedNode,
  nodeVersionMessage,
  sqliteLoads,
  sqliteProbeMessage,
  assertSqliteLoads,
} from './runtime.mjs';
