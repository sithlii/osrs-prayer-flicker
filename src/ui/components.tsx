import { useEffect, useRef, type ReactNode } from 'react';
import type { PrayerEngine } from '../engine/engine';
import type { SessionClock } from '../engine/clock';
import { TICK_MS } from '../engine/config';
import type { TickStatus, TickVerdict } from '../engine/scoring';
import { PRAYER_BY_ID, type PrayerId } from '../data/prayers';
import { keyLabel, useSettings, type ActionId } from '../settings/settings';

export const STATUS_SYMBOL: Record<TickStatus, string> = { correct: '✓', drained: '!', off: '✕', idle: '·' };
export const STATUS_LABEL: Record<TickStatus, string> = {
  correct: 'Correct',
  drained: 'Drained / wasted',
  off: 'Off at boundary',
  idle: 'Intentionally off',
};

/** Visual metronome: a cursor sweeping each 600ms tick, with this tick's clicks marked. */
export function TickBar({ clock, engine }: { clock: SessionClock | null; engine: PrayerEngine | null }) {
  const cursor = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const markers = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!clock || !engine) return;
    let raf = 0;
    let lastTick = -1;
    const frame = () => {
      const t = clock.now();
      const pos = t / TICK_MS;
      const tick = Math.floor(pos);
      if (t >= 0 && cursor.current) cursor.current.style.left = `${(pos - tick) * 100}%`;
      if (tick !== lastTick && t >= 0) {
        lastTick = tick;
        flash.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180 });
      }
      if (markers.current) {
        const recs = engine.inputs.filter((r) => r.tick === engine.tickOf(t));
        const html = recs.map((r) => `<span class="tickbar-mark" style="left:${(r.offset / TICK_MS) * 100}%"></span>`).join('');
        if (markers.current.innerHTML !== html) markers.current.innerHTML = html;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [clock, engine]);

  return (
    <div className="tickbar" aria-label="Tick metronome">
      <div className="tickbar-flash" ref={flash} />
      <div className="tickbar-half" />
      <div ref={markers} />
      <div className="tickbar-cursor" ref={cursor} />
    </div>
  );
}

/** Scrolling strip of recent ticks with click markers (PRD §6.1). */
export function Timeline({ verdicts, max = 30 }: { verdicts: TickVerdict[]; max?: number }) {
  const shown = verdicts.slice(-max);
  return (
    <div>
      <div className="timeline" role="list" aria-label="Tick timeline">
        {shown.map((v) => (
          <div
            key={v.tick}
            role="listitem"
            className={`cell cell-${v.status}`}
            title={`Tick ${v.tick}: ${STATUS_LABEL[v.status]}${v.offsets.length ? ` · clicks at ${v.offsets.map((o) => `+${Math.round(o)}ms`).join(', ')}` : ''}`}
          >
            <span className="cell-symbol">{STATUS_SYMBOL[v.status]}</span>
            {v.offsets.map((o, i) => (
              <span key={i} className="cell-mark" style={{ left: `${(o / TICK_MS) * 100}%` }} />
            ))}
          </div>
        ))}
        {Array.from({ length: Math.max(0, max - shown.length) }, (_, i) => (
          <div key={`e${i}`} className="cell cell-empty" />
        ))}
      </div>
      <div className="legend">
        {(['correct', 'drained', 'off', 'idle'] as TickStatus[]).map((s) => (
          <span key={s}>
            <span className={`legend-swatch cell-${s}`}>{STATUS_SYMBOL[s]}</span> {STATUS_LABEL[s]}
          </span>
        ))}
        <span><span className="legend-mark" /> Click position within the tick</span>
      </div>
    </div>
  );
}

export function KeyHint({ action }: { action: ActionId }) {
  const { settings } = useSettings();
  const code = settings.keybinds[action];
  if (!settings.showKeyLabels || !code) return null;
  return <kbd className="keyhint">{keyLabel(code)}</kbd>;
}

export function Orb({
  points, max, active, onPress, disabled,
}: { points: number; max: number; active: boolean; onPress: (e: React.PointerEvent) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={`orb ${active ? 'orb-on' : ''}`}
      onPointerDown={(e) => { if (!disabled) { e.preventDefault(); onPress(e); } }}
      aria-pressed={active}
      aria-label="Quick-prayer orb"
    >
      <span className="orb-fill" style={{ height: `${(points / max) * 100}%` }} />
      <span className="orb-icon" aria-hidden>✦</span>
      <span className="orb-points">{points}</span>
      <KeyHint action="quickPrayer" />
    </button>
  );
}

export function PrayerIcon({
  id, active, onPress, size = 'md', dim,
}: { id: PrayerId; active: boolean; onPress?: (e: React.PointerEvent) => void; size?: 'sm' | 'md'; dim?: boolean }) {
  const pr = PRAYER_BY_ID[id];
  const kind = pr.overhead ? 'overhead' : pr.groups.length === 0 ? 'utility' : pr.groups.length > 1 ? 'combo' : pr.groups[0];
  return (
    <button
      type="button"
      className={`prayer prayer-${size} prayer-${kind} ${active ? 'prayer-on' : ''} ${dim ? 'prayer-dim' : ''}`}
      onPointerDown={(e) => { if (onPress) { e.preventDefault(); onPress(e); } }}
      aria-pressed={active}
      title={`${pr.name} (lvl ${pr.level}, drain ${pr.drain}): ${pr.effect}`}
    >
      <svg viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r="13" className="prayer-gem" />
        <text x="16" y="20.5" textAnchor="middle" className="prayer-glyph">{pr.glyph}</text>
      </svg>
      <KeyHint action={`prayer:${id}`} />
    </button>
  );
}

export function PrayerBook({
  active, onToggle, level = 99, highlight,
}: { active: ReadonlySet<PrayerId>; onToggle: (id: PrayerId, e: React.PointerEvent) => void; level?: number; highlight?: PrayerId[] }) {
  return (
    <div className="prayerbook">
      {Object.values(PRAYER_BY_ID).map((pr) => (
        <PrayerIcon
          key={pr.id}
          id={pr.id}
          active={active.has(pr.id)}
          dim={pr.level > level || (highlight && !highlight.includes(pr.id))}
          onPress={pr.level <= level ? (e) => onToggle(pr.id, e) : undefined}
        />
      ))}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub !== undefined && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Segmented<T extends string | number>({
  value, options, onChange, disabled,
}: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'on' : ''}
          disabled={disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const fmtMs = (ms: number) => `${ms >= 0 ? '+' : ''}${Math.round(ms)}ms`;
export const fmtPct = (x: number) => `${Math.round(x * 100)}%`;
