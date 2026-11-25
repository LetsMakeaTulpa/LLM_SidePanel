#!/usr/bin/env node
/**
 * The Node floor lives in one place: `MIN_NODE` in `lib/runtime.mjs`. Everything
 * else that has to name it — `.nvmrc`, `engines.node`, the CI matrix, the docs —
 * either reads it from here or is checked against it by `--check`, so a bump
 * cannot leave a stale copy behind.
 *
 *   node scripts/node-floor.mjs           # 22.13.0, the floor
 *   node scripts/node-floor.mjs --major   # 22, the floor's major line
 *   node scripts/node-floor.mjs --below   # 22.12.0, one release below it
 *   node scripts/node-floor.mjs --check   # exit 1 if any copy disagrees
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { MIN_NODE } from '../lib/runtime.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** @type {string} */
export const NODE_FLOOR = MIN_NODE.join('.');

/** @type {string} */
export const NODE_FLOOR_MAJOR = String(MIN_NODE[0]);

/**
 * A concrete release below the floor, used by the CI job that asserts the
 * requirement refuses. `22.13.0` yields `22.12.0`.
 * @returns {string}
 */
export function belowFloor() {
  const [major, minor, patch] = MIN_NODE;
  if (patch > 0) return `${major}.${minor}.${patch - 1}`;
  if (minor > 0) return `${major}.${minor - 1}.0`;
  throw new Error(`Node ${NODE_FLOOR} has no release below it to test against`);
}

/**
 * Docs write `22.13` and `22.13.0` interchangeably; both are the same floor.
 * @param {string} version
 * @returns {boolean}
 */
function isFloor(version) {
  const parts = version.split('.').map(Number);
  while (parts.length < 3) parts.push(0);
  return parts.join('.') === NODE_FLOOR;
}

/**
 * Shapes that state the requirement, and so must name the floor. Historical
 * mentions ("before 22.13.0", "on Node 20") deliberately do not match.
 * @type {{ file: string, what: string, pattern: RegExp }[]}
 */
const DOC_RULES = [
  { file: 'README.md', what: '"Node <version>+"', pattern: /\bNode\s+v?(\d+(?:\.\d+){0,2})\s*\+/g },
  { file: 'README.md', what: '"Node <version> or newer"', pattern: /\bNode\s+v?(\d+(?:\.\d+){0,2})\s+or\s+(?:newer|later)/gi },
  { file: 'README.md', what: 'the "minimum supported Node" parenthetical', pattern: /minimum supported Node\s*\(([\d.]+)\)/gi },
  { file: 'AGENT.md', what: '"Node <version>+"', pattern: /\bNode\s+v?(\d+(?:\.\d+){0,2})\s*\+/g },
  { file: 'AGENT.md', what: '"Node <version> or newer"', pattern: /\bNode\s+v?(\d+(?:\.\d+){0,2})\s+or\s+(?:newer|later)/gi },
  { file: 'ARCHITECTURE.md', what: '"Node <version>+"', pattern: /\bNode\s+v?(\d+(?:\.\d+){0,2})\s*\+/g },
  { file: 'STATUS.md', what: '"Node <version>+"', pattern: /\bNode\s+v?(\d+(?:\.\d+){0,2})\s*\+/g },
  { file: 'STATUS.md', what: '"Node <version> or newer"', pattern: /\bNode\s+v?(\d+(?:\.\d+){0,2})\s+or\s+(?:newer|later)/gi },
  { file: 'STATUS.md', what: 'an "engines.node >=" claim', pattern: /engines\.node\s*>=\s*([\d.]+)/gi },
  { file: 'PROJECT_PROMPT.md', what: '"Node <version>+"', pattern: /\bNode\s+v?(\d+(?:\.\d+){0,2})\s*\+/g },
];

const DOCS = [...new Set(DOC_RULES.map((rule) => rule.file))];

/**
 * @param {string} [root]
 * @returns {string[]} one message per disagreement, empty when everything matches
 */
export function checkFloor(root = ROOT) {
  /** @type {string[]} */
  const problems = [];
  /** @param {string} path */
  const read = (path) => readFileSync(join(root, path), 'utf8');

  const nvmrc = read('.nvmrc').trim();
  if (nvmrc !== NODE_FLOOR) {
    problems.push(`.nvmrc is ${nvmrc || '(empty)'}, but MIN_NODE says ${NODE_FLOOR}`);
  }

  const pkg = JSON.parse(read('package.json'));
  const engines = pkg?.engines?.node;
  if (engines !== `>=${NODE_FLOOR}`) {
    problems.push(`package.json engines.node is ${engines ?? '(missing)'}, but MIN_NODE says >=${NODE_FLOOR}`);
  }

  for (const file of DOCS) {
    const text = read(file);
    for (const rule of DOC_RULES.filter((candidate) => candidate.file === file)) {
      rule.pattern.lastIndex = 0;
      for (const match of text.matchAll(rule.pattern)) {
        if (!isFloor(match[1])) {
          problems.push(`${file} states ${rule.what} as ${match[1]}, but MIN_NODE says ${NODE_FLOOR}`);
        }
      }
    }
  }

  const ci = read('.github/workflows/ci.yml');
  if (/\bnode-version:\s*['"]?\d+\.\d+\.\d+/.test(ci)) {
    problems.push('.github/workflows/ci.yml pins a literal Node version; read it from scripts/node-floor.mjs instead');
  }
  for (const output of ['min', 'major', 'below']) {
    if (!ci.includes(`needs.floor.outputs.${output}`)) {
      problems.push(`.github/workflows/ci.yml does not read needs.floor.outputs.${output}`);
    }
  }
  if (!ci.includes('node-version-file: .nvmrc')) {
    problems.push('.github/workflows/ci.yml does not install the pinned .nvmrc runtime');
  }
  if (!ci.includes('node scripts/node-floor.mjs --check')) {
    problems.push('.github/workflows/ci.yml never runs node scripts/node-floor.mjs --check');
  }

  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const flag = process.argv[2];
  if (flag === '--check') {
    const problems = checkFloor();
    if (problems.length > 0) {
      for (const problem of problems) console.error(`Node floor ${NODE_FLOOR}: ${problem}`);
      const copies = problems.length === 1 ? '1 copy of the Node floor disagrees' : `${problems.length} copies of the Node floor disagree`;
      console.error(
        `\n${copies} with MIN_NODE in lib/runtime.mjs. ` +
          'Update it there first, then make each of these say the same thing.',
      );
      process.exit(1);
    }
    console.log(`Node floor ${NODE_FLOOR} is consistent across .nvmrc, engines, CI and the docs.`);
  } else if (flag === '--major') {
    console.log(NODE_FLOOR_MAJOR);
  } else if (flag === '--below') {
    console.log(belowFloor());
  } else if (flag === undefined) {
    console.log(NODE_FLOOR);
  } else {
    console.error(`Unknown option ${flag}. Use --check, --major, --below or no argument.`);
    process.exit(2);
  }
}
