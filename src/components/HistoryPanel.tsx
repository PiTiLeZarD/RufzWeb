import { useMemo, useState } from 'react';
import { bestSession, inOrder, type SessionRecord } from '../game/history';
import { cpmToWpm } from '../game/morse';

type Sort = 'recent' | 'best';

interface Props {
  history: SessionRecord[];
  onOpen: (session: SessionRecord) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}

export function HistoryPanel({ history, onOpen, onDelete, onClear }: Props) {
  const [sort, setSort] = useState<Sort>('recent');
  const [confirmClear, setConfirmClear] = useState(false);

  const best = useMemo(() => bestSession(history), [history]);
  const rows = useMemo(
    () =>
      sort === 'best'
        ? [...history].sort((a, b) => b.totalPoints - a.totalPoints)
        : history,
    [history, sort],
  );

  if (history.length === 0) return null;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>History</h2>
        <div className="segmented" role="group" aria-label="Sort sessions">
          <button
            type="button"
            className={sort === 'recent' ? 'on' : ''}
            onClick={() => setSort('recent')}
          >
            Recent
          </button>
          <button
            type="button"
            className={sort === 'best' ? 'on' : ''}
            onClick={() => setSort('best')}
          >
            Best
          </button>
        </div>
      </div>

      <ProgressChart history={history} />

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Points</th>
              <th>Clean</th>
              <th>Top speed</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((session) => (
              <tr key={session.id}>
                <td>{formatDate(session.timestamp)}</td>
                <td>
                  {session.totalPoints.toLocaleString()}
                  {best?.id === session.id && <span className="pb">PB</span>}
                </td>
                <td>
                  {session.correct} / {session.callCount}
                </td>
                <td>
                  {session.maxCpm} cpm · {cpmToWpm(session.maxCpm).toFixed(0)} wpm
                </td>
                <td className="row-actions">
                  {session.payload ? (
                    <button type="button" className="link" onClick={() => onOpen(session)}>
                      View
                    </button>
                  ) : (
                    // Carried over from the old top-scores table, which never
                    // stored the calls themselves.
                    <span className="muted">summary only</span>
                  )}
                  <button
                    type="button"
                    className="link danger"
                    onClick={() => onDelete(session.id)}
                    aria-label={`Delete session from ${formatDate(session.timestamp)}`}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="history-foot">
        <span className="muted">
          {history.length} session{history.length === 1 ? '' : 's'} stored on this device
        </span>
        {confirmClear ? (
          <span className="confirm">
            Delete every session?
            <button
              type="button"
              className="link danger"
              onClick={() => {
                onClear();
                setConfirmClear(false);
              }}
            >
              Yes, clear
            </button>
            <button type="button" className="link" onClick={() => setConfirmClear(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" className="link" onClick={() => setConfirmClear(true)}>
            Clear history
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * Points per session over time. The x axis is session order rather than real
 * time so a long gap between two runs does not squash everything else, and the
 * running best is drawn behind the line to make progress readable.
 */
function ProgressChart({ history }: { history: SessionRecord[] }) {
  const sessions = useMemo(() => inOrder(history), [history]);

  const width = 720;
  const height = 180;
  const padX = 44;
  const padTop = 12;
  const padBottom = 22;

  const top = Math.max(1, ...sessions.map((s) => s.totalPoints));
  const x = (i: number) =>
    padX + (i / Math.max(1, sessions.length - 1)) * (width - padX - 12);
  const y = (points: number) =>
    height - padBottom - (points / top) * (height - padTop - padBottom);

  const line = sessions
    .map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(s.totalPoints)}`)
    .join(' ');

  const bestLine = runningBestPath(sessions, x, y);

  return (
    <svg
      className="progress-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Points across ${sessions.length} sessions, best ${top.toLocaleString()}`}
    >
      <line
        className="axis"
        x1={padX}
        y1={height - padBottom}
        x2={width - 12}
        y2={height - padBottom}
      />
      <text className="tick" x={padX - 6} y={y(top) + 4} textAnchor="end">
        {compact(top)}
      </text>
      <text className="tick" x={padX - 6} y={height - padBottom + 4} textAnchor="end">
        0
      </text>

      {sessions.length > 1 && (
        <path className="best-line" d={bestLine} fill="none" strokeWidth={1.5} />
      )}
      <path d={line} fill="none" stroke="currentColor" strokeWidth={2} />
      {sessions.map((s, i) => (
        <circle key={s.id} cx={x(i)} cy={y(s.totalPoints)} r={2.5} className="dot-ok">
          <title>{`${formatDate(s.timestamp)} — ${s.totalPoints.toLocaleString()} points`}</title>
        </circle>
      ))}

      <text className="tick" x={padX} y={height - 6}>
        {sessions.length > 0 ? formatDate(sessions[0].timestamp) : ''}
      </text>
      {sessions.length > 1 && (
        <text className="tick" x={width - 12} y={height - 6} textAnchor="end">
          {formatDate(sessions[sessions.length - 1].timestamp)}
        </text>
      )}
    </svg>
  );
}

/** The best score so far at each session, as an SVG path. */
function runningBestPath(
  sessions: SessionRecord[],
  x: (i: number) => number,
  y: (points: number) => number,
): string {
  const parts: string[] = [];
  let running = 0;
  for (let i = 0; i < sessions.length; i += 1) {
    running = Math.max(running, sessions[i].totalPoints);
    parts.push(`${i === 0 ? 'M' : 'L'}${x(i)},${y(running)}`);
  }
  return parts.join(' ');
}

function compact(points: number): string {
  return points >= 10000 ? `${Math.round(points / 1000)}k` : points.toLocaleString();
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  });
}
