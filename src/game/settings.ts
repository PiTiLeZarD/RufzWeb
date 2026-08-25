import { DEFAULT_TONE, type ToneSettings } from '../audio/cwEngine';
import { DEFAULT_SPEED_RULE, type SpeedRule } from './scoring';

export interface RufzSettings {
  /** Calls per attempt. RufzXP uses 50. */
  callCount: number;
  /** Speed of the first call, in characters per minute. */
  startCpm: number;
  /** Fixed speed mode disables adaptation, matching RufzXP's training mode. */
  fixedSpeed: boolean;
  /** Open each run where recent runs settled, instead of at startCpm. */
  autoStartCpm: boolean;
  speedRule: SpeedRule;
  tone: ToneSettings;
  /** Allow the F6 repeat, at half points. */
  allowRepeat: boolean;
}

export const DEFAULT_SETTINGS: RufzSettings = {
  callCount: 50,
  startCpm: 100,
  fixedSpeed: false,
  autoStartCpm: true,
  speedRule: DEFAULT_SPEED_RULE,
  tone: DEFAULT_TONE,
  allowRepeat: true,
};

const SETTINGS_KEY = 'rufzweb.settings.v1';

export function loadSettings(): RufzSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<RufzSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      speedRule: migrateSpeedRule(parsed.speedRule),
      tone: { ...DEFAULT_TONE, ...parsed.tone },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * stepFraction used to be the step for the whole run; it is now only the step
 * before the ramp starts narrowing, so a stored value means something different
 * from what the operator chose. minStepFraction is the marker for the new
 * shape: without it the rule predates the change and the defaults win.
 */
function migrateSpeedRule(stored: Partial<SpeedRule> | undefined): SpeedRule {
  if (!stored || typeof stored.minStepFraction !== 'number') return DEFAULT_SPEED_RULE;
  return { ...DEFAULT_SPEED_RULE, ...stored };
}

export function saveSettings(settings: RufzSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private mode); settings simply won't persist.
  }
}
