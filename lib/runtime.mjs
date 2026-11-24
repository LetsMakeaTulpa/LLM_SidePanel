/**
 * Runtime requirement for the agent, in plain ESM so the npm entry points can
 * check it with a bare `node` before any TypeScript or `node:sqlite` loads.
 *
 * `lib/cache/db.ts` uses the built-in `node:sqlite` module. It was added in
 * 22.5.0 but stayed behind `--experimental-sqlite` until 22.13.0, so 22.5–22.12
 * fail with `ERR_UNKNOWN_BUILTIN_MODULE` and anything older fails with
 * `Cannot find module 'node:sqlite'`. The entry points check the version first
 * and say what to do instead.
 *
 * `lib/runtime.ts` re-exports these for TypeScript callers.
 */

/** @type {readonly [number, number, number]} */
// 22.13.0 is the first release where `node:sqlite` loads without a flag.
export const MIN_NODE = [22, 13, 0];

/**
 * @param {string} version
 * @returns {[number, number, number]}
 */
export function parseNodeVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!match) return [0, 0, 0];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * @param {string} [version]
 * @returns {boolean}
 */
export function isSupportedNode(version = process.version) {
  const [major, minor, patch] = parseNodeVersion(version);
  const [minMajor, minMinor, minPatch] = MIN_NODE;
  if (major !== minMajor) return major > minMajor;
  if (minor !== minMinor) return minor > minMinor;
  return patch >= minPatch;
}

/**
 * @param {string} [version]
 * @returns {string}
 */
export function nodeVersionMessage(version = process.version) {
  return [
    `This agent needs Node ${MIN_NODE.join('.')} or newer, but it is running on ${version}.`,
    '',
    'Node 22.13+ is required because the evidence cache uses the built-in `node:sqlite`',
    'module: it existed from 22.5.0 but stayed behind `--experimental-sqlite` until',
    '22.13.0, and does not exist in older versions.',
    '',
    'Fix it with the pinned version in .nvmrc:',
    '',
    '  nvm use        # or: nvm install 22',
    '  npm ci',
    '',
    'Then start the app again.',
  ].join('\n');
}

/**
 * The version number is only a proxy: `node:sqlite` also needs a flag on
 * 22.5–22.12 and on 23.0–23.3. Import the module the cache actually uses.
 * @returns {Promise<boolean>}
 */
export async function sqliteLoads() {
  try {
    const sqlite = await import('node:sqlite');
    return typeof sqlite.DatabaseSync === 'function';
  } catch {
    return false;
  }
}

/**
 * @param {string} [version]
 * @returns {string}
 */
export function sqliteProbeMessage(version = process.version) {
  return [
    `Node ${version} cannot run the evidence cache: \`node:sqlite\` did not load.`,
    '',
    'The version is at or above the 22.13.0 minimum, but the module is still behind',
    '`--experimental-sqlite` here — true on 22.5–22.12 and 23.0–23.3. That flag cannot',
    'be supplied through NODE_OPTIONS, so the fix is a runtime that loads it by default.',
    '',
    'Fix it with the pinned version in .nvmrc:',
    '',
    '  nvm use        # or: nvm install 22',
    '  npm ci',
    '',
    'Then start the app again.',
  ].join('\n');
}

/**
 * Version check plus a real `node:sqlite` import; prints why and exits on
 * either failure, and is a no-op on a runtime that can run the cache.
 * @param {string} [version]
 * @returns {Promise<void>}
 */
export async function assertSqliteLoads(version = process.version) {
  if (!isSupportedNode(version)) {
    console.error(nodeVersionMessage(version));
    process.exit(1);
  }
  if (!(await sqliteLoads())) {
    console.error(sqliteProbeMessage(version));
    process.exit(1);
  }
}
