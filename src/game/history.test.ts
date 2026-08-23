import { beforeEach, describe, expect, it } from 'vitest';
import {
  addSession,
  bestSession,
  clearHistory,
  deleteSession,
  inOrder,
  loadHistory,
  newSessionId,
  type SessionRecord,
} from './history';

/** Minimal localStorage so the store can be exercised outside a browser. */
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

function session(timestamp: number, totalPoints: number): SessionRecord {
  return {
    id: newSessionId(timestamp),
    timestamp,
    totalPoints,
    callCount: 50,
    correct: 40,
    startCpm: 100,
    maxCpm: 180,
    finalCpm: 150,
    payload: 'Pfake',
  };
}

describe('session history', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: unknown }).localStorage = new MemoryStorage();
  });

  it('keeps sessions newest first and round-trips them', () => {
    addSession(session(1000, 500));
    addSession(session(3000, 900));
    const history = addSession(session(2000, 700));

    expect(history.map((s) => s.timestamp)).toEqual([3000, 2000, 1000]);
    expect(loadHistory().map((s) => s.totalPoints)).toEqual([900, 700, 500]);
    expect(inOrder(history).map((s) => s.timestamp)).toEqual([1000, 2000, 3000]);
    expect(bestSession(history)?.totalPoints).toBe(900);
  });

  it('deletes one session and clears the rest', () => {
    const keep = session(1000, 500);
    const drop = session(2000, 700);
    addSession(keep);
    addSession(drop);

    expect(deleteSession(drop.id).map((s) => s.id)).toEqual([keep.id]);
    expect(clearHistory()).toEqual([]);
    expect(loadHistory()).toEqual([]);
  });

  it('folds the old top-scores table in on first load', () => {
    localStorage.setItem(
      'rufzweb.scores.v1',
      JSON.stringify([
        { timestamp: 5000, totalPoints: 1200, callCount: 50, correct: 45, maxCpm: 200 },
        { timestamp: 4000, totalPoints: 800, callCount: 50, correct: 30, maxCpm: 160 },
      ]),
    );

    const history = loadHistory();
    expect(history.map((s) => s.timestamp)).toEqual([5000, 4000]);
    // Old entries never stored the calls, so they cannot be reopened.
    expect(history.every((s) => s.payload === undefined)).toBe(true);
    // The fold happens once; the migrated list is what is loaded afterwards.
    expect(loadHistory()).toEqual(history);
  });

  it('survives unreadable storage', () => {
    localStorage.setItem('rufzweb.history.v1', 'not json');
    expect(loadHistory()).toEqual([]);
  });

  it('drops entries rather than the whole history when the quota is hit', () => {
    let allow = 2000;
    (globalThis as { localStorage?: unknown }).localStorage = Object.assign(
      new MemoryStorage(),
      {
        setItem(this: MemoryStorage, key: string, value: string) {
          if (value.length > allow) throw new Error('QuotaExceededError');
          MemoryStorage.prototype.setItem.call(this, key, value);
        },
      },
    );

    for (let i = 0; i < 40; i += 1) addSession(session(i * 1000, i));
    allow = Number.POSITIVE_INFINITY;

    const history = loadHistory();
    expect(history.length).toBeGreaterThan(0);
    // Whatever survives is the recent end of the list.
    expect(history[0].timestamp).toBe(39000);
  });
});
