import { useEffect, useRef, useState } from 'react';
import { cpmToWpm } from '../game/morse';
import type { RunState } from '../hooks/useRufzRun';
import type { RufzSettings } from '../game/settings';

interface Props {
  state: RunState;
  settings: RufzSettings;
  onSubmit: (typed: string) => void;
  onRepeat: () => void;
  onAbort: () => void;
}

export function RunPanel({ state, settings, onSubmit, onRepeat, onAbort }: Props) {
  const [typed, setTyped] = useState('');
  const input = useRef<HTMLInputElement>(null);

  // Clear and refocus whenever a new call starts sending.
  useEffect(() => {
    setTyped('');
    input.current?.focus();
  }, [state.index]);

  useEffect(() => {
    if (state.phase === 'copying') input.current?.focus();
  }, [state.phase]);

  const last = state.attempts[state.attempts.length - 1];

  const handleKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onSubmit(typed);
      setTyped('');
      return;
    }
    // F6 matches RufzXP; Ctrl+R is the fallback where the browser eats F6.
    if (event.key === 'F6' || (event.ctrlKey && event.key.toLowerCase() === 'r')) {
      event.preventDefault();
      onRepeat();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onAbort();
    }
  };

  return (
    <section className="panel run">
      <div className="run-stats">
        <Stat label="Call" value={`${state.index + 1} / ${settings.callCount}`} />
        <Stat
          label="Speed"
          value={`${state.cpm} cpm`}
          sub={`${cpmToWpm(state.cpm).toFixed(0)} wpm`}
        />
        <Stat label="Points" value={state.totalPoints.toLocaleString()} />
      </div>

      <progress max={settings.callCount} value={state.index} />

      <div className={`tx-indicator ${state.phase}`}>
        {state.phase === 'sending' ? 'sending…' : 'copy'}
      </div>

      <input
        ref={input}
        className="call-input"
        value={typed}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="characters"
        placeholder="callsign"
        onChange={(e) => setTyped(e.target.value.toUpperCase())}
        onKeyDown={handleKey}
        onBlur={() => input.current?.focus()}
      />

      <div className="last-call">
        {last ? (
          <>
            <span className={last.score.correct ? 'ok' : 'bad'}>{last.sent}</span>
            {!last.score.correct && <span className="typed">you: {last.typed || '—'}</span>}
            <span className="pts">+{last.score.points.toLocaleString()}</span>
            {last.repeated && <span className="tag">repeat</span>}
          </>
        ) : (
          <span className="muted">Type what you hear, then Enter.</span>
        )}
      </div>

      <div className="hints">
        <kbd>Enter</kbd> send · <kbd>F6</kbd>/<kbd>Ctrl+R</kbd> repeat
        {settings.allowRepeat ? ' (half points)' : ' (disabled)'} · <kbd>Esc</kbd> abort
      </div>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}
