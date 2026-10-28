// Small SVG charts. Colors come from CSS tokens (--series-1, --series-2) so dark mode is selected, not flipped.

import { TICK_MS } from '../engine/config';

const BIN_MS = 50;

/** Distribution of click offsets within the tick; one panel per click so the shared x-axis lines up. */
export function OffsetHistogram({ first, second }: { first: number[]; second: number[] }) {
  return (
    <div className="hist">
      <HistPanel label="First click" values={first} series="series-1" />
      <HistPanel label="Second click" values={second} series="series-2" />
      <div className="hist-axis">
        {[0, 150, 300, 450, 600].map((ms) => <span key={ms} style={{ left: `${(ms / TICK_MS) * 100}%` }}>{ms}ms</span>)}
      </div>
    </div>
  );
}

function HistPanel({ label, values, series }: { label: string; values: number[]; series: string }) {
  const bins = Array.from({ length: TICK_MS / BIN_MS }, () => 0);
  for (const v of values) bins[Math.min(bins.length - 1, Math.max(0, Math.floor(v / BIN_MS)))]++;
  const max = Math.max(1, ...bins);
  const W = 600;
  const H = 70;
  const bw = W / bins.length;
  return (
    <div className="hist-panel">
      <div className="hist-label"><span className="legend-dot" style={{ background: `var(--${series})` }} />{label} <span className="muted">({values.length})</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${label} offset histogram`}>
        <line x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} className="axis-line" />
        {bins.map((n, i) => {
          const h = (n / max) * (H - 6);
          return (
            <g key={i}>
              <rect x={i * bw + 1} y={0} width={bw - 2} height={H} fill="transparent">
                <title>{`${i * BIN_MS}–${(i + 1) * BIN_MS}ms: ${n} click${n === 1 ? '' : 's'}`}</title>
              </rect>
              {n > 0 && (
                <path
                  d={roundedTopBar(i * bw + 1, H - h, bw - 2, h, 4)}
                  fill={`var(--${series})`}
                  pointerEvents="none"
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function roundedTopBar(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

/** One-series trend line over sessions. */
export function TrendChart({
  label, values, format, yMax, lowerIsBetter,
}: { label: string; values: { v: number; date: string }[]; format: (v: number) => string; yMax?: number; lowerIsBetter?: boolean }) {
  const W = 600;
  const H = 160;
  const pad = { l: 44, r: 12, t: 12, b: 22 };
  if (values.length === 0) return <div className="muted chart-empty">{label}: no sessions yet.</div>;
  const max = yMax ?? Math.max(1, ...values.map((d) => d.v)) * 1.1;
  const x = (i: number) => pad.l + (values.length === 1 ? (W - pad.l - pad.r) / 2 : (i / (values.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const path = values.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.v)}`).join(' ');
  const ticks = [0, max / 2, max];
  return (
    <figure className="trend">
      <figcaption>{label}{lowerIsBetter && <span className="muted"> (lower is better)</span>}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid-line" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="axis-text">{format(t)}</text>
          </g>
        ))}
        <text x={pad.l} y={H - 4} className="axis-text">oldest</text>
        <text x={W - pad.r} y={H - 4} textAnchor="end" className="axis-text">latest</text>
        <path d={path} className="trend-line" />
        {values.map((d, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(d.v)} r="4" className="trend-dot" />
            <circle cx={x(i)} cy={y(d.v)} r="12" fill="transparent">
              <title>{`${new Date(d.date).toLocaleString()}: ${format(d.v)}`}</title>
            </circle>
          </g>
        ))}
      </svg>
    </figure>
  );
}
