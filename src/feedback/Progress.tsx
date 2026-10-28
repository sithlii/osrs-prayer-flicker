// Progress over time (PRD §6.3): history, trends, personal bests, JSON export/import.

import { useRef, useState } from 'react';
import { MODE_LABEL, useHistory, type ModeId, type SessionRecord } from './history';
import { TrendChart } from './charts';
import { fmtPct } from '../ui/components';

export function Progress() {
  const { history, replace } = useHistory();
  const [mode, setMode] = useState<ModeId>('oneTickQuick');
  const [message, setMessage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const forMode = history.filter((r) => r.mode === mode);
  const variants = [...new Set(forMode.map((r) => r.variant))];

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ version: 1, sessions: history }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `prayer-flick-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const sessions: SessionRecord[] = Array.isArray(data) ? data : data.sessions;
      if (!Array.isArray(sessions)) throw new Error('No sessions found');
      const byId = new Map(history.map((r) => [r.id, r]));
      for (const s of sessions) if (s && s.id && s.mode) byId.set(s.id, s);
      const merged = [...byId.values()].sort((a, b) => a.date.localeCompare(b.date));
      replace(merged);
      setMessage(`Imported ${sessions.length} sessions (${merged.length} total).`);
    } catch (e) {
      setMessage(`Import failed: ${(e as Error).message}`);
    }
  };

  return (
    <section className="drill">
      <header className="drill-head">
        <h2>Progress</h2>
        <p className="muted">Sessions are saved in this browser only. Export them to back up or move to another machine.</p>
      </header>
      <div className="controls">
        <label>
          Mode
          <select value={mode} onChange={(e) => setMode(e.target.value as ModeId)}>
            {(Object.keys(MODE_LABEL) as ModeId[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
          </select>
        </label>
        <button onClick={exportJson} disabled={history.length === 0}>Export JSON</button>
        <button onClick={() => fileRef.current?.click()}>Import JSON</button>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
        {history.length > 0 && <button className="danger" onClick={() => { if (confirm('Delete all saved sessions?')) replace([]); }}>Clear history</button>}
      </div>
      {message && <p className="muted">{message}</p>}

      {variants.length === 0 && <p className="muted">No sessions for this mode yet. Finish a run of at least a few ticks to record one.</p>}
      {variants.map((v) => {
        const recs = forMode.filter((r) => r.variant === v);
        const best = [...recs].sort((a, b) => b.accuracy - a.accuracy || b.longestStreak - a.longestStreak)[0];
        return (
          <div key={v} className="card">
            <h3>{v}</h3>
            <p className="muted small">
              {recs.length} session{recs.length === 1 ? '' : 's'} · personal best {fmtPct(best.accuracy)} (streak {best.longestStreak}) on {new Date(best.date).toLocaleDateString()}
            </p>
            <div className="trend-row">
              <TrendChart label="Accuracy" values={recs.map((r) => ({ v: r.accuracy * 100, date: r.date }))} format={(x) => `${Math.round(x)}%`} yMax={100} />
              {recs.some((r) => r.consistencyMs !== undefined) && (
                <TrendChart
                  label="Timing consistency (σ of first click)"
                  values={recs.filter((r) => r.consistencyMs !== undefined).map((r) => ({ v: r.consistencyMs!, date: r.date }))}
                  format={(x) => `${Math.round(x)}ms`}
                  lowerIsBetter
                />
              )}
            </div>
            <details>
              <summary>Session table</summary>
              <table className="table">
                <thead><tr><th>Date</th><th>Ticks</th><th>Accuracy</th><th>Streak</th><th>σ</th><th>Drained / baseline</th></tr></thead>
                <tbody>
                  {[...recs].reverse().map((r) => (
                    <tr key={r.id}>
                      <td>{new Date(r.date).toLocaleString()}</td>
                      <td>{r.ticks}</td>
                      <td>{fmtPct(r.accuracy)}</td>
                      <td>{r.longestStreak}</td>
                      <td>{r.consistencyMs !== undefined ? `${Math.round(r.consistencyMs)}ms` : '–'}</td>
                      <td>{r.pointsDrained} / {r.baselineDrain}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        );
      })}
    </section>
  );
}
