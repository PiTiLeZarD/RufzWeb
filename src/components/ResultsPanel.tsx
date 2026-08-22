import { cpmToWpm } from '../game/morse';
import type { Attempt } from '../hooks/useRufzRun';

interface Props {
  attempts: Attempt[];
  totalPoints: number;
  onRestart: () => void;
  onSetup: () => void;
}

export function ResultsPanel({ attempts, totalPoints, onRestart, onSetup }: Props) {
  const correct = attempts.filter((a) => a.score.correct).length;
  const maxCpm = Math.max(...attempts.map((a) => a.cpm));
  const finalCpm = attempts[attempts.length - 1]?.cpm ?? 0;
  const best = attempts.reduce((a, b) => (b.score.points > a.score.points ? b : a), attempts[0]);

  return (
    <section className="panel">
      <h2>Run complete</h2>

      <div className="result-summary">
        <div className="score-big">{totalPoints.toLocaleString()}</div>
        <dl>
          <div>
            <dt>Copied clean</dt>
            <dd>
              {correct} / {attempts.length}
            </dd>
          </div>
          <div>
            <dt>Top speed</dt>
            <dd>
              {maxCpm} cpm · {cpmToWpm(maxCpm).toFixed(0)} wpm
            </dd>
          </div>
          <div>
            <dt>Final speed</dt>
            <dd>
              {finalCpm} cpm · {cpmToWpm(finalCpm).toFixed(0)} wpm
            </dd>
          </div>
          <div>
            <dt>Best call</dt>
            <dd>
              {best.sent} · {best.score.points.toLocaleString()}
            </dd>
          </div>
        </dl>
      </div>

      <SpeedChart attempts={attempts} />

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Sent</th>
              <th>Typed</th>
              <th>cpm</th>
              <th>Err</th>
              <th>Time</th>
              <th>Points</th>
            </tr>
          </thead>
          <tbody>
            {attempts.map((a) => (
              <tr key={a.index} className={a.score.correct ? '' : 'miss'}>
                <td>{a.index + 1}</td>
                <td className="mono">{a.sent}</td>
                <td className="mono">{a.typed || '—'}</td>
                <td>{a.cpm}</td>
                <td>{a.score.errors > 3 ? '3+' : a.score.errors}</td>
                <td>{a.elapsedSeconds.toFixed(1)}s</td>
                <td>{a.score.points.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="actions">
        <button type="button" className="primary" onClick={onRestart}>
          Run again
        </button>
        <button type="button" className="ghost" onClick={onSetup}>
          Setup
        </button>
      </div>
    </section>
  );
}

function SpeedChart({ attempts }: { attempts: Attempt[] }) {
  const width = 720;
  const height = 140;
  const pad = 8;
  const maxCpm = Math.max(...attempts.map((a) => a.cpm)) * 1.1;
  const x = (i: number) => pad + (i / Math.max(1, attempts.length - 1)) * (width - pad * 2);
  const y = (cpm: number) => height - pad - (cpm / maxCpm) * (height - pad * 2);

  const path = attempts.map((a, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(a.cpm)}`).join(' ');

  return (
    <svg className="speed-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Speed over the run">
      <path d={path} fill="none" stroke="currentColor" strokeWidth={2} />
      {attempts.map((a, i) => (
        <circle
          key={a.index}
          cx={x(i)}
          cy={y(a.cpm)}
          r={2.5}
          className={a.score.correct ? 'dot-ok' : 'dot-bad'}
        />
      ))}
    </svg>
  );
}
