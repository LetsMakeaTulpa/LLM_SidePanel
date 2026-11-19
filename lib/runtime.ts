/**
 * Runtime requirement for the agent.
 *
 * `lib/cache/db.ts` uses the built-in `node:sqlite` module, which only exists
 * from Node 22.5.0 on. Below that the import fails with a bare
 * `Cannot find module 'node:sqlite'`, so the server checks the version before
 * anything loads it and says what to do instead.
 */
export const MIN_NODE = [22, 5, 0] as const;

export function parseNodeVersion(version: string): [number, number, number] {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!match) return [0, 0, 0];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isSupportedNode(version: string = process.version): boolean {
  const [major, minor, patch] = parseNodeVersion(version);
  const [minMajor, minMinor, minPatch] = MIN_NODE;
  if (major !== minMajor) return major > minMajor;
  if (minor !== minMinor) return minor > minMinor;
  return patch >= minPatch;
}

export function nodeVersionMessage(version: string = process.version): string {
  return [
    `This agent needs Node ${MIN_NODE.join('.')} or newer, but it is running on ${version}.`,
    '',
    'Node 22.5+ is required because the evidence cache uses the built-in `node:sqlite`',
    'module, which does not exist in older versions.',
    '',
    'Fix it with the pinned version in .nvmrc:',
    '',
    '  nvm use        # or: nvm install 22',
    '  npm ci',
    '',
    'Then start the app again.',
  ].join('\n');
}

/** Prints the requirement and exits; a no-op on a supported version. */
export function assertSupportedNode(version: string = process.version): void {
  if (isSupportedNode(version)) return;
  console.error(nodeVersionMessage(version));
  process.exit(1);
}
