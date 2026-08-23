import { useState } from 'react';
import { cpmToWpm } from '../game/morse';
import { buildShareUrl, encodeRun } from '../game/share';
import type { Attempt } from '../hooks/useRufzRun';

interface Props {
  attempts: Attempt[];
  totalPoints: number;
  onRestart: () => void;
  /** Leaves the results: back to setup for a live run, back to history for a stored one. */
  onSetup: () => void;
  /**
   * Where these results came from: the run just finished here, a share link, or
   * a session reopened from the local history.
   */
  source?: 'live' | 'shared' | 'history';
  /** When a shared or stored run was recorded. */
  timestamp?: number;
  /** Share payload for a stored session, so sharing it needs no re-encoding. */
  payload?: string;
}

export function ResultsPanel({
  attempts,
  totalPoints,
  onRestart,
  onSetup,
  source = 'live',
  timestamp,
  payload,
}: Props) {
  const correct = attempts.filter((a) => a.score.correct).length;
  const maxCpm = Math.max(...attempts.map((a) => a.cpm));
  const finalCpm = attempts[attempts.length - 1]?.cpm ?? 0;
  const best = attempts.reduce((a, b) => (b.score.points > a.score.points ? b : a), attempts[0]);

  return (
    <section className="panel">
      <h2>
        {source === 'shared'
          ? 'Shared run'
          : source === 'history'
            ? 'Past session'
            : 'Run complete'}
      </h2>
      {source === 'shared' && (
        <p className="shared-note">
          Someone sent you their result
          {timestamp ? ` from ${new Date(timestamp).toLocaleDateString()}` : ''}. Nothing here
          touches your own history.
        </p>
      )}
      {source === 'history' && timestamp && (
        <p className="shared-note">Run on {new Date(timestamp).toLocaleString()}.</p>
      )}

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
        {source === 'shared' && (
          <button type="button" className="primary" onClick={onSetup}>
            Try it yourself
          </button>
        )}
        {source === 'history' && (
          <>
            <button type="button" className="primary" onClick={onSetup}>
              Back to history
            </button>
            <ShareButton attempts={attempts} payload={payload} />
          </>
        )}
        {source === 'live' && (
          <>
            <button type="button" className="primary" onClick={onRestart}>
              Run again
            </button>
            <button type="button" className="ghost" onClick={onSetup}>
              Setup
            </button>
            <ShareButton attempts={attempts} />
          </>
        )}
      </div>
    </section>
  );
}

/**
 * The whole run is packed into the link, so a share needs no server and no
 * account. Clipboard writes are blocked in some contexts, so a failure falls
 * back to showing the URL for manual copying.
 */
function ShareButton({ attempts, payload }: { attempts: Attempt[]; payload?: string }) {
  const [copied, setCopied] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState('');

  const share = async () => {
    const url = buildShareUrl(payload ?? (await encodeRun(attempts)));
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setFallbackUrl('');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFallbackUrl(url);
    }
  };

  return (
    <>
      <button type="button" className="ghost" onClick={() => void share()}>
        {copied ? 'Link copied' : 'Copy share link'}
      </button>
      {fallbackUrl && (
        <input
          className="share-fallback"
          readOnly
          value={fallbackUrl}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Share link"
        />
      )}
    </>
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
