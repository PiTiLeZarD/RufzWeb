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
