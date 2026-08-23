/**
 * Session history.
 *
 * Every finished run is kept in localStorage as a summary plus the share
 * payload, so an old session can be reopened and rendered call by call without
 * storing the attempts twice — the payload already encodes them compactly and
 * doubles as the link when the operator wants to share it later.
 *
 * Entries are held newest first. The list is capped, and a write that blows the
 * storage quota retries on a shorter list rather than losing the whole history.
 */

const HISTORY_KEY = 'rufzweb.history.v1';

/** Older builds kept only a top-scores table; it is folded in on first load. */
const LEGACY_SCORES_KEY = 'rufzweb.scores.v1';

const MAX_ENTRIES = 200;

export interface SessionSummary {
  id: string;
  timestamp: number;
  totalPoints: number;
  callCount: number;
  correct: number;
  startCpm: number;
  maxCpm: number;
  finalCpm: number;
}

export interface SessionRecord extends SessionSummary {
  /**
   * Share payload for the run. Absent on sessions carried over from the old
   * top-scores table, which never stored the individual calls.
   */
  payload?: string;
}

export function newSessionId(timestamp: number): string {
  return `${timestamp.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Newest first. */
export function loadHistory(): SessionRecord[] {
  const stored = read(HISTORY_KEY);
  if (stored) return sort(stored.filter(isRecord));

  const migrated = migrateLegacy();
  if (migrated.length > 0) write(migrated);
  return migrated;
}

export function addSession(record: SessionRecord): SessionRecord[] {
  const next = sort([record, ...loadHistory().filter((e) => e.id !== record.id)]).slice(
    0,
    MAX_ENTRIES,
  );
  write(next);
  return next;
}

export function deleteSession(id: string): SessionRecord[] {
  const next = loadHistory().filter((e) => e.id !== id);
  write(next);
  return next;
}

export function clearHistory(): SessionRecord[] {
  try {
    localStorage.removeItem(HISTORY_KEY);
    // Without this the legacy table would be migrated back in on the next load.
    localStorage.removeItem(LEGACY_SCORES_KEY);
  } catch {
    // Storage unavailable; nothing was persisted in the first place.
  }
  return [];
}

/** Chronological, for plotting progress. */
export function inOrder(history: SessionRecord[]): SessionRecord[] {
  return [...history].sort((a, b) => a.timestamp - b.timestamp);
}

export function bestSession(history: SessionRecord[]): SessionRecord | null {
  return history.reduce<SessionRecord | null>(
    (best, e) => (best === null || e.totalPoints > best.totalPoints ? e : best),
    null,
  );
}

function sort(records: SessionRecord[]): SessionRecord[] {
  return [...records].sort((a, b) => b.timestamp - a.timestamp);
}

function write(records: SessionRecord[]): void {
  let list = records.slice(0, MAX_ENTRIES);
  for (;;) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
      return;
    } catch {
      // Almost certainly the quota. Halve the tail and try again; keeping the
      // recent sessions matters more than keeping all of them.
      if (list.length <= 1) return;
      list = list.slice(0, Math.floor(list.length / 2));
    }
  }
}

function read(key: string): unknown[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function migrateLegacy(): SessionRecord[] {
  const legacy = read(LEGACY_SCORES_KEY);
  if (!legacy) return [];

  const records: SessionRecord[] = [];
  for (const entry of legacy) {
    if (!isObject(entry)) continue;
    const timestamp = num(entry.timestamp);
    if (timestamp === null) continue;
    records.push({
      id: newSessionId(timestamp),
      timestamp,
      totalPoints: num(entry.totalPoints) ?? 0,
      callCount: num(entry.callCount) ?? 0,
      correct: num(entry.correct) ?? 0,
      startCpm: num(entry.startCpm) ?? 0,
      maxCpm: num(entry.maxCpm) ?? 0,
      finalCpm: num(entry.finalCpm) ?? 0,
    });
  }
  return sort(records);
}

function isRecord(value: unknown): value is SessionRecord {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    num(value.timestamp) !== null &&
    num(value.totalPoints) !== null
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
