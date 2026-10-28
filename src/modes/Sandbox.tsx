// Freeplay sandbox and drain calculator (PRD §5.6), plus simulated stopwatch tests (§4.5).

import { useMemo, useState } from 'react';
import { useDrill } from '../ui/useDrill';
import { PrayerEngine } from '../engine/engine';
import { TICK_MS, drainResistance, secondsPerPoint, type EngineConfig } from '../engine/config';
import { PRAYERS, PRAYER_BY_ID, conflicts, type PrayerId } from '../data/prayers';
import { PrayerBook, Stat, TickBar } from '../ui/components';
import { useSettings } from '../settings/settings';

function fmtSpp(s: number) {
  return Number.isFinite(s) ? `${s.toFixed(2)}s` : '∞';
}

function DrainReadout({ prayers, bonus }: { prayers: Iterable<PrayerId>; bonus: number }) {
  const total = [...prayers].reduce((sum, id) => sum + PRAYER_BY_ID[id].drain, 0);
  const spp = secondsPerPoint(total, bonus);
  return (
    <div className="stat-row">
      <Stat label="Total drain effect" value={total} />
      <Stat label="Drain resistance" value={drainResistance(bonus)} sub={`60 + 2 × ${bonus}`} />
      <Stat label="Seconds per point" value={fmtSpp(spp)} />
      <Stat label="Points per minute" value={Number.isFinite(spp) ? (60 / spp).toFixed(1) : '0'} />
    </div>
  );
}

export function Sandbox() {
  const { settings } = useSettings();
  return (
    <section className="drill">
      <header className="drill-head">
        <h2>Sandbox</h2>
        <p className="muted">Turn on any prayers and watch them drain in real time, or use the calculator to compare stacks.</p>
      </header>
      <LiveSandbox />
      <Calculator defaultBonus={settings.prayerBonus} />
      <StopwatchTests bonus={settings.prayerBonus} config={settings.engine} />
    </section>
  );
}

function LiveSandbox() {
  const { settings } = useSettings();
  const drill = useDrill({
    quickPrayers: [],
    durationTicks: 0,
    audio: false,
    scoreFromFirstInput: false,
    countInTicks: 0,
    classify: () => null,
  });
  const running = drill.status === 'running';
  const engine = drill.engine;
  const pending = engine?.pending ?? new Set<PrayerId>();
  const lastDrain = engine?.history.slice(-1)[0];
  const elapsed = engine ? (engine.currentTick * TICK_MS) / 1000 : 0;

  return (
    <div className="card">
      <h3>Live drain</h3>
      <div className="actions">
        {running ? <button onClick={drill.stop}>Stop</button> : <button className="primary" onClick={drill.start}>{drill.status === 'done' ? 'Restart' : 'Start'}</button>}
        <span className="muted small">Bonus +{settings.prayerBonus} · starting points {settings.prayerLevel} (change in Settings)</span>
      </div>
      {running && <TickBar clock={drill.clock} engine={engine} />}
      <div className="sandbox-grid">
        <PrayerBook
          active={pending}
          level={settings.prayerLevel}
          onToggle={(id, e) => drill.input({ kind: 'toggle', prayer: id }, e.timeStamp)}
        />
        <div>
          <DrainReadout prayers={pending} bonus={settings.prayerBonus} />
          <div className="stat-row">
            <Stat label="Prayer points" value={engine?.points ?? settings.prayerLevel} />
            <Stat label="Drain counter" value={engine ? `${engine.counter}/${engine.resistance}` : '–'} sub="points lost when it exceeds resistance" />
            <Stat label="Elapsed" value={`${elapsed.toFixed(1)}s`} />
            <Stat label="Last tick" value={lastDrain ? `+${lastDrain.drainEffect}` : '–'} sub={lastDrain?.free.length ? `free: ${lastDrain.free.map((id) => PRAYER_BY_ID[id].name).join(', ')}` : undefined} />
          </div>
          {!running && <p className="muted small">Press Start, then click prayers. Toggling a prayer on is free for the tick it's activated.</p>}
        </div>
      </div>
    </div>
  );
}

function Calculator({ defaultBonus }: { defaultBonus: number }) {
  const [selected, setSelected] = useState<PrayerId[]>(['protectFromMelee', 'piety']);
  const [bonus, setBonus] = useState(defaultBonus);
  const toggle = (id: PrayerId) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s.filter((x) => !conflicts(id, x)), id]));
  return (
    <div className="card">
      <h3>Drain calculator</h3>
      <label>Prayer bonus <input type="number" value={bonus} min={-30} max={100} onChange={(e) => setBonus(Number(e.target.value) || 0)} /></label>
      <div className="chips">
        {PRAYERS.map((p) => (
          <button key={p.id} type="button" className={`chip ${selected.includes(p.id) ? 'on' : ''}`} aria-pressed={selected.includes(p.id)} onClick={() => toggle(p.id)}>
            {p.name} <span className="muted">{p.drain}</span>
          </button>
        ))}
      </div>
      <DrainReadout prayers={selected} bonus={bonus} />
      <p className="muted small">seconds per point = 0.6 × (60 + 2 × bonus) ÷ total drain effect. Conflicting prayers are swapped out, as in game.</p>
    </div>
  );
}

/** Runs the §4.5 stopwatch tests through the engine under both values of the flag being tested. */
function StopwatchTests({ bonus, config }: { bonus: number; config: EngineConfig }) {
  const results = useMemo(() => {
    const test1 = (reset: boolean) => {
      const eng = new PrayerEngine({ config: { ...config, resetDrainCounterOnAllOff: reset }, prayerBonus: bonus });
      for (let c = 0; c < 12; c++) {
        eng.input({ kind: 'toggle', prayer: 'thickSkin' }, c * 50 * TICK_MS + 10);
        eng.input({ kind: 'toggle', prayer: 'thickSkin' }, c * 50 * TICK_MS + 33 * TICK_MS + 10);
      }
      eng.advanceTo(600 * TICK_MS);
      return 99 - eng.points;
    };
    const test2 = (free: boolean) => {
      const eng = new PrayerEngine({ config: { ...config, activationTickIsFree: free }, prayerBonus: bonus, quickPrayers: ['piety'] });
      eng.input({ kind: 'quick' }, 50);
      for (let k = 1; k < 100; k++) {
        eng.input({ kind: 'quick' }, k * TICK_MS + 100);
        eng.input({ kind: 'quick' }, k * TICK_MS + 250);
      }
      eng.advanceTo(100 * TICK_MS);
      return 99 - eng.points;
    };
    return { t1: [test1(false), test1(true)], t2: [test2(true), test2(false)] };
  }, [bonus, config]);

  return (
    <div className="card">
      <h3>Stopwatch tests (simulated)</h3>
      <p className="muted small">Compare these with what you see in game at prayer bonus +{bonus}. See the PRD's test plan for how to run them.</p>
      <table className="table">
        <thead><tr><th>Test</th><th>Setup</th><th>If flag is default</th><th>If flag is flipped</th></tr></thead>
        <tbody>
          <tr>
            <td>1 · drain counter persists</td>
            <td>Thick Skin, 20s on / 10s off for 6 minutes</td>
            <td>reset=false: lose {results.t1[0]}</td>
            <td>reset=true: lose {results.t1[1]}</td>
          </tr>
          <tr>
            <td>2 · activation tick is free</td>
            <td>Piety, 1-tick flicked for 60s</td>
            <td>free=true: lose {results.t2[0]}</td>
            <td>free=false: lose {results.t2[1]}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
