// Checks the Node requirement before a script loads the evidence cache.
// Run by the `pretest:agent`, `preeval` and `preeval:dry` npm hooks.
//
// It deliberately imports nothing but the plain ESM module: on Node 20 a
// TypeScript import (or anything reaching `lib/cache/db.ts`) would die with a
// bare `Cannot find module 'node:sqlite'` before this could say anything.
//
// The check compares versions and then imports `node:sqlite` itself, because a
// number alone is not enough: 22.5–22.12 and 23.0–23.3 pass a `>= 22.13.0`
// comparison yet keep the module behind `--experimental-sqlite`.
import { assertSqliteLoads } from '../lib/runtime.mjs';

await assertSqliteLoads();
