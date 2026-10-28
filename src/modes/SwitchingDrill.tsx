// Prayer switching in an OSRS-style interface (PRD §5.5). Original CSS/SVG art, no Jagex assets.

import { useRef, useState } from 'react';
import { useDrill, useKeyActions } from '../ui/useDrill';
import { continuousDrain, type PrayerEngine, type TickResult } from '../engine/engine';
import type { TickVerdict } from '../engine/scoring';
import { buildSchedule, type AttackEvent } from '../engine/schedule';
import { PROTECT_FOR, STYLE_LABEL, SWITCHING_PRESETS, type Style } from '../data/encounters';
import type { PrayerId } from '../data/prayers';
import { KeyHint, Orb, PrayerBook, Segmented, Stat, Timeline, fmtPct } from '../ui/components';
import { SessionSummary } from '../feedback/SessionSummary';
import { mean } from '../feedback/summary';
import { personalBest, useHistory } from '../feedback/history';
import { TABS, potionRestore, useSettings, type TabId } from '../settings/settings';
import { TICK_MS } from '../engine/config';
import { Combatant, damageFor, encounterPrayers } from './TimingDrill';

const COUNT_IN = 5;
const MAX_HP = 99;

interface State {
  hp: number;
  blocked: number;
  taken: number;
  reactions: number[];
  tabSwitches: number;
  wastedTabSwitches: number;
  prayerClicks: number;
  results: Map<AttackEvent, boolean>;
  doses: number[];
  restored: number;
}

const newState = (): State => ({
  hp: MAX_HP, blocked: 0, taken: 0, reactions: [], tabSwitches: 0, wastedTabSwitches: 0, prayerClicks: 0,
  results: new Map(), doses: [4, 4, 4, 4], restored: 0,
});

export function SwitchingDrill() {
  const { settings } = useSettings();
  const { history, add } = useHistory();
  const [presetId, setPresetId] = useState(SWITCHING_PRESETS[0].id);
  const [duration, setDuration] = useState(100);
  const [audio, setAudio] = useState(false);
  const [assist, setAssist] = useState(false);
  const [tab, setTab] = useState<TabId>('inventory');
  const tabRef = useRef<TabId>('inventory');
  const enc = SWITCHING_PRESETS.find((p) => p.id === presetId)!;
  const prayers = encounterPrayers(enc);
  const maxHit = enc.id === 'crowd' ? 8 : 25;
  const schedule = useRef(buildSchedule(enc, COUNT_IN + 1, COUNT_IN + 1 + duration, 1));
  const st = useRef<State>(newState());

  const onBoundary = (res: TickResult, engine: PrayerEngine) => {
    const s = st.current;
    for (const a of schedule.current.attacks) {
      if (a.checkTick !== res.tick) continue;
      const need = PROTECT_FOR[a.style];
      const ok = res.active.includes(need);
      s.results.set(a, ok);
      if (ok) s.blocked++;
      else {
        s.taken++;
        s.hp = Math.max(0, s.hp - damageFor(a, maxHit));
      }
      // Reaction: first input in [animation, check) that toggled the needed prayer on.
      if (ok && a.checkTick > a.animTick) {
        const animT = a.animTick * TICK_MS;
        const rec = engine.inputs.find(
          (r) => r.effectiveT >= animT && r.tick < a.checkTick && r.action.kind === 'toggle' && r.action.prayer === need,
        );
        if (rec) s.reactions.push(rec.effectiveT - animT);
      }
    }
  };

  const classify = (res: TickResult): TickVerdict => {
    const checks = schedule.current.attacks.filter((a) => a.checkTick === res.tick);
    const offsets = res.inputs.map((c) => c.offset);
    const base = { tick: res.tick, clicks: res.inputs, offsets, pointsLost: res.pointsLost };
    if (checks.length) {
      const ok = checks.every((a) => res.active.includes(PROTECT_FOR[a.style]));
      return { ...base, status: ok ? 'correct' : 'off' };
    }
    // Holding a protection prayer between attacks is normal here; only the crowd drill,
    // where 1-tick flicking is the point, flags drain between checks.
    return { ...base, status: enc.id === 'crowd' && res.drainEffect > 0 ? 'drained' : 'idle' };
  };

  const drill = useDrill({
    quickPrayers: prayers.slice(0, 1),
    durationTicks: duration,
    audio,
    scoreFromFirstInput: false,
    countInTicks: COUNT_IN,
    classify,
    onBoundary,
    shouldStop: () => st.current.hp <= 0,
    onFinish: (verdicts, engine) => {
      const s = st.current;
      const total = s.blocked + s.taken;
      if (total === 0) return;
      add({
        mode: 'switching',
        variant: enc.name,
        ticks: verdicts.length,
        accuracy: s.blocked / total,
        longestStreak: attackStreak(schedule.current.attacks, s.results),
        pointsDrained: settings.prayerLevel - engine.points + s.restored,
        baselineDrain: continuousDrain(prayers.slice(0, 1), verdicts.length, { prayerBonus: settings.prayerBonus, config: settings.engine }),
        stats: {
          meanReactionMs: mean(s.reactions),
          tabSwitches: s.tabSwitches,
          wastedTabSwitches: s.wastedTabSwitches,
          prayerClicks: s.prayerClicks,
          hpLeft: s.hp,
        },
      });
    },
  });

  const start = () => {
    schedule.current = buildSchedule(enc, COUNT_IN + 1, COUNT_IN + 1 + duration, (Date.now() & 0xffff) + 1);
    st.current = newState();
    tabRef.current = 'inventory';
    setTab('inventory');
    drill.start();
  };

  const running = drill.status === 'running';
  const switchTab = (id: TabId) => {
    if (running) {
      st.current.tabSwitches++;
      if (id === tabRef.current || (id !== 'prayer' && id !== 'inventory')) st.current.wastedTabSwitches++;
    }
    tabRef.current = id;
    setTab(id);
  };
  const togglePrayer = (id: PrayerId, timeStamp: number) => {
    if (drill.input({ kind: 'toggle', prayer: id }, timeStamp)) st.current.prayerClicks++;
  };
  const drink = (slot: number) => {
    const s = st.current;
    if (!running || !drill.engine || s.doses[slot] <= 0) return;
    s.doses = s.doses.map((d, i) => (i === slot ? d - 1 : d));
    const before = drill.engine.points;
    drill.engine.restore(potionRestore(settings.prayerLevel), settings.prayerLevel);
    s.restored += drill.engine.points - before;
    setTab((t) => t); // re-render
  };

  useKeyActions((action, e) => {
    if (action.startsWith('tab:')) switchTab(action.slice(4) as TabId);
    else if (action === 'quickPrayer') drill.input({ kind: 'quick' }, e.timeStamp);
    else if (action.startsWith('prayer:')) togglePrayer(action.slice(7) as PrayerId, e.timeStamp);
  }, running);

  const engine = drill.engine;
  const pending = engine?.pending ?? new Set<PrayerId>();
  const cur = running || drill.status === 'done' ? engine?.currentTick ?? 0 : -1;
  const s = st.current;
  const pb = personalBest(history, 'switching', enc.name);
  const nextCheck = schedule.current.attacks.find((a) => a.animTick <= cur && a.checkTick > cur);

  return (
    <section className="drill">
      <header className="drill-head">
        <h2>Prayer switching</h2>
        <p className="muted">
          Read the telegraph (colour and label) and switch to the matching protection prayer before the attack is checked.
          You start on the inventory tab: switch tabs with your F-key binds. Drink prayer potions from the inventory when points run low.
        </p>
      </header>

      <div className="controls">
        <label>
          Preset
          <select value={presetId} disabled={running} onChange={(e) => setPresetId(e.target.value)}>
            {SWITCHING_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <div className="field" role="group" aria-label="Length"><span>Length</span> <Segmented value={duration} disabled={running} onChange={setDuration} options={[{ value: 100, label: '60s' }, { value: 200, label: '2 min' }, { value: 500, label: '5 min' }]} /></div>
        <label className="check"><input type="checkbox" checked={assist} onChange={(e) => setAssist(e.target.checked)} /> Show attack timers</label>
        <label className="check"><input type="checkbox" checked={audio} disabled={running} onChange={(e) => setAudio(e.target.checked)} /> Metronome audio</label>
      </div>
      <p className="muted small">{enc.description}{enc.approximate && ' Check delays are approximations.'}</p>

      <div className="osrs">
        <div className="osrs-game">
          <div className="osrs-orbs">
            <div className="hp-orb" aria-label="Hitpoints"><span className="hp-fill" style={{ height: `${(s.hp / MAX_HP) * 100}%` }} /><span className="orb-points">{s.hp}</span></div>
            <Orb
              points={engine?.points ?? settings.prayerLevel}
              max={settings.prayerLevel}
              active={pending.size > 0}
              disabled={!running}
              onPress={(e) => drill.input({ kind: 'quick' }, e.timeStamp)}
            />
          </div>
          <div className="arena arena-osrs">
            {enc.attackers.map((a, i) => (
              <Combatant key={i} name={a.name} attacks={schedule.current.attacks.filter((x) => x.attacker === i)} results={s.results} cur={cur} assist={assist} maxHit={maxHit} />
            ))}
          </div>
          {running && cur <= COUNT_IN && <div className="countin">Get ready… {COUNT_IN + 1 - cur}</div>}
          {running && nextCheck && cur > COUNT_IN && (
            <div className={`incoming style-${nextCheck.style}`}>Pray {STYLE_LABEL[nextCheck.style]} · checked in {nextCheck.checkTick - cur}</div>
          )}
          <div className="overheads">
            {(Object.entries(PROTECT_FOR) as [Style, PrayerId][]).filter(([, id]) => pending.has(id)).map(([style]) => (
              <span key={style} className={`overhead-icon style-${style}`}>Protect: {STYLE_LABEL[style]}</span>
            ))}
          </div>
        </div>

        <div className="osrs-panel">
          <div className="osrs-tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onPointerDown={() => switchTab(t.id)}>
                {t.label.slice(0, 4)}
                <KeyHint action={`tab:${t.id}`} />
              </button>
            ))}
          </div>
          <div className="osrs-content">
            {tab === 'prayer' && (
              <PrayerBook active={pending} level={settings.prayerLevel} onToggle={(id, e) => togglePrayer(id, e.timeStamp)} />
            )}
            {tab === 'inventory' && (
              <div className="inventory">
                {Array.from({ length: 28 }, (_, i) => {
                  const dose = i < 4 ? s.doses[i] : 0;
                  return (
                    <button key={i} className="inv-slot" disabled={dose === 0} onPointerDown={() => drink(i)} title={dose ? `Prayer potion (${dose}) · restores ${potionRestore(settings.prayerLevel)}` : 'Empty'}>
                      {i < 4 && dose > 0 && <span className="potion"><span className="potion-liquid" style={{ height: `${dose * 25}%` }} />{dose}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {tab === 'combat' && <div className="osrs-placeholder">Combat options<br /><span className="small">Accurate · Aggressive · Defensive</span></div>}
            {tab === 'equipment' && <div className="osrs-placeholder">Worn equipment<br /><span className="small">Prayer bonus +{settings.prayerBonus}</span></div>}
            {tab === 'magic' && <div className="osrs-placeholder">Spellbook</div>}
          </div>
        </div>
      </div>

      <div className="actions">
        {running ? <button onClick={drill.stop}>Stop</button> : <button className="primary" onClick={start}>{drill.status === 'done' ? 'Restart' : 'Start'}</button>}
      </div>

      <div className="drill-stage">
        <div className="drill-main"><Timeline verdicts={drill.verdicts} /></div>
        <aside className="drill-stats">
          <Stat label="Hits blocked" value={`${s.blocked}/${s.blocked + s.taken}`} />
          <Stat label="Mean reaction" value={s.reactions.length ? `${Math.round(mean(s.reactions))}ms` : '–'} sub="telegraph → correct prayer" />
          <Stat label="Tab switches" value={s.tabSwitches} sub={`${s.wastedTabSwitches} unnecessary`} />
          {pb && <Stat label="Personal best" value={fmtPct(pb.accuracy)} />}
        </aside>
      </div>

      {drill.status === 'done' && engine && (
        <SessionSummary
          verdicts={drill.verdicts}
          showTiming={false}
          pointsDrained={settings.prayerLevel - engine.points + s.restored}
          baselineDrain={continuousDrain(prayers.slice(0, 1), drill.verdicts.length, { prayerBonus: settings.prayerBonus, config: settings.engine })}
        >
          <Stat label="Hits blocked" value={`${s.blocked}/${s.blocked + s.taken}`} sub={fmtPct(s.blocked / Math.max(1, s.blocked + s.taken))} />
          <Stat label="Mean reaction" value={s.reactions.length ? `${Math.round(mean(s.reactions))}ms` : '–'} />
          <Stat label="Prayer clicks" value={s.prayerClicks} />
          <Stat label="Unnecessary tab switches" value={s.wastedTabSwitches} />
          <Stat label="HP left" value={s.hp} sub={s.hp <= 0 ? 'You died' : undefined} />
        </SessionSummary>
      )}
    </section>
  );
}

function attackStreak(attacks: AttackEvent[], results: Map<AttackEvent, boolean>): number {
  let best = 0;
  let cur = 0;
  for (const a of attacks) {
    if (!results.has(a)) continue;
    cur = results.get(a) ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}
