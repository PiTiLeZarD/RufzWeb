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
 * Speed adaptation. RufzXP moves up after a clean copy and down after a miss,
 * with the size of the drop scaling with how badly the call was missed.
 */
export interface SpeedRule {
  /** Fixed step in cpm, or a proportion of the current speed. */
  mode: 'fixed' | 'proportional';
  /** cpm when mode is 'fixed'. */
  stepCpm: number;
  /** Fraction of current speed when mode is 'proportional'. */
  stepFraction: number;
  minCpm: number;
  maxCpm: number;
}

export const DEFAULT_SPEED_RULE: SpeedRule = {
  mode: 'proportional',
  stepCpm: 20,
  stepFraction: 0.06,
  minCpm: 25,
  maxCpm: 735,
};

export function nextSpeed(currentCpm: number, errors: number, rule: SpeedRule): number {
  const step =
    rule.mode === 'fixed'
      ? rule.stepCpm
      : Math.max(5, Math.round(currentCpm * rule.stepFraction));

  // Clean copy climbs one step; each error costs a step going down.
  const delta = errors === 0 ? step : -step * Math.min(errors, MAX_ERRORS + 1);
  return clamp(Math.round(currentCpm + delta), rule.minCpm, rule.maxCpm);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
