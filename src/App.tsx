import { useEffect, useMemo, useState } from 'react';
import { RunPanel } from './components/RunPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { ScoreList } from './components/ScoreList';
import { SetupPanel } from './components/SetupPanel';
import { generatePool } from './game/callsigns';
import { loadSettings, saveSettings, type RufzSettings } from './game/settings';
import { useRufzRun } from './hooks/useRufzRun';

const GENERATED_POOL_SIZE = 8000;
const GENERATED_POOL_SEED = 0x52554653;
const GENERATED_LABEL = 'generated from real prefixes';

export default function App() {
  const [settings, setSettings] = useState<RufzSettings>(() => loadSettings());
  const [pool, setPool] = useState<string[] | null>(null);
  const [poolLabel, setPoolLabel] = useState(GENERATED_LABEL);

  const generated = useMemo(
    () => generatePool(GENERATED_POOL_SIZE, GENERATED_POOL_SEED),
    [],
  );
  const activePool = pool ?? generated;

  useEffect(() => saveSettings(settings), [settings]);

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

      {state.phase === 'idle' && (
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

      {(state.phase === 'sending' || state.phase === 'copying') && (
        <RunPanel
          state={state}
          settings={settings}
          onSubmit={submit}
          onRepeat={repeat}
          onAbort={abort}
        />
      )}

      {state.phase === 'finished' && (
        <ResultsPanel
          attempts={state.attempts}
          totalPoints={state.totalPoints}
          onRestart={() => void start()}
          onSetup={abort}
        />
      )}

      <footer>
        Scoring follows the shape of the published RufzXP formula (quadratic in speed,
        linear in call length, divided by (errors+1)²) but the constants are ours —
        scores are not comparable with RufzXP.
      </footer>
    </div>
  );
}
