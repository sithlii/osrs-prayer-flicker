// Shared drill runtime: owns the engine, clock, metronome and boundary loop for every mode.

import { useCallback, useEffect, useRef, useState } from 'react';
import { PrayerEngine, type Action, type InputRecord, type TickResult } from '../engine/engine';
import { SessionClock, runLoop } from '../engine/clock';
import type { TickVerdict } from '../engine/scoring';
import type { PrayerId } from '../data/prayers';
import { Metronome } from './metronome';
import { useSettings, type ActionId } from '../settings/settings';

/** Boundaries are processed this long after they pass, so input events stamped just before
 * a boundary but delivered just after it still land in the right window. */
const GRACE_MS = 40;

export type DrillStatus = 'idle' | 'running' | 'done';

export interface DrillOptions {
  quickPrayers: PrayerId[];
  /** Number of scored ticks; 0 = until stopped. */
  durationTicks: number;
  audio: boolean;
  /** Start scoring at the first player input (1-tick drills) instead of at `countInTicks`. */
  scoreFromFirstInput: boolean;
  countInTicks: number;
  classify: (res: TickResult, engine: PrayerEngine) => TickVerdict | null;
  onBoundary?: (res: TickResult, engine: PrayerEngine) => void;
  onFinish?: (verdicts: TickVerdict[], engine: PrayerEngine) => void;
  /** Extra end condition, e.g. the player died. */
  shouldStop?: () => boolean;
}

export function useDrill(opts: DrillOptions) {
  const { settings } = useSettings();
  const [status, setStatus] = useState<DrillStatus>('idle');
  const [verdicts, setVerdicts] = useState<TickVerdict[]>([]);
  const [, setVersion] = useState(0);
  const engineRef = useRef<PrayerEngine | null>(null);
  const clockRef = useRef<SessionClock | null>(null);
  const scoreStart = useRef<number | null>(null);
  const stopLoop = useRef<() => void>(() => {});
  const metronome = useRef<Metronome | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const verdictsRef = useRef<TickVerdict[]>([]);
  /** Bumped on every start/stop so a pending begin() from an earlier run is dropped. */
  const runId = useRef(0);

  const finish = useCallback(() => {
    runId.current++;
    stopLoop.current();
    metronome.current?.stop();
    metronome.current = null;
    setStatus('done');
    if (engineRef.current) optsRef.current.onFinish?.(verdictsRef.current, engineRef.current);
  }, []);

  const start = useCallback(() => {
    const run = ++runId.current;
    engineRef.current = null;
    clockRef.current = null;
    verdictsRef.current = [];
    setVerdicts([]);
    setStatus('running');
    // Drop focus from the Start button so the quick-prayer key (Space by default) can't press it.
    (document.activeElement as HTMLElement | null)?.blur?.();
    // Let React commit the "running" view first: the first render of a drill can be slow,
    // and that cost must land before tick 0, not inside it.
    setTimeout(() => {
      if (run !== runId.current) return;
      begin();
    }, 0);
  }, [settings, finish]);

  const begin = () => {
    const o = optsRef.current;
    const engine = new PrayerEngine({
      config: settings.engine,
      prayerBonus: settings.prayerBonus,
      prayerPoints: settings.prayerLevel,
      quickPrayers: o.quickPrayers,
      latencyMs: settings.latencyMs,
    });
    // Audio setup can be slow on first use, so do it before the clock exists.
    metronome.current = o.audio
      ? new Metronome({ volume: settings.metronomeVolume, pitch: settings.metronomePitch, sound: settings.metronomeSound })
      : null;
    // Start a little in the future so the first beat isn't clipped.
    const clock = new SessionClock(performance.now() + 150);
    engineRef.current = engine;
    clockRef.current = clock;
    // Exposed in dev builds so automated tests can schedule inputs against the real clock.
    if (import.meta.env.DEV) (window as unknown as { __pftDrill: unknown }).__pftDrill = { engine, clock };
    scoreStart.current = o.scoreFromFirstInput ? null : o.countInTicks;
    setVersion((x) => x + 1);

    metronome.current?.start(clock.origin);

    stopLoop.current = runLoop(() => {
      const results = engine.advanceTo(clock.now() - GRACE_MS);
      if (results.length === 0) return;
      const cur = optsRef.current;
      let changed = false;
      for (const res of results) {
        cur.onBoundary?.(res, engine);
        if (scoreStart.current === null || res.tick <= scoreStart.current) continue;
        const v = cur.classify(res, engine);
        if (v) {
          verdictsRef.current = [...verdictsRef.current, v];
          changed = true;
        }
      }
      if (changed) setVerdicts(verdictsRef.current);
      setVersion((x) => x + 1);
      const scored = verdictsRef.current.length;
      if ((cur.durationTicks > 0 && scored >= cur.durationTicks) || cur.shouldStop?.()) finish();
    });
  };

  useEffect(() => () => {
    runId.current++;
    stopLoop.current();
    metronome.current?.stop();
  }, []);

  const input = useCallback((action: Action, timeStamp: number): InputRecord | null => {
    const engine = engineRef.current;
    const clock = clockRef.current;
    if (!engine || !clock || status !== 'running') return null;
    const t = Math.max(0, clock.fromEvent(timeStamp));
    const rec = engine.input(action, t);
    // The opening click's window is tick N; the first scored boundary is N+1.
    if (scoreStart.current === null) scoreStart.current = rec.tick;
    setVersion((x) => x + 1);
    return rec;
  }, [status]);

  return { status, verdicts, start, stop: finish, input, engine: engineRef.current, clock: clockRef.current };
}

/** Global keydown listener mapping physical keys to bound actions. Auto-repeat is ignored. */
export function useKeyActions(handler: (action: ActionId, e: KeyboardEvent) => void, enabled = true) {
  const { settings } = useSettings();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const byCode = new Map<string, ActionId[]>();
    for (const [action, code] of Object.entries(settings.keybinds) as [ActionId, string][]) {
      if (code) byCode.set(code, [...(byCode.get(code) ?? []), action]);
    }
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) return;
      const actions = byCode.get(e.code);
      if (!actions) return;
      e.preventDefault();
      if (e.repeat) return;
      for (const a of actions) handlerRef.current(a, e);
    };
    // Buttons activate on Space/Enter keyup, so swallow keyup for bound keys too.
    const onKeyUp = (e: KeyboardEvent) => {
      if (byCode.has(e.code)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [settings.keybinds, enabled]);
}
