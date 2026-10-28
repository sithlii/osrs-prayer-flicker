// End-of-run breakdown (PRD §6.2).

import type { ReactNode } from 'react';
import type { TickVerdict } from '../engine/scoring';
import { ERROR_TEXT, type FlickError } from '../engine/scoring';
import { summarizeFlicks } from './summary';
import { OffsetHistogram } from './charts';
import { Stat, fmtMs, fmtPct } from '../ui/components';

export function SessionSummary({
  verdicts, pointsDrained, baselineDrain, children, showTiming = true,
}: {
  verdicts: TickVerdict[];
  pointsDrained: number;
  baselineDrain: number;
  children?: ReactNode;
  showTiming?: boolean;
}) {
  const s = summarizeFlicks(verdicts);
  const errors = (Object.entries(s.errors) as [FlickError, number][]).sort((a, b) => b[1] - a[1]);
  return (
    <section className="summary">
      <h3>Session summary</h3>
      <div className="stat-row">
        {showTiming && <Stat label="Accuracy" value={fmtPct(s.accuracy)} sub={`${s.correct}/${s.ticks} ticks`} />}
        {showTiming && <Stat label="Longest streak" value={s.longestStreak} />}
        <Stat label="Points drained" value={pointsDrained} sub={`no-flick baseline ${baselineDrain} · perfect 0`} />
        <Stat label="Points saved" value={Math.max(0, baselineDrain - pointsDrained)} />
        {showTiming && s.firstOffsets.length > 0 && (
          <Stat label="First click" value={fmtMs(s.meanOffset)} sub={`σ ${Math.round(s.stdOffset)}ms consistency`} />
        )}
        {showTiming && s.meanGap > 0 && <Stat label="Mean pair gap" value={`${Math.round(s.meanGap)}ms`} />}
        {children}
      </div>

      {showTiming && s.topError && (
        <div className="tip">
          <strong>Most common error: {s.topError.text}</strong> ({s.topError.count}×)
          <p>{s.topError.tip}</p>
        </div>
      )}

      {showTiming && (s.firstOffsets.length > 0 || s.secondOffsets.length > 0) && (
        <>
          <h4>Where your clicks landed in the tick</h4>
          <OffsetHistogram first={s.firstOffsets} second={s.secondOffsets} />
        </>
      )}

      {showTiming && errors.length > 0 && (
        <table className="table">
          <thead><tr><th>Error</th><th>Count</th></tr></thead>
          <tbody>{errors.map(([e, n]) => <tr key={e}><td>{ERROR_TEXT[e]}</td><td>{n}</td></tr>)}</tbody>
        </table>
      )}
    </section>
  );
}
