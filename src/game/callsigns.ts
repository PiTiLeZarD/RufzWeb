/**
 * Callsign source.
 *
 * RufzXP ships an encrypted database of ~35,000 real callsigns, which we cannot
 * reuse. Instead we generate structurally realistic calls from real prefixes,
 * and let the operator import their own list (one call per line; MASTER.DTA /
 * MASTER.PED are both accepted, trailing comma-separated fields are ignored).
 */

/** Prefixes that already carry their digit, e.g. HB9ABC, EA8XYZ. */
const FIXED_PREFIXES = [
  'HB9', 'HB0', 'EA6', 'EA8', 'EA9', 'CT3', 'SV9', 'SV5', 'FM5', 'FG4',
  'ZB2', 'ZC4', 'A61', 'A71', 'A92', 'E77', 'E73', 'J28', 'S01', '3A2',
];

/** Prefixes that take a digit 0-9, weighted roughly by on-air population. */
const DIGIT_PREFIXES: Array<[string, number]> = [
  ['K', 10], ['W', 9], ['N', 8], ['AA', 3], ['KB', 3], ['WA', 3], ['AC', 2],
  ['VE', 6], ['VA', 2], ['VO', 1], ['VY', 1],
  ['DL', 9], ['DK', 4], ['DJ', 3], ['DF', 3], ['DG', 2], ['DD', 1],
  ['G', 6], ['M', 5], ['2E', 2], ['GM', 2], ['GW', 2], ['GI', 1], ['GD', 1],
  ['F', 6], ['I', 6], ['IK', 3], ['IZ', 3], ['IW', 2],
  ['EA', 5], ['EB', 2], ['EC', 2],
  ['PA', 4], ['PD', 2], ['PE', 2], ['ON', 3], ['OT', 1],
  ['SM', 3], ['SA', 2], ['LA', 3], ['LB', 1], ['OH', 3], ['OZ', 3], ['OY', 1],
  ['TF', 1], ['OE', 3], ['HA', 3], ['HG', 2], ['OK', 4], ['OL', 2], ['OM', 3],
  ['SP', 5], ['SQ', 3], ['SN', 1], ['S5', 3], ['9A', 3], ['YU', 2], ['YT', 2],
  ['YO', 3], ['LZ', 2], ['SV', 3], ['TA', 2], ['4X', 1], ['4Z', 1],
  ['UA', 6], ['RA', 5], ['RN', 3], ['RV', 3], ['RW', 3], ['RZ', 2], ['R', 4],
  ['UR', 4], ['UT', 4], ['UX', 2], ['UY', 2], ['EU', 2], ['EW', 2],
  ['LY', 2], ['YL', 2], ['ES', 2], ['ER', 1], ['EK', 1], ['UN', 2],
  ['JA', 8], ['JE', 4], ['JF', 3], ['JG', 3], ['JH', 4], ['JI', 2], ['JJ', 2],
  ['JK', 2], ['JR', 3], ['7K', 1], ['7L', 1],
  ['BA', 2], ['BD', 4], ['BG', 3], ['BH', 2], ['BY', 1],
  ['HL', 3], ['DS', 2], ['VK', 5], ['ZL', 3],
  ['PY', 4], ['PP', 1], ['PU', 2], ['LU', 4], ['CE', 2], ['CX', 1], ['HK', 1],
  ['YV', 1], ['OA', 1], ['CP', 1], ['ZP', 1],
  ['ZS', 2], ['CN', 1], ['SU', 1], ['5Z', 1], ['9J', 1], ['9K', 1],
  ['VU', 2], ['9M', 1], ['HS', 2], ['E2', 1], ['YB', 3], ['YC', 2], ['DU', 1],
  ['9V', 1], ['BV', 1], ['XE', 2], ['CO', 1], ['TI', 1], ['HI', 1],
  ['CT', 3], ['EI', 2], ['LX', 1], ['LA', 2], ['9H', 1], ['SV', 2],
];

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Deterministic PRNG so a run can be reproduced from its seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WEIGHTED_PREFIXES: string[] = DIGIT_PREFIXES.flatMap(([prefix, weight]) =>
  Array<string>(weight).fill(prefix),
);

function randomCall(rand: () => number): string {
  // Roughly one call in eight uses a prefix with a built-in digit.
  if (rand() < 0.12) {
    const prefix = FIXED_PREFIXES[Math.floor(rand() * FIXED_PREFIXES.length)];
    return prefix + suffix(rand);
  }

  const prefix = WEIGHTED_PREFIXES[Math.floor(rand() * WEIGHTED_PREFIXES.length)];
  const digit = Math.floor(rand() * 10);
  return `${prefix}${digit}${suffix(rand)}`;
}

function suffix(rand: () => number): string {
  // Two-letter suffixes are the most common, three-letter next, one-letter rare.
  const roll = rand();
  const length = roll < 0.08 ? 1 : roll < 0.55 ? 2 : 3;
  let out = '';
  for (let i = 0; i < length; i += 1) out += LETTERS[Math.floor(rand() * 26)];
  return out;
}

/** Build a de-duplicated pool of generated callsigns. */
export function generatePool(size: number, seed: number): string[] {
  const rand = mulberry32(seed);
  const pool = new Set<string>();
  let guard = size * 20;
  while (pool.size < size && guard > 0) {
    pool.add(randomCall(rand));
    guard -= 1;
  }
  return [...pool];
}

const VALID_CALL = /^[A-Z0-9]{3,10}(\/[A-Z0-9]{1,4})?$/;

/** Parse an imported list. Accepts MASTER.DTA, MASTER.PED and plain text. */
export function parseCallsignFile(text: string): string[] {
  const out = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const call = line.split(',')[0].trim().toUpperCase();
    if (VALID_CALL.test(call)) out.add(call);
  }
  return [...out];
}

/** Draw `count` calls from `pool` without immediate repeats. */
export function drawCalls(pool: string[], count: number, seed: number): string[] {
  const rand = mulberry32(seed);
  const out: string[] = [];
  let last = '';
  for (let i = 0; i < count; i += 1) {
    let pick = last;
    let guard = 10;
    while (pick === last && guard > 0) {
      pick = pool[Math.floor(rand() * pool.length)];
      guard -= 1;
    }
    out.push(pick);
    last = pick;
  }
  return out;
}
