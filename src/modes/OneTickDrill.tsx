// 1-tick flicking drills: quick-prayer orb (PRD §5.1) and a single prayer in the prayer book (§5.2).

import { useMemo, useState } from 'react';
import { useDrill, useKeyActions } from '../ui/useDrill';
import { classifyOneTick, ERROR_TEXT } from '../engine/scoring';
import { continuousDrain } from '../engine/engine';
import { FLICK_USELESS, PRAYER_BY_ID, PRAYERS, type PrayerId } from '../data/prayers';
import { Orb, PrayerBook, Segmented, Stat, TickBar, Timeline, fmtMs, fmtPct } from '../ui/components';
import { SessionSummary } from '../feedback/SessionSummary';
import { summarizeFlicks } from '../feedback/summary';
import { personalBest, useHistory, type ModeId } from '../feedback/history';
import { useSettings } from '../settings/settings';
import { TICK_MS } from '../engine/config';

const DIFFICULTIES = [
  { value: 1, label: '1 · Visual + audio', visual: true, audio: true },
  { value: 2, label: '2 · Audio only', visual: false, audio: true },
  { value: 3, label: '3 · Visual only', visual: true, audio: false },
  { value: 4, label: '4 · Blind', visual: false, audio: false },
];

const QUICK_PRESETS: { label: string; prayers: PrayerId[] }[] = [
  { label: 'Protect from Melee', prayers: ['protectFromMelee'] },
  { label: 'Piety', prayers: ['piety'] },
  { label: 'Stacked: Protect from Melee + Piety', prayers: ['protectFromMelee', 'piety'] },
  { label: 'Stacked: Protect from Missiles + Rigour', prayers: ['protectFromMissiles', 'rigour'] },
];

const DURATIONS = [
  { value: 50, label: '30s' },
  { value: 100, label: '60s' },
  { value: 200, label: '2 min' },
  { value: 0, label: 'Endless' },
];

export function OneTickDrill({ variant }: { variant: 'quick' | 'book' }) {
  const { settings } = useSettings();
  const { history, add } = useHistory();
  const [difficulty, setDifficulty] = useState(1);
  const [duration, setDuration] = useState(100);
  const [quickSet, setQuickSet] = useState<PrayerId[]>(['protectFromMelee']);
  const [bookTarget, setBookTarget] = useState<PrayerId>('protectFromMelee');
  const target = variant === 'quick' ? quickSet : [bookTarget];
  const diff = DIFFICULTIES.find((d) => d.value === difficulty)!;
  const mode: ModeId = variant === 'quick' ? 'oneTickQuick' : 'oneTickBook';
  const variantLabel = diff.label.replace(/^\d · /, '');

  const drill = useDrill({
    quickPrayers: target,
    durationTicks: duration,
    audio: diff.audio,
    scoreFromFirstInput: true,
    countInTicks: 0,
    classify: (res) => classifyOneTick(res, target),
    onFinish: (verdicts, engine) => {
      if (verdicts.length < 5) return;
      const s = summarizeFlicks(verdicts);
      add({
        mode,
        variant: variantLabel,
        ticks: s.ticks,
        accuracy: s.accuracy,
        longestStreak: s.longestStreak,
        consistencyMs: s.stdOffset,
        pointsDrained: settings.prayerLevel - engine.points,
        baselineDrain: continuousDrain(target, s.ticks, { prayerBonus: settings.prayerBonus, config: settings.engine }),
        stats: { meanOffset: s.meanOffset, meanGap: s.meanGap },
      });
    },
  });

  const running = drill.status === 'running';
  const showLive = running ? diff.visual : true;

  useKeyActions((action, e) => {
    if (action === 'quickPrayer' && variant === 'quick') drill.input({ kind: 'quick' }, e.timeStamp);
    if (action.startsWith('prayer:') && variant === 'book') {
      drill.input({ kind: 'toggle', prayer: action.slice(7) as PrayerId }, e.timeStamp);
    }
  }, running);

  const summary = useMemo(() => summarizeFlicks(drill.verdicts), [drill.verdicts]);
  const last = drill.verdicts[drill.verdicts.length - 1];
  const engine = drill.engine;
  const pending = engine?.pending ?? new Set<PrayerId>();
  const pb = personalBest(history, mode, variantLabel);
  const flickWarnings = target.filter((id) => FLICK_USELESS.includes(id));

  return (
    <section className="drill">
      <header className="drill-head">
        <h2>{variant === 'quick' ? '1-tick flick: quick-prayer orb' : '1-tick flick: prayer book'}</h2>
        <p className="muted">
          Tick 1: one click to turn the prayer on. Every tick after: two clicks, off then on, inside the same tick.
          {variant === 'quick' ? ' Use the orb or your quick-prayer bind.' : ' Click the highlighted prayer, or bind it in Settings.'}
        </p>
      </header>

      <div className="controls">
        <div className="field" role="group" aria-label="Difficulty"><span>Difficulty</span> <Segmented value={difficulty} options={DIFFICULTIES} onChange={setDifficulty} disabled={running} /></div>
        <div className="field" role="group" aria-label="Length"><span>Length</span> <Segmented value={duration} options={DURATIONS} onChange={setDuration} disabled={running} /></div>
        {variant === 'quick' ? (
          <div className="field">
            <label htmlFor="quick-set">Quick prayers</label>
            <select
              id="quick-set"
              value={QUICK_PRESETS.findIndex((p) => p.prayers.join() === quickSet.join())}
              disabled={running}
              onChange={(e) => {
                const i = Number(e.target.value);
                if (i >= 0) setQuickSet(QUICK_PRESETS[i].prayers);
              }}
            >
              {QUICK_PRESETS.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
              {QUICK_PRESETS.every((p) => p.prayers.join() !== quickSet.join()) && <option value={-1}>Custom</option>}
            </select>
            <details className="custom-quick">
              <summary>Custom set</summary>
              <div className="chips">
                {PRAYERS.map((p) => (
                  <label key={p.id} className="chip">
                    <input
                      type="checkbox"
                      disabled={running}
                      checked={quickSet.includes(p.id)}
                      onChange={(e) => setQuickSet((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </details>
          </div>
        ) : (
          <label>
            Target prayer
            <select value={bookTarget} disabled={running} onChange={(e) => setBookTarget(e.target.value as PrayerId)}>
              {PRAYERS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {flickWarnings.length > 0 && (
        <p className="warning" role="alert">
          ⚠ {flickWarnings.map((id) => PRAYER_BY_ID[id].name).join(' and ')} do nothing when 1-tick flicked: Preserve must stay on for
          15s continuously, and each Rapid Heal activation resets the HP regen timer.
        </p>
      )}

      <div className="drill-stage">
        <div className="drill-main">
          {running && diff.visual ? <TickBar clock={drill.clock} engine={engine} /> : <div className="tickbar tickbar-hidden">{running ? 'Metronome hidden' : 'Press Start, then click on any beat to begin'}</div>}

          <div className="input-zone">
            {variant === 'quick' ? (
              <Orb
                points={engine?.points ?? settings.prayerLevel}
                max={settings.prayerLevel}
                active={target.some((id) => pending.has(id))}
                disabled={!running}
                onPress={(e) => drill.input({ kind: 'quick' }, e.timeStamp)}
              />
            ) : (
              <PrayerBook
                active={pending}
                level={settings.prayerLevel}
                highlight={[bookTarget]}
                onToggle={(id, e) => drill.input({ kind: 'toggle', prayer: id }, e.timeStamp)}
              />
            )}
          </div>

          <div className="actions">
            {running ? <button onClick={drill.stop}>Stop</button> : <button className="primary" onClick={drill.start}>{drill.status === 'done' ? 'Restart' : 'Start'}</button>}
          </div>

          {showLive ? (
            <>
              <div className={`callout ${last ? `callout-${last.status}` : ''}`} aria-live="polite">
                {last
                  ? <>
                      <strong>{last.status === 'correct' ? (last.error ? ERROR_TEXT[last.error] : 'Clean flick') : ERROR_TEXT[last.error!]}</strong>
                      {last.offsets.length > 0 && <span> · {last.offsets.map(fmtMs).join(' / ')}</span>}
                      {last.gap !== undefined && <span className="muted"> · gap {Math.round(last.gap)}ms</span>}
                    </>
                  : <span className="muted">Waiting for your first click…</span>}
              </div>
              <Timeline verdicts={drill.verdicts} />
            </>
          ) : (
            <p className="muted">Live feedback is hidden at this difficulty. You'll get the full breakdown when the run ends.</p>
          )}
        </div>

        <aside className="drill-stats">
          <Stat label="Accuracy" value={fmtPct(summary.accuracy)} sub={`${summary.correct}/${summary.ticks} ticks`} />
          <Stat label="Streak (best)" value={summary.longestStreak} />
          <Stat label="Prayer points" value={engine?.points ?? settings.prayerLevel} sub={`of ${settings.prayerLevel}`} />
          <Stat label="Mean first click" value={summary.firstOffsets.length ? fmtMs(summary.meanOffset) : '–'} sub={summary.firstOffsets.length > 1 ? `σ ${Math.round(summary.stdOffset)}ms` : undefined} />
          {duration > 0 && running && <Stat label="Time left" value={`${Math.max(0, Math.ceil(((duration - drill.verdicts.length) * TICK_MS) / 1000))}s`} />}
          {pb && <Stat label="Personal best" value={fmtPct(pb.accuracy)} sub={`streak ${pb.longestStreak}`} />}
        </aside>
      </div>

      {drill.status === 'done' && engine && (
        <SessionSummary
          verdicts={drill.verdicts}
          pointsDrained={settings.prayerLevel - engine.points}
          baselineDrain={continuousDrain(target, drill.verdicts.length, { prayerBonus: settings.prayerBonus, config: settings.engine })}
        />
      )}
    </section>
  );
}
