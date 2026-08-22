/**
 * Morse code tables and element expansion.
 *
 * Timing follows the PARIS standard: the word "PARIS " is exactly 50 dot units,
 * so 1 WPM = 50 dot units per minute and one dot = 1.2 / wpm seconds.
 *
 * RufzXP expresses speed in characters per minute (cpm) on the PARIS scale,
 * where 1 wpm = 5 cpm. Hence dot = 6.0 / cpm seconds.
 */

export const MORSE: Record<string, string> = {
  A: '.-',
  B: '-...',
  C: '-.-.',
  D: '-..',
  E: '.',
  F: '..-.',
  G: '--.',
  H: '....',
  I: '..',
  J: '.---',
  K: '-.-',
  L: '.-..',
  M: '--',
  N: '-.',
  O: '---',
  P: '.--.',
  Q: '--.-',
  R: '.-.',
  S: '...',
  T: '-',
  U: '..-',
  V: '...-',
  W: '.--',
  X: '-..-',
  Y: '-.--',
  Z: '--..',
  '0': '-----',
  '1': '.----',
  '2': '..---',
  '3': '...--',
  '4': '....-',
  '5': '.....',
  '6': '-....',
  '7': '--...',
  '8': '---..',
  '9': '----.',
  '/': '-..-.',
  '?': '..--..',
  '.': '.-.-.-',
  ',': '--..--',
  '=': '-...-',
  '+': '.-.-.',
};

export interface ToneSpan {
  /** Start time in dot units from the beginning of the transmission. */
  start: number;
  /** Length in dot units. */
  length: number;
}

/** Total length of a rendered string, in dot units. */
export function lengthInDots(text: string): number {
  const spans = toDotUnits(text);
  if (spans.length === 0) return 0;
  const last = spans[spans.length - 1];
  return last.start + last.length;
}

/**
 * Expand text into keyed-down spans measured in dot units.
 *
 * Standard spacing: 1 unit between elements, 3 between characters,
 * 7 between words. Unknown characters are skipped.
 */
export function toDotUnits(text: string): ToneSpan[] {
  const spans: ToneSpan[] = [];
  let cursor = 0;
  let firstChar = true;

  for (const raw of text.toUpperCase()) {
    if (raw === ' ') {
      // A word gap is 7 units total; 3 were already added after the last
      // character, so top it up to 7.
      if (!firstChar) cursor += 4;
      continue;
    }

    const pattern = MORSE[raw];
    if (!pattern) continue;

    if (!firstChar) cursor += 3;
    firstChar = false;

    pattern.split('').forEach((element, index) => {
      if (index > 0) cursor += 1;
      const length = element === '-' ? 3 : 1;
      spans.push({ start: cursor, length });
      cursor += length;
    });
  }

  return spans;
}

/** Seconds per dot unit for a given speed in characters per minute (PARIS). */
export function dotSeconds(cpm: number): number {
  return 6.0 / cpm;
}

export const CPM_PER_WPM = 5;

export function cpmToWpm(cpm: number): number {
  return cpm / CPM_PER_WPM;
}

export function wpmToCpm(wpm: number): number {
  return wpm * CPM_PER_WPM;
}
