import { describe, expect, it } from 'vitest';
import { dotSeconds, lengthInDots, toDotUnits } from './morse';
import {
  countErrors,
  nextSpeed,
  scoreCall,
  DEFAULT_SPEED_RULE,
  INITIAL_RAMP,
  type RampInput,
  type RampState,
} from './scoring';
import { suggestedStartCpm, type SessionRecord } from './history';
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
  const call = (over: Partial<RampInput> = {}): RampInput => ({
    errors: 0,
    repeated: false,
    elapsedSeconds: 3,
    length: 5,
    ...over,
  });

  const step = (cpm: number, over: Partial<RampInput> = {}, ramp = INITIAL_RAMP) =>
    nextSpeed(cpm, DEFAULT_SPEED_RULE, call(over), ramp);

  it('climbs after a clean copy and drops after a miss', () => {
    expect(step(200).cpm).toBeGreaterThan(200);
    expect(step(200, { errors: 1 }).cpm).toBeLessThan(200);
  });

  it('drops harder the worse the copy', () => {
    expect(step(200, { errors: 3 }).cpm).toBeLessThan(step(200, { errors: 1 }).cpm);
  });

  it('respects the speed limits', () => {
    expect(step(735).cpm).toBe(735);
    expect(step(25, { errors: 3 }).cpm).toBe(25);
  });

  it('climbs less when the call needed a repeat', () => {
    const clean = step(200).cpm - 200;
    const repeated = step(200, { repeated: true }).cpm - 200;
    expect(repeated).toBeGreaterThan(0);
    expect(repeated).toBeLessThan(clean);
  });

  it('drops the same whether or not the call needed a repeat', () => {
    expect(step(200, { errors: 1, repeated: true }).cpm).toBe(
      step(200, { errors: 1 }).cpm,
    );
  });

  it('keeps the step proportional at beginner speeds', () => {
    // A 50 cpm start used to jump a flat 5 cpm, a 10% climb per call.
    expect(step(50).cpm - 50).toBeLessThan(5);
  });

  it('climbs further after a quick copy than a laboured one', () => {
    // Two calls at the same pace set the baseline, then compare against it.
    const settled = step(200, { elapsedSeconds: 3 }).ramp;
    const quick = nextSpeed(200, DEFAULT_SPEED_RULE, call({ elapsedSeconds: 1 }), settled);
    const laboured = nextSpeed(200, DEFAULT_SPEED_RULE, call({ elapsedSeconds: 9 }), settled);
    expect(quick.cpm - 200).toBeGreaterThan(laboured.cpm - 200);
    expect(laboured.cpm).toBeGreaterThan(200);
  });

  it('judges pace against the operator, not the clock', () => {
    // A uniformly slow typist ends up at the same weight as a quick one, since
    // each is measured against their own baseline.
    const seed = (seconds: number) => {
      let ramp: RampState = INITIAL_RAMP;
      for (let i = 0; i < 8; i += 1) {
        ramp = nextSpeed(
          200,
          DEFAULT_SPEED_RULE,
          call({ elapsedSeconds: seconds }),
          ramp,
        ).ramp;
      }
      return nextSpeed(200, DEFAULT_SPEED_RULE, call({ elapsedSeconds: seconds }), ramp).cpm;
    };
    expect(seed(8)).toBe(seed(2));
  });

  it('narrows the step once the speed starts reversing', () => {
    const wide = step(300).cpm - 300;
    let ramp: RampState = INITIAL_RAMP;
    // Alternate clean and missed copies to force reversal after reversal.
    for (let i = 0; i < 12; i += 1) {
      ramp = nextSpeed(300, DEFAULT_SPEED_RULE, call({ errors: i % 2 }), ramp).ramp;
    }
    expect(ramp.reversals).toBeGreaterThan(4);
    const narrow = nextSpeed(300, DEFAULT_SPEED_RULE, call(), ramp).cpm - 300;
    expect(narrow).toBeLessThan(wide);
  });

  it('does not count a move that hit a limit as a reversal', () => {
    // Pinned at the ceiling a clean copy moves nothing, so the direction it
    // was travelling in stands rather than reading as a turn downwards.
    const climbing: RampState = { ...INITIAL_RAMP, lastDir: 1 };
    const held = nextSpeed(735, DEFAULT_SPEED_RULE, call(), climbing);
    expect(held.cpm).toBe(735);
    expect(held.ramp.lastDir).toBe(1);
    expect(held.ramp.reversals).toBe(0);
  });

  it('leaves the flat step flat', () => {
    // Only the proportional step narrows; a mode called fixed stays fixed.
    const rule = { ...DEFAULT_SPEED_RULE, mode: 'fixed' as const };
    const worn: RampState = { ...INITIAL_RAMP, reversals: 10, baseSecPerChar: 1, baseSamples: 8 };
    const fresh: RampState = { ...INITIAL_RAMP, baseSecPerChar: 1, baseSamples: 8 };
    const quick = call({ elapsedSeconds: 0 });
    expect(nextSpeed(300, rule, quick, worn).cpm).toBe(
      nextSpeed(300, rule, quick, fresh).cpm,
    );
    // Quick and clean against an established baseline earns the whole step.
    expect(nextSpeed(300, rule, quick, fresh).cpm - 300).toBe(rule.stepCpm);
  });
});

describe('suggested start speed', () => {
  const session = (finalCpm: number, timestamp: number): SessionRecord => ({
    id: `s${timestamp}`,
    timestamp,
    totalPoints: 0,
    callCount: 50,
    correct: 0,
    startCpm: 100,
    maxCpm: finalCpm,
    finalCpm,
  });

  it('falls back when there is nothing to go on', () => {
    expect(suggestedStartCpm([], 100)).toBe(100);
  });

  it('takes the middle of recent runs, not the last one', () => {
    // A blinding session and a bad one either side of the operator's real level.
    const history = [session(400, 3), session(200, 2), session(210, 1)];
    expect(suggestedStartCpm(history, 100)).toBe(210);
  });

  it('ignores runs too short to settle', () => {
    const short = { ...session(600, 4), callCount: 5 };
    expect(suggestedStartCpm([short, session(200, 3), session(210, 2)], 100)).toBe(205);
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
