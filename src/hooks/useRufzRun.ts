import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CwEngine } from '../audio/cwEngine';
import { drawCalls } from '../game/callsigns';
import { INITIAL_RAMP, nextSpeed, scoreCall, type RampState, type ScoreResult } from '../game/scoring';
import {
  addSession,
  loadHistory,
  newSessionId,
  suggestedStartCpm,
  type SessionRecord,
} from '../game/history';
import { encodeRun } from '../game/share';
import type { RufzSettings } from '../game/settings';

export type RunPhase = 'idle' | 'sending' | 'copying' | 'finished';

export interface Attempt {
  index: number;
  sent: string;
  typed: string;
  cpm: number;
  elapsedSeconds: number;
  repeated: boolean;
  score: ScoreResult;
}

export interface RunState {
  phase: RunPhase;
  index: number;
  cpm: number;
  attempts: Attempt[];
  totalPoints: number;
  repeatUsed: boolean;
}

const INITIAL: RunState = {
  phase: 'idle',
  index: 0,
  cpm: 0,
  attempts: [],
  totalPoints: 0,
  repeatUsed: false,
};

/**
 * Run state lives in a ref and is mirrored into React state for rendering.
 * Transmissions are side effects driven from event handlers, so they must not
 * be triggered from inside a setState updater (StrictMode calls those twice).
 */
export function useRufzRun(settings: RufzSettings, pool: string[]) {
  const engine = useMemo(() => new CwEngine(), []);
  const [state, setState] = useState<RunState>(INITIAL);
  const [history, setHistory] = useState<SessionRecord[]>(() => loadHistory());

  const stateRef = useRef<RunState>(INITIAL);
  const callsRef = useRef<string[]>([]);
  /** The ramp's memory for the run in progress; reset on every start. */
  const rampRef = useRef<RampState>(INITIAL_RAMP);
  /** Speed the run actually opened at, which may have come from history. */
  const startCpmRef = useRef(0);
  const txEndRef = useRef(0);
  /** Bumped on start/abort so a stale transmission cannot resume a dead run. */
  const runIdRef = useRef(0);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const historyRef = useRef(history);
  historyRef.current = history;

  useEffect(() => () => engine.close(), [engine]);

  const commit = useCallback((next: RunState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const transmit = useCallback(
    async (call: string, cpm: number, runId: number) => {
      const tx = engine.send(call, cpm, settingsRef.current.tone);
      await tx.done;
      if (runIdRef.current !== runId) return;
      txEndRef.current = performance.now();
      commit({ ...stateRef.current, phase: 'copying' });
    },
    [commit, engine],
  );

  const start = useCallback(async () => {
    if (pool.length === 0) return;
    await engine.unlock();

    const current = settingsRef.current;
    const seed = Date.now() >>> 0;
    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    callsRef.current = drawCalls(pool, current.callCount, seed);
    rampRef.current = INITIAL_RAMP;

    const startCpm = current.autoStartCpm
      ? suggestedStartCpm(historyRef.current, current.startCpm)
      : current.startCpm;
    startCpmRef.current = startCpm;

    commit({
      phase: 'sending',
      index: 0,
      cpm: startCpm,
      attempts: [],
      totalPoints: 0,
      repeatUsed: false,
    });

    void transmit(callsRef.current[0], startCpm, runId);
  }, [commit, engine, pool, transmit]);

  const abort = useCallback(() => {
    runIdRef.current += 1;
    engine.abort();
    commit(INITIAL);
  }, [commit, engine]);

  const repeat = useCallback(() => {
    const prev = stateRef.current;
    if (prev.phase !== 'copying' || !settingsRef.current.allowRepeat) return;
    commit({ ...prev, phase: 'sending', repeatUsed: true });
    void transmit(callsRef.current[prev.index], prev.cpm, runIdRef.current);
  }, [commit, transmit]);

  const submit = useCallback(
    (typed: string) => {
      const prev = stateRef.current;
      if (prev.phase !== 'copying') return;

      const current = settingsRef.current;
      const sent = callsRef.current[prev.index];
      const elapsedSeconds = (performance.now() - txEndRef.current) / 1000;
      const score = scoreCall({
        cpm: prev.cpm,
        sent,
        typed,
        elapsedSeconds,
        repeated: prev.repeatUsed,
      });

      const attempts: Attempt[] = [
        ...prev.attempts,
        {
          index: prev.index,
          sent,
          typed: typed.trim().toUpperCase(),
          cpm: prev.cpm,
          elapsedSeconds,
          repeated: prev.repeatUsed,
          score,
        },
      ];
      const totalPoints = prev.totalPoints + score.points;
      const index = prev.index + 1;

      if (index >= current.callCount) {
        runIdRef.current += 1;
        commit({ ...prev, phase: 'finished', attempts, totalPoints });

        // The run is stored with its share payload so the session can be
        // reopened later. Encoding is async, so the record is written once the
        // payload is in hand rather than in two passes.
        const timestamp = Date.now();
        void (async () => {
          const payload = await encodeRun(attempts, timestamp).catch(() => undefined);
          setHistory(
            addSession({
              id: newSessionId(timestamp),
              timestamp,
              totalPoints,
              callCount: current.callCount,
              startCpm: startCpmRef.current,
              maxCpm: Math.max(...attempts.map((a) => a.cpm)),
              finalCpm: prev.cpm,
              correct: attempts.filter((a) => a.score.correct).length,
              payload,
            }),
          );
        })();
        return;
      }

      let cpm = prev.cpm;
      if (!current.fixedSpeed) {
        const next = nextSpeed(
          prev.cpm,
          current.speedRule,
          {
            errors: score.errors,
            repeated: prev.repeatUsed,
            elapsedSeconds,
            length: sent.length,
          },
          rampRef.current,
        );
        cpm = next.cpm;
        rampRef.current = next.ramp;
      }

      commit({
        phase: 'sending',
        index,
        cpm,
        attempts,
        totalPoints,
        repeatUsed: false,
      });
      void transmit(callsRef.current[index], cpm, runIdRef.current);
    },
    [commit, transmit],
  );

  return { state, history, setHistory, start, submit, repeat, abort, engine };
}
