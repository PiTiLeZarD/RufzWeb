import { describe, expect, it } from 'vitest';
import { dotSeconds, lengthInDots, toDotUnits } from './morse';
import { countErrors, nextSpeed, scoreCall, DEFAULT_SPEED_RULE } from './scoring';
import { drawCalls, generatePool, parseCallsignFile } from './callsigns';
import { decodeRun, encodeRun, readSharePayload } from './share';
import type { Attempt } from '../hooks/useRufzRun';

describe('morse timing', () => {
  it('renders PARIS as 50 dot units per word', () => {
    // The word "PARIS " is 50 units: 43 of keying plus the 7-unit word gap.
    expect(lengthInDots('PARIS')).toBe(43);
    expect(lengthInDots('PARIS E')).toBe(43 + 7 + 1);
  });

  it('keys E as a single dot at the origin', () => {
    expect(toDotUnits('E')).toEqual([{ start: 0, length: 1 }]);
  });

  it('puts three units between characters', () => {
    // E E -> dot, 3-unit gap, dot
    expect(toDotUnits('EE')).toEqual([
      { start: 0, length: 1 },
      { start: 4, length: 1 },
    ]);
  });

  it('maps cpm to dot length on the PARIS scale', () => {
    // 60 cpm = 12 wpm -> 0.1 s dot
    expect(dotSeconds(60)).toBeCloseTo(0.1, 6);
    // 735 cpm = 147 wpm, the RufzXP ceiling
    expect(dotSeconds(735)).toBeCloseTo(0.00816, 5);
  });
});

describe('error counting', () => {
  it('scores an exact copy as zero errors', () => {
    expect(countErrors('DL4MM', 'DL4MM')).toBe(0);
  });

  it('counts a substitution as one error', () => {
    expect(countErrors('DL4MM', 'DL4NM')).toBe(1);
  });

  it('does not cascade on a dropped character', () => {
    expect(countErrors('DL4MM', 'DL4M')).toBe(1);
  });

  it('caps at four so anything worse scores zero', () => {
    expect(countErrors('DL4MM', 'XXXXXXXX')).toBe(4);
  });
});

describe('scoring', () => {
  const base = { cpm: 250, sent: 'DL4MM', elapsedSeconds: 1, repeated: false };

  it('is quadratic in speed', () => {
    const slow = scoreCall({ ...base, cpm: 100, typed: 'DL4MM' }).points;
    const fast = scoreCall({ ...base, cpm: 200, typed: 'DL4MM' }).points;
    expect(fast / slow).toBeCloseTo(4, 1);
  });

  it('is linear in call length', () => {
    const short = scoreCall({ ...base, sent: 'G3AB', typed: 'G3AB' }).points;
    const long = scoreCall({ ...base, sent: 'G3ABCDEF', typed: 'G3ABCDEF' }).points;
    expect(long / short).toBeCloseTo(2, 1);
  });

  it('divides by (errors + 1) squared', () => {
    const clean = scoreCall({ ...base, typed: 'DL4MM' }).points;
    const one = scoreCall({ ...base, typed: 'DL4NM' }).points;
    const two = scoreCall({ ...base, typed: 'DL4NN' }).points;
    expect(one / clean).toBeCloseTo(1 / 4, 2);
    expect(two / clean).toBeCloseTo(1 / 9, 2);
  });

  it('halves the points for a repeat', () => {
    const clean = scoreCall({ ...base, typed: 'DL4MM' }).points;
    const repeated = scoreCall({ ...base, typed: 'DL4MM', repeated: true }).points;
    expect(repeated / clean).toBeCloseTo(0.5, 2);
  });

  it('gives nothing for more than three errors', () => {
    expect(scoreCall({ ...base, typed: 'ZZZZZZZ' }).points).toBe(0);
  });

  it('never deducts more than the time floor', () => {
    const slowTyping = scoreCall({ ...base, typed: 'DL4MM', elapsedSeconds: 600 });
    const fastTyping = scoreCall({ ...base, typed: 'DL4MM', elapsedSeconds: 0 });
    // The floor is 0.6; allow a hair under for integer rounding of the points.
    expect(slowTyping.points / fastTyping.points).toBeGreaterThan(0.599);
  });
});

describe('speed adaptation', () => {
  it('climbs after a clean copy and drops after a miss', () => {
    expect(nextSpeed(200, 0, DEFAULT_SPEED_RULE)).toBeGreaterThan(200);
    expect(nextSpeed(200, 1, DEFAULT_SPEED_RULE)).toBeLessThan(200);
  });

  it('drops harder the worse the copy', () => {
    const one = nextSpeed(200, 1, DEFAULT_SPEED_RULE);
    const three = nextSpeed(200, 3, DEFAULT_SPEED_RULE);
    expect(three).toBeLessThan(one);
  });

  it('respects the speed limits', () => {
    expect(nextSpeed(735, 0, DEFAULT_SPEED_RULE)).toBe(735);
    expect(nextSpeed(25, 3, DEFAULT_SPEED_RULE)).toBe(25);
  });
});

describe('callsigns', () => {
  it('generates well-formed unique calls', () => {
    const pool = generatePool(500, 1);
    expect(pool.length).toBe(500);
    expect(new Set(pool).size).toBe(500);
    for (const call of pool) expect(call).toMatch(/^[A-Z0-9]{3,10}$/);
  });

  it('is deterministic for a given seed', () => {
    expect(generatePool(50, 7)).toEqual(generatePool(50, 7));
  });

  it('never draws the same call twice in a row', () => {
    const draws = drawCalls(generatePool(200, 3), 100, 9);
    for (let i = 1; i < draws.length; i += 1) expect(draws[i]).not.toBe(draws[i - 1]);
  });

  it('parses MASTER.PED style lines and ignores junk', () => {
    const parsed = parseCallsignFile('DL4MM,14\nG3ABC\n\n# comment\nVK3XYZ,30\n');
    expect(parsed).toEqual(['DL4MM', 'G3ABC', 'VK3XYZ']);
  });
});

describe('share links', () => {
  const attempt = (
    sent: string,
    typed: string,
    cpm: number,
    elapsedSeconds: number,
    repeated = false,
  ): Attempt => ({
    index: 0,
    sent,
    typed,
    cpm,
    elapsedSeconds,
    repeated,
    score: scoreCall({ cpm, sent, typed, elapsedSeconds, repeated }),
  });

  const run: Attempt[] = [
    attempt('DL4MM', 'DL4MM', 100, 2.4),
    attempt('VK3XYZ', 'VK3XZ', 106, 5.1, true),
    attempt('9A1CRA', '', 94, 8.7),
  ].map((a, index) => ({ ...a, index }));

  it('round-trips a run through the payload', async () => {
    const decoded = await decodeRun(await encodeRun(run, 1_700_000_000_000));
    expect(decoded?.timestamp).toBe(1_700_000_000_000);
    expect(decoded?.attempts).toEqual(run);
    expect(decoded?.totalPoints).toBe(run.reduce((sum, a) => sum + a.score.points, 0));
  });

  it('keeps a 50-call link short enough to paste anywhere', async () => {
    const long = Array.from({ length: 50 }, (_, index) => ({
      ...attempt('OH2XYZ', 'OH2XYZ', 120 + index, 3.3),
      index,
    }));
    expect((await encodeRun(long)).length).toBeLessThan(1000);
  });

  it('rejects a payload that was mangled in transit', async () => {
    const payload = await encodeRun(run);
    expect(await decodeRun(payload.slice(0, payload.length - 8))).toBeNull();
    expect(await decodeRun('D' + 'nonsense')).toBeNull();
    expect(await decodeRun('')).toBeNull();
  });

  it('reads the payload out of a hash and ignores anything else', () => {
    expect(readSharePayload('#r=abc')).toBe('abc');
    expect(readSharePayload('r=abc')).toBe('abc');
    expect(readSharePayload('#')).toBeNull();
    expect(readSharePayload('#other=1')).toBeNull();
  });
});
