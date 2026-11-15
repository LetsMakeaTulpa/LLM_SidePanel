import { createHash } from 'node:crypto';

const BITS = 64n;

function tokenWeights(text: string): Map<string, number> {
  const weights = new Map<string, number>();
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && token.length <= 40);
  for (const token of tokens) weights.set(token, (weights.get(token) ?? 0) + 1);
  return weights;
}

function hashToken(token: string): bigint {
  return BigInt(`0x${createHash('sha1').update(token).digest('hex').slice(0, 16)}`);
}

/** 64-bit simhash of a document, as a hex string. */
export function simhash64(text: string): string {
  const weights = tokenWeights(text);
  const vector = new Array<number>(64).fill(0);

  for (const [token, weight] of weights) {
    const hash = hashToken(token);
    for (let bit = 0; bit < 64; bit++) {
      const mask = 1n << BigInt(bit);
      vector[bit] = (vector[bit] ?? 0) + ((hash & mask) === 0n ? -weight : weight);
    }
  }

  let hash = 0n;
  for (let bit = 0; bit < 64; bit++) {
    if ((vector[bit] ?? 0) > 0) hash |= 1n << BigInt(bit);
  }
  return hash.toString(16).padStart(16, '0');
}

export function hammingDistance(a: string, b: string): number {
  if (!a || !b) return 64;
  let xor = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let distance = 0;
  while (xor > 0n) {
    distance += Number(xor & 1n);
    xor >>= 1n;
  }
  return distance;
}

export const SIMHASH_BITS = BITS;
