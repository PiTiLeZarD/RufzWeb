import { cpmToWpm } from '../game/morse';
import type { StoredScore } from '../game/settings';

export function ScoreList({ scores }: { scores: StoredScore[] }) {
  if (scores.length === 0) return null;

  return (
    <section className="panel">
      <h2>Personal best</h2>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Points</th>
              <th>Clean</th>
              <th>Top speed</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {scores.slice(0, 10).map((score, i) => (
              <tr key={score.timestamp}>
                <td>{i + 1}</td>
                <td>{score.totalPoints.toLocaleString()}</td>
                <td>
                  {score.correct} / {score.callCount}
                </td>
                <td>
                  {score.maxCpm} cpm · {cpmToWpm(score.maxCpm).toFixed(0)} wpm
                </td>
                <td>{new Date(score.timestamp).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
