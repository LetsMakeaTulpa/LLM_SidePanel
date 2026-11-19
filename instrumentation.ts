/**
 * Runs once when the Next.js server starts (dev and start), before any route.
 * On a Node older than 22.5 the app would otherwise crash on the first
 * `node:sqlite` import with `Cannot find module 'node:sqlite'`.
 */
export async function register(): Promise<void> {
  // Instrumentation is also compiled for the edge runtime, where process.version
  // is not meaningful. Everything else in this app is Node.
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { assertSupportedNode } = await import('./lib/runtime');
  assertSupportedNode();
}
