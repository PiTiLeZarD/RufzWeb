import { useEffect, useMemo, useState } from 'react';
import { RunPanel } from './components/RunPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { ScoreList } from './components/ScoreList';
import { SetupPanel } from './components/SetupPanel';
import { generatePool } from './game/callsigns';
import { loadSettings, saveSettings, type RufzSettings } from './game/settings';
import { decodeRun, readSharePayload, type SharedRun } from './game/share';
import { useRufzRun } from './hooks/useRufzRun';

const GENERATED_POOL_SIZE = 8000;
const GENERATED_POOL_SEED = 0x52554653;
const GENERATED_LABEL = 'generated from real prefixes';

export default function App() {
  const [settings, setSettings] = useState<RufzSettings>(() => loadSettings());
  const [pool, setPool] = useState<string[] | null>(null);
  const [poolLabel, setPoolLabel] = useState(GENERATED_LABEL);
  const [shared, setShared] = useState<SharedRun | null>(null);
  const [shareBroken, setShareBroken] = useState(false);

  const generated = useMemo(
    () => generatePool(GENERATED_POOL_SIZE, GENERATED_POOL_SEED),
    [],
  );
  const activePool = pool ?? generated;

  useEffect(() => saveSettings(settings), [settings]);

  // A share link is just the hash, so it also has to be picked up on
  // navigation within the page (back button, pasting a second link).
  useEffect(() => {
    let live = true;

    const read = () => {
      const payload = readSharePayload(window.location.hash);
      if (!payload) {
        setShared(null);
        setShareBroken(false);
        return;
      }
      void decodeRun(payload).then((run) => {
        if (!live) return;
        setShared(run);
        setShareBroken(run === null);
      });
    };

    read();
    window.addEventListener('hashchange', read);
    return () => {
      live = false;
      window.removeEventListener('hashchange', read);
    };
  }, []);

  const clearShare = () => {
    history.replaceState(null, '', window.location.pathname + window.location.search);
    setShared(null);
    setShareBroken(false);
  };

  const { state, scores, start, submit, repeat, abort, engine } = useRufzRun(
    settings,
    activePool,
  );

  const testTone = async () => {
    await engine.unlock();
    engine.send('VVV TEST', settings.startCpm, settings.tone);
  };

  return (
    <div className="app">
      <header>
        <h1>
          Rufz<span>Web</span>
        </h1>
        <p>Adaptive callsign copying trainer. Web Audio, no install.</p>
      </header>

      {shareBroken && (
        <p className="share-error">
          That share link could not be read — it may have been truncated in transit.
        </p>
      )}

      {shared && (
        <ResultsPanel
          attempts={shared.attempts}
          totalPoints={shared.totalPoints}
          shared
          sharedAt={shared.timestamp}
          onRestart={clearShare}
          onSetup={clearShare}
        />
      )}

      {!shared && state.phase === 'idle' && (
        <>
          <SetupPanel
            settings={settings}
            onChange={setSettings}
            poolSize={activePool.length}
            poolLabel={poolLabel}
            onPoolImport={(calls, label) => {
              setPool(calls);
              setPoolLabel(label);
            }}
            onPoolReset={() => {
              setPool(null);
              setPoolLabel(GENERATED_LABEL);
            }}
            onStart={() => void start()}
            onTestTone={() => void testTone()}
          />
          <ScoreList scores={scores} />
        </>
      )}

      {!shared && (state.phase === 'sending' || state.phase === 'copying') && (
        <RunPanel
          state={state}
          settings={settings}
          onSubmit={submit}
          onRepeat={repeat}
          onAbort={abort}
        />
      )}

      {!shared && state.phase === 'finished' && (
        <ResultsPanel
          attempts={state.attempts}
          totalPoints={state.totalPoints}
          onRestart={() => void start()}
          onSetup={abort}
        />
      )}

      <footer>
        <p>
          Scoring follows the shape of the published RufzXP formula (quadratic in speed,
          linear in call length, divided by (errors+1)²) but the constants are ours —
          scores are not comparable with RufzXP.
        </p>
        <p>
          Free and ad-free.{' '}
          <a
            className="kofi"
            href="https://ko-fi.com/pitilezard"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span aria-hidden="true">☕</span> Buy me a coffee on Ko-fi
          </a>
        </p>
      </footer>

      <a
        className="source-link"
        href="https://github.com/PiTiLeZarD/RufzWeb"
        target="_blank"
        rel="noopener noreferrer"
        title="Source code on GitHub"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
          <path
            fill="currentColor"
            d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
          />
        </svg>
        <span>Source</span>
      </a>
    </div>
  );
}
