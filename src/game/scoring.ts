/**
 * Scoring, modelled on the published shape of the RufzXP formula.
 *
 * From the RUFZ 3.2 manual, points per call are:
 *   - quadratic in the sending speed
 *   - linear in the length of the callsign
 *   - divided by (errors + 1)^2  (1 error -> 1/4, 2 -> 1/9, 3 -> 1/16)
 *   - reduced logarithmically by how long the operator took to type
 *   - halved if the call was repeated
 *
 * The exact constants RufzXP uses are not published, so the scale factors below
 * are ours. Scores are therefore NOT comparable with real RufzXP results.
 */

export const MAX_ERRORS = 3;

/** Tuned so a clean 5-character call at 250 cpm (50 wpm) is worth ~1000. */
const SCALE = 300;

/** Seconds of typing that cost nothing. */
const FREE_SECONDS = 3;

/** Strength of the logarithmic typing-time deduction. */
const TIME_WEIGHT = 0.08;

/** Floor on the time multiplier, so a slow typist still scores. */
const MIN_TIME_FACTOR = 0.6;

export interface ScoreInput {
  /** Speed the call was sent at, characters per minute. */
  cpm: number;
  /** The callsign as sent. */
  sent: string;
  /** What the operator typed. */
  typed: string;
  /** Seconds from end of transmission to Enter. */
  elapsedSeconds: number;
  /** Whether the operator asked for a repeat. */
  repeated: boolean;
}

export interface ScoreResult {
  points: number;
  /** Points this call was worth if copied perfectly and instantly. */
  maxPoints: number;
  errors: number;
  correct: boolean;
}

export function scoreCall(input: ScoreInput): ScoreResult {
  const sent = input.sent.toUpperCase();
  const typed = input.typed.trim().toUpperCase();
  const errors = countErrors(sent, typed);

  const maxPoints = Math.round((input.cpm * input.cpm * sent.length) / SCALE);

  if (errors > MAX_ERRORS) {
    return { points: 0, maxPoints, errors, correct: false };
  }

  const errorFactor = 1 / Math.pow(errors + 1, 2);
  const timeFactor = typingFactor(input.elapsedSeconds);
  const repeatFactor = input.repeated ? 0.5 : 1;

  return {
    points: Math.round(maxPoints * errorFactor * timeFactor * repeatFactor),
    maxPoints,
    errors,
    correct: errors === 0,
  };
}

function typingFactor(elapsedSeconds: number): number {
  const overrun = Math.max(0, elapsedSeconds - FREE_SECONDS);
  const factor = 1 - TIME_WEIGHT * Math.log(1 + overrun);
  return Math.max(MIN_TIME_FACTOR, factor);
}

/**
 * Error count is the Levenshtein distance between sent and typed, which handles
 * a dropped or inserted character without cascading into every later position.
 * Capped at MAX_ERRORS + 1 since anything past that scores zero either way.
 */
export function countErrors(sent: string, typed: string): number {
  if (sent === typed) return 0;

  const rows = sent.length + 1;
  const cols = typed.length + 1;
  let previous = new Array<number>(cols);
  let current = new Array<number>(cols);

  for (let j = 0; j < cols; j += 1) previous[j] = j;

  for (let i = 1; i < rows; i += 1) {
    current[0] = i;
    for (let j = 1; j < cols; j += 1) {
      const substitution = previous[j - 1] + (sent[i - 1] === typed[j - 1] ? 0 : 1);
      current[j] = Math.min(substitution, previous[j] + 1, current[j - 1] + 1);
    }
    [previous, current] = [current, previous];
  }

  return Math.min(previous[cols - 1], MAX_ERRORS + 1);
}

/**
 * Speed adaptation.
 *
 * A staircase that hunts for the fastest speed the operator can actually hold,
 * rather than the fastest they can survive. Three things drive it:
 *
 *   - Direction comes from the copy: clean goes up, errors go down.
 *   - Size comes from confidence. A call copied quickly and cleanly is evidence
 *     the speed is well under the operator's ceiling, so it takes a full step;
 *     a clean copy that took a repeat, or that they laboured over, barely moves.
 *   - The step narrows every time the direction changes. Early reversals mean
 *     the ceiling is still being bracketed, so the jumps are large; by the tenth
 *     the speed is circling the real limit and the jumps should be fine.
 *
 * Down-steps outweigh up-steps, which settles the ramp where the operator gets
 * roughly two calls in three clean — at their edge, not comfortably inside it.
 */
export interface SpeedRule {
  /** Fixed step in cpm, or a proportion of the current speed. */
  mode: 'fixed' | 'proportional';
  /** cpm when mode is 'fixed'. */
  stepCpm: number;
  /** Fraction of current speed before any reversal, when mode is 'proportional'. */
  stepFraction: number;
  /** Fraction the step narrows to once the ceiling has been bracketed. */
  minStepFraction: number;
  minCpm: number;
  maxCpm: number;
}

/**
 * Smallest proportional step. A larger floor swamps the fraction at low speeds:
 * a 5 cpm floor makes a 50 cpm start jump 10% per call, which is the steepest
 * part of the whole ramp and lands exactly where a beginner starts.
 */
const MIN_STEP_CPM = 2;

/** How much of the step remains after each change of direction. */
const REVERSAL_DECAY = 0.8;

/** Weight of a drop at a single error, and the extra weight at a total miss. */
const DOWN_BASE = 0.5;
const DOWN_SPAN = 0.5;

/** A clean copy that needed a repeat still climbs, but only just. */
const REPEAT_WEIGHT = 0.4;

/** Floor on the climb after a clean copy the operator clearly laboured over. */
const MIN_UP_WEIGHT = 0.15;

/**
 * Typing pace, relative to the operator's own recent pace, at which the climb
 * stops shrinking. At the baseline the copy earns half a step; at half the
 * baseline — answered almost instantly — it earns a full one.
 */
const EASE_SPAN = 1.5;

/** Clean copies folded into the pace baseline before it stops being seeded. */
const BASE_WINDOW = 8;

export const DEFAULT_SPEED_RULE: SpeedRule = {
  mode: 'proportional',
  stepCpm: 20,
  stepFraction: 0.1,
  minStepFraction: 0.02,
  minCpm: 25,
  maxCpm: 735,
};

/**
 * What the ramp remembers across a run. Held outside the speed itself because
 * both the step size and the confidence weighting depend on what came before.
 */
export interface RampState {
  /** Direction of the last move that actually changed the speed; 0 at the start. */
  lastDir: -1 | 0 | 1;
  /** Changes of direction so far. Each one narrows the step. */
  reversals: number;
  /** The operator's own typing pace on clean copies, in seconds per character. */
  baseSecPerChar: number | null;
  /** Clean copies folded into that baseline. */
  baseSamples: number;
}

export const INITIAL_RAMP: RampState = {
  lastDir: 0,
  reversals: 0,
  baseSecPerChar: null,
  baseSamples: 0,
};

export interface RampInput {
  errors: number;
  repeated: boolean;
  /** Seconds from end of transmission to Enter. */
  elapsedSeconds: number;
  /** Characters in the call, so the pace is comparable across lengths. */
  length: number;
}

/**
 * Signed size of the next move, as a fraction of a full step. Negative drops.
 *
 * The pace is judged against the operator's own baseline rather than a fixed
 * number of seconds, so a deliberate typist is not held back for life; what
 * matters is whether this call was harder work than their recent normal.
 */
function stepWeight(input: RampInput, pace: number, base: number | null): number {
  if (input.errors > 0) {
    const severity = Math.min(input.errors, MAX_ERRORS + 1) / (MAX_ERRORS + 1);
    return -(DOWN_BASE + DOWN_SPAN * severity);
  }

  const ratio = base === null || base <= 0 ? 1 : pace / base;
  const ease = clamp(EASE_SPAN - ratio, 0, 1);
  return Math.max(MIN_UP_WEIGHT, ease) * (input.repeated ? REPEAT_WEIGHT : 1);
}

/**
 * The baseline tracks recent pace rather than the whole run: as the speed
 * climbs the copy genuinely gets slower, and the question is always whether
 * this call was laboured compared with how the operator is going right now.
 */
function foldPace(ramp: RampState, pace: number): RampState {
  const samples = ramp.baseSamples + 1;
  const weight = 1 / Math.min(samples, BASE_WINDOW);
  return {
    ...ramp,
    baseSamples: samples,
    baseSecPerChar:
      ramp.baseSecPerChar === null
        ? pace
        : ramp.baseSecPerChar + (pace - ramp.baseSecPerChar) * weight,
  };
}

export function nextSpeed(
  currentCpm: number,
  rule: SpeedRule,
  input: RampInput,
  ramp: RampState = INITIAL_RAMP,
): { cpm: number; ramp: RampState } {
  // A flat step is meant to stay flat, so only the proportional mode narrows.
  const fraction = Math.max(
    rule.minStepFraction,
    rule.stepFraction * Math.pow(REVERSAL_DECAY, ramp.reversals),
  );
  const step =
    rule.mode === 'fixed'
      ? rule.stepCpm
      : Math.max(MIN_STEP_CPM, Math.round(currentCpm * fraction));

  const pace = input.elapsedSeconds / Math.max(1, input.length);
  const weight = stepWeight(input, pace, ramp.baseSecPerChar);

  // Round away from zero: a small step times a small weight would otherwise
  // stall the ramp entirely, leaving the operator parked at one speed.
  const magnitude = Math.max(1, Math.abs(Math.round(step * weight)));
  const cpm = clamp(
    currentCpm + (weight < 0 ? -magnitude : magnitude),
    rule.minCpm,
    rule.maxCpm,
  );

  // A move that hit a limit changed nothing, so it is not a reversal.
  const moved = cpm - currentCpm;
  const dir: RampState['lastDir'] = moved === 0 ? ramp.lastDir : moved > 0 ? 1 : -1;
  const reversed = ramp.lastDir !== 0 && dir !== ramp.lastDir;

  const clean = input.errors === 0 && !input.repeated;
  const next = clean ? foldPace(ramp, pace) : ramp;

  return {
    cpm,
    ramp: {
      ...next,
      lastDir: dir,
      reversals: reversed ? next.reversals + 1 : next.reversals,
    },
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
