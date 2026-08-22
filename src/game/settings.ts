import { DEFAULT_TONE, type ToneSettings } from '../audio/cwEngine';
import { DEFAULT_SPEED_RULE, type SpeedRule } from './scoring';

export interface RufzSettings {
  /** Calls per attempt. RufzXP uses 50. */
  callCount: number;
  /** Speed of the first call, in characters per minute. */
  startCpm: number;
  /** Fixed speed mode disables adaptation, matching RufzXP's training mode. */
  fixedSpeed: boolean;
  speedRule: SpeedRule;
  tone: ToneSettings;
  /** Allow the F6 repeat, at half points. */
  allowRepeat: boolean;
}

export const DEFAULT_SETTINGS: RufzSettings = {
  callCount: 50,
  startCpm: 100,
  fixedSpeed: false,
  speedRule: DEFAULT_SPEED_RULE,
  tone: DEFAULT_TONE,
  allowRepeat: true,
};

const SETTINGS_KEY = 'rufzweb.settings.v1';
const SCORES_KEY = 'rufzweb.scores.v1';

export function loadSettings(): RufzSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<RufzSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      speedRule: { ...DEFAULT_SPEED_RULE, ...parsed.speedRule },
      tone: { ...DEFAULT_TONE, ...parsed.tone },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: RufzSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private mode); settings simply won't persist.
  }
}

export interface StoredScore {
  timestamp: number;
  totalPoints: number;
  callCount: number;
  startCpm: number;
  maxCpm: number;
  finalCpm: number;
  correct: number;
  seed: number;
}

export function loadScores(): StoredScore[] {
  try {
    const raw = localStorage.getItem(SCORES_KEY);
    return raw ? (JSON.parse(raw) as StoredScore[]) : [];
  } catch {
    return [];
  }
}

export function saveScore(score: StoredScore): StoredScore[] {
  const scores = [...loadScores(), score]
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .slice(0, 50);
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(scores));
  } catch {
    // Ignore; the in-memory list is still returned.
  }
  return scores;
}
