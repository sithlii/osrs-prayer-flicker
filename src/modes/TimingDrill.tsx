// Lazy flicking (PRD §5.3) and offensive flicking (§5.4): the prayer must be on at the start of
// specific ticks and off otherwise.

import { useRef, useState } from 'react';
import { useDrill, useKeyActions } from '../ui/useDrill';
import { continuousDrain, type TickResult } from '../engine/engine';
import type { TickVerdict } from '../engine/scoring';
import { buildSchedule, type AttackEvent, type PlayerAttack } from '../engine/schedule';
import { LAZY_PRESETS, OFFENSIVE_PRESETS, PROTECT_FOR, STYLE_LABEL, type Encounter } from '../data/encounters';
import { PRAYER_BY_ID, type PrayerId } from '../data/prayers';
import { Orb, PrayerIcon, Segmented, Stat, TickBar, Timeline, fmtPct } from '../ui/components';
import { SessionSummary } from '../feedback/SessionSummary';
import { personalBest, useHistory } from '../feedback/history';
import { useSettings } from '../settings/settings';

const COUNT_IN = 5;

export interface Outcomes {
  blocked: number;
  taken: number;
  boosted: number;
  unboosted: number;
  wasted: number;
  attackResult: Map<AttackEvent, boolean>;
  playerResult: Map<PlayerAttack, boolean>;
}

const newOutcomes = (): Outcomes => ({
  blocked: 0, taken: 0, boosted: 0, unboosted: 0, wasted: 0, attackResult: new Map(), playerResult: new Map(),
});

/** Prayers the encounter can ever require. */
export function encounterPrayers(enc: Encounter): PrayerId[] {
  const ids = new Set<PrayerId>();
  for (const a of enc.attackers) for (const s of a.styles) ids.add(PROTECT_FOR[s]);
  if (enc.weapon) ids.add(enc.weapon.prayer);
  return [...ids];
}

export function damageFor(a: AttackEvent, max = 20): number {
  return 5 + ((a.animTick * 7919 + a.attacker * 104729) % (max - 4));
}

export function TimingDrill({ kind }: { kind: 'lazy' | 'offensive' }) {
  const presets = kind === 'lazy' ? LAZY_PRESETS : OFFENSIVE_PRESETS;
  const { settings } = useSettings();
  const { history, add } = useHistory();
  const [presetId, setPresetId] = useState(presets[0].id);
  const [duration, setDuration] = useState(100);
  const [assist, setAssist] = useState(true);
  const [audio, setAudio] = useState(true);
  const enc = presets.find((p) => p.id === presetId)!;
  const prayers = encounterPrayers(enc);
  const schedule = useRef(buildSchedule(enc, COUNT_IN + 1, COUNT_IN + 1 + duration, 1));
  const outcomes = useRef<Outcomes>(newOutcomes());

  const needAt = (tick: number): PrayerId[] => {
    const ids = new Set<PrayerId>();
    for (const a of schedule.current.attacks) if (a.checkTick === tick) ids.add(PROTECT_FOR[a.style]);
    if (enc.weapon && schedule.current.playerAttacks.some((p) => p.animTick === tick)) ids.add(enc.weapon.prayer);
    return [...ids];
  };

  const classify = (res: TickResult): TickVerdict => {
    const need = needAt(res.tick);
    const clicks = res.inputs;
    const offsets = clicks.map((c) => c.offset);
    const base = { tick: res.tick, clicks, offsets, pointsLost: res.pointsLost };
    if (need.length) return { ...base, status: need.every((id) => res.active.includes(id)) ? 'correct' : 'off' };
    const on = prayers.some((id) => res.active.includes(id));
    if (on) outcomes.current.wasted++;
    return { ...base, status: on ? 'drained' : 'idle' };
  };

  const onBoundary = (res: TickResult) => {
    const o = outcomes.current;
    for (const a of schedule.current.attacks) {
      if (a.checkTick !== res.tick) continue;
      const ok = res.active.includes(PROTECT_FOR[a.style]);
      o.attackResult.set(a, ok);
      if (ok) o.blocked++;
      else o.taken++;
    }
    if (enc.weapon) {
      for (const p of schedule.current.playerAttacks) {
        if (p.animTick !== res.tick) continue;
        const ok = res.active.includes(enc.weapon.prayer);
        o.playerResult.set(p, ok);
        if (ok) o.boosted++;
        else o.unboosted++;
      }
    }
  };

  const drill = useDrill({
    quickPrayers: prayers,
    durationTicks: duration,
    audio,
    scoreFromFirstInput: false,
    countInTicks: COUNT_IN,
    classify,
    onBoundary,
    onFinish: (verdicts, engine) => {
      const o = outcomes.current;
      const total = o.blocked + o.taken + o.boosted + o.unboosted;
      if (total === 0) return;
      add({
        mode: kind,
        variant: enc.name,
        ticks: verdicts.length,
        accuracy: (o.blocked + o.boosted) / total,
        longestStreak: streakOfSuccesses(verdicts),
        pointsDrained: settings.prayerLevel - engine.points,
        baselineDrain: continuousDrain(prayers, verdicts.length, { prayerBonus: settings.prayerBonus, config: settings.engine }),
        stats: { blocked: o.blocked, taken: o.taken, boosted: o.boosted, unboosted: o.unboosted, wasted: o.wasted },
      });
    },
  });

  const start = () => {
    schedule.current = buildSchedule(enc, COUNT_IN + 1, COUNT_IN + 1 + duration, (Date.now() & 0xffff) + 1);
    outcomes.current = newOutcomes();
    drill.start();
  };

  const running = drill.status === 'running';
  useKeyActions((action, e) => {
    if (action === 'quickPrayer') drill.input({ kind: 'quick' }, e.timeStamp);
    else if (action.startsWith('prayer:')) drill.input({ kind: 'toggle', prayer: action.slice(7) as PrayerId }, e.timeStamp);
  }, running);

  const engine = drill.engine;
  const pending = engine?.pending ?? new Set<PrayerId>();
  const cur = engine?.currentTick ?? 0;
  const o = outcomes.current;
  const pb = personalBest(history, kind, enc.name);

  return (
    <section className="drill">
      <header className="drill-head">
        <h2>{kind === 'lazy' ? 'Lazy flicking' : 'Offensive flicking'}</h2>
        <p className="muted">
          {kind === 'lazy'
            ? 'Have the protection prayer on at the start of the tick the attack is checked, and off otherwise. React to the attack animation, not the hitsplat.'
            : 'Have your offensive prayer on at the start of the tick your attack animation begins, and off otherwise. A boosted attack shows the prayer icon with the XP drop.'}
        </p>
      </header>

      <div className="controls">
        <label>
          Preset
          <select value={presetId} disabled={running} onChange={(e) => setPresetId(e.target.value)}>
            {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <div className="field" role="group" aria-label="Length"><span>Length</span> <Segmented value={duration} disabled={running} onChange={setDuration} options={[{ value: 50, label: '30s' }, { value: 100, label: '60s' }, { value: 200, label: '2 min' }]} /></div>
        <label className="check"><input type="checkbox" checked={assist} onChange={(e) => setAssist(e.target.checked)} /> Show attack timers</label>
        <label className="check"><input type="checkbox" checked={audio} disabled={running} onChange={(e) => setAudio(e.target.checked)} /> Metronome audio</label>
      </div>
      <p className="muted small">
        {enc.description}
        {enc.approximate && ' Check delays for boss-style presets are approximations.'}
      </p>

      <div className="drill-stage">
        <div className="drill-main">
          {running ? <TickBar clock={drill.clock} engine={engine} /> : <div className="tickbar tickbar-hidden">Press Start. The encounter begins after a {COUNT_IN}-tick count-in.</div>}

          <div className="arena">
            {enc.attackers.map((a, i) => (
              <Combatant
                key={i}
                name={a.name}
                attacks={schedule.current.attacks.filter((x) => x.attacker === i)}
                results={o.attackResult}
                cur={running || drill.status === 'done' ? cur : -1}
                assist={assist}
              />
            ))}
            {enc.weapon && (
              <PlayerCombatant
                weapon={enc.weapon.name}
                prayer={enc.weapon.prayer}
                attacks={schedule.current.playerAttacks}
                results={o.playerResult}
                cur={running || drill.status === 'done' ? cur : -1}
                assist={assist}
              />
            )}
          </div>
          {running && cur <= COUNT_IN && <div className="countin">Get ready… {COUNT_IN + 1 - cur}</div>}

          <div className="input-zone">
            <Orb
              points={engine?.points ?? settings.prayerLevel}
              max={settings.prayerLevel}
              active={prayers.some((id) => pending.has(id))}
              disabled={!running}
              onPress={(e) => drill.input({ kind: 'quick' }, e.timeStamp)}
            />
            <div className="prayer-row">
              {prayers.map((id) => (
                <PrayerIcon key={id} id={id} active={pending.has(id)} onPress={(e) => drill.input({ kind: 'toggle', prayer: id }, e.timeStamp)} />
              ))}
            </div>
          </div>
          <p className="muted small">Quick-prayers are set to: {prayers.map((id) => PRAYER_BY_ID[id].name).join(' + ')}.</p>

          <div className="actions">
            {running ? <button onClick={drill.stop}>Stop</button> : <button className="primary" onClick={start}>{drill.status === 'done' ? 'Restart' : 'Start'}</button>}
          </div>
          <Timeline verdicts={drill.verdicts} />
        </div>

        <aside className="drill-stats">
          {enc.attackers.length > 0 && <Stat label="Hits blocked" value={`${o.blocked}/${o.blocked + o.taken}`} />}
          {enc.weapon && <Stat label="Attacks boosted" value={`${o.boosted}/${o.boosted + o.unboosted}`} />}
          <Stat label="Wasted ticks" value={o.wasted} sub="prayer on when not needed" />
          <Stat label="Prayer points" value={engine?.points ?? settings.prayerLevel} />
          {pb && <Stat label="Personal best" value={fmtPct(pb.accuracy)} />}
        </aside>
      </div>

      {drill.status === 'done' && engine && (
        <SessionSummary
          verdicts={drill.verdicts}
          showTiming={false}
          pointsDrained={settings.prayerLevel - engine.points}
          baselineDrain={continuousDrain(prayers, drill.verdicts.length, { prayerBonus: settings.prayerBonus, config: settings.engine })}
        >
          {enc.attackers.length > 0 && <Stat label="Hits blocked" value={`${o.blocked}/${o.blocked + o.taken}`} sub={fmtPct(o.blocked / Math.max(1, o.blocked + o.taken))} />}
          {enc.weapon && <Stat label="Attacks boosted" value={`${o.boosted}/${o.boosted + o.unboosted}`} sub={fmtPct(o.boosted / Math.max(1, o.boosted + o.unboosted))} />}
          <Stat label="Wasted ticks" value={o.wasted} />
        </SessionSummary>
      )}
    </section>
  );
}

function streakOfSuccesses(verdicts: TickVerdict[]): number {
  let best = 0;
  let cur = 0;
  for (const v of verdicts) {
    if (v.status === 'correct') best = Math.max(best, ++cur);
    else if (v.status === 'off') cur = 0;
  }
  return best;
}

export function Combatant({
  name, attacks, results, cur, assist, maxHit = 20,
}: { name: string; attacks: AttackEvent[]; results: Map<AttackEvent, boolean>; cur: number; assist: boolean; maxHit?: number }) {
  const anim = attacks.find((a) => a.animTick === cur);
  const inFlight = attacks.find((a) => a.animTick < cur && cur < a.checkTick);
  const hit = attacks.find((a) => cur >= a.hitTick && cur < a.hitTick + 2 && results.has(a));
  const next = attacks.find((a) => a.animTick > cur);
  const style = anim?.style ?? inFlight?.style;
  return (
    <div className={`combatant ${anim ? `attacking style-${anim.style}` : ''}`}>
      <div className="combatant-name">{name}</div>
      <div className={`combatant-body ${style ? `style-${style}` : ''}`}>
        <svg viewBox="0 0 64 64" aria-hidden>
          <path d="M14 54 L18 28 Q32 8 46 28 L50 54 Z" className="beast" />
          <circle cx="26" cy="30" r="3" className="beast-eye" />
          <circle cx="38" cy="30" r="3" className="beast-eye" />
        </svg>
        {anim && <span className="telegraph">{STYLE_LABEL[anim.style]}!</span>}
        {inFlight && <span className="projectile">{STYLE_LABEL[inFlight.style]} incoming · lands in {inFlight.checkTick - cur}</span>}
        {hit && (
          <span className={`hitsplat ${results.get(hit) ? 'hitsplat-block' : 'hitsplat-hit'}`}>
            {results.get(hit) ? 0 : damageFor(hit, maxHit)}
          </span>
        )}
      </div>
      {assist && next && cur >= 0 && (
        <div className="attack-timer" title="Ticks until the next attack animation">
          {Array.from({ length: Math.min(8, next.animTick - cur) }, (_, i) => <span key={i} className="pip" />)}
          <span className="muted small"> next in {next.animTick - cur}</span>
        </div>
      )}
    </div>
  );
}

function PlayerCombatant({
  weapon, prayer, attacks, results, cur, assist,
}: { weapon: string; prayer: PrayerId; attacks: PlayerAttack[]; results: Map<PlayerAttack, boolean>; cur: number; assist: boolean }) {
  const swing = attacks.find((a) => a.animTick === cur);
  const recent = attacks.find((a) => cur >= a.animTick && cur < a.animTick + 2 && results.has(a));
  const next = attacks.find((a) => a.animTick > cur);
  return (
    <div className={`combatant player ${swing ? 'attacking' : ''}`}>
      <div className="combatant-name">You · {weapon}</div>
      <div className="combatant-body">
        <svg viewBox="0 0 64 64" aria-hidden>
          <circle cx="32" cy="18" r="8" className="beast" />
          <path d="M20 56 L24 30 L40 30 L44 56 Z" className="beast" />
          <path d={swing ? 'M42 34 L58 14' : 'M42 34 L50 50'} className="weapon" />
        </svg>
        {recent && (
          <span className={`xpdrop ${results.get(recent) ? 'xpdrop-boosted' : ''}`}>
            {results.get(recent) && <PrayerIcon id={prayer} active size="sm" />} +{results.get(recent) ? 52 : 40} xp
          </span>
        )}
      </div>
      {assist && next && cur >= 0 && (
        <div className="attack-timer">
          {Array.from({ length: Math.min(8, next.animTick - cur) }, (_, i) => <span key={i} className="pip pip-player" />)}
          <span className="muted small"> next swing in {next.animTick - cur}</span>
        </div>
      )}
    </div>
  );
}
