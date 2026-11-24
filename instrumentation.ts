/**
 * Runs once when the Next.js server starts (dev and start), before any route.
 * On a Node older than 22.13 the app would otherwise crash on the first
 * `node:sqlite` import with `Cannot find module 'node:sqlite'`; on 22.5–22.12 the
 * module exists but is flagged, so the check imports it rather than trusting the
 * version number.
 */
export async function register(): Promise<void> {
  // Instrumentation is also compiled for the edge runtime, where process.version
  // is not meaningful. Everything else in this app is Node.
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { assertSqliteLoads } = await import('./lib/runtime');
  await assertSqliteLoads();
}
