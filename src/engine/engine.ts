// Deterministic prayer engine (PRD §4). Time is in ms relative to the session origin:
// tick 0 covers [0, 600), tick k covers [k*600, (k+1)*600). Inputs are queued and take
// effect at the next boundary, where drain is evaluated.

import { DEFAULT_CONFIG, EngineConfig, TICK_MS, drainResistance } from './config';
import { PRAYERS, PrayerId, conflicts } from '../data/prayers';

export type Action =
  | { kind: 'toggle'; prayer: PrayerId }
  | { kind: 'quick' };

export interface InputRecord {
  /** Raw timestamp (ms since origin). */
  t: number;
  /** Timestamp after the latency shift; this decides the window. */
  effectiveT: number;
  action: Action;
  /** The tick window the input was processed in. */
  tick: number;
  /** ms from the start of that tick. */
  offset: number;
  /** Arrived after its window had already been processed; folded into the next open window. */
  late: boolean;
}

export interface TickResult {
  /** The tick starting at this boundary. Its window's inputs are `inputs`. */
  tick: number;
  time: number;
  /** Prayers active at the start of the previous tick (before this window's inputs). */
  startActive: PrayerId[];
  /** Prayers active at the start of `tick`. These are the ones that "count". */
  active: PrayerId[];
  /** Active prayers that were (re)activated during the window and so drained nothing. */
  free: PrayerId[];
  drainEffect: number;
  pointsLost: number;
  points: number;
  counter: number;
  inputs: InputRecord[];
}

export interface EngineOptions {
  config?: Partial<EngineConfig>;
  prayerBonus?: number;
  /** Current prayer points. */
  prayerPoints?: number;
  quickPrayers?: PrayerId[];
  latencyMs?: number;
}

export class PrayerEngine {
  readonly config: EngineConfig;
  readonly prayerBonus: number;
  readonly latencyMs: number;
  quickPrayers: PrayerId[];

  points: number;
  counter = 0;
  /** Index of the window currently open for input. */
  currentTick = 0;

  private serverActive = new Set<PrayerId>();
  private clientActive = new Set<PrayerId>();
  private queue: InputRecord[] = [];
  readonly history: TickResult[] = [];
  readonly inputs: InputRecord[] = [];

  constructor(opts: EngineOptions = {}) {
    this.config = { ...DEFAULT_CONFIG, ...opts.config };
    this.prayerBonus = opts.prayerBonus ?? 0;
    this.points = opts.prayerPoints ?? 99;
    this.quickPrayers = opts.quickPrayers ?? ['protectFromMelee'];
    this.latencyMs = opts.latencyMs ?? 0;
  }

  get resistance(): number {
    return drainResistance(this.prayerBonus);
  }

  /** Prayers active as of the last processed boundary. */
  get active(): ReadonlySet<PrayerId> {
    return this.serverActive;
  }

  /** Prayers as the player currently sees them: server state plus queued inputs. */
  get pending(): ReadonlySet<PrayerId> {
    return this.clientActive;
  }

  /** Restore points (e.g. a prayer potion). Takes effect immediately. */
  restore(amount: number, max: number) {
    this.points = Math.min(max, this.points + amount);
  }

  tickOf(t: number): number {
    return Math.floor((t + this.latencyMs) / TICK_MS);
  }

  input(action: Action, t: number): InputRecord {
    const effectiveT = t + this.latencyMs;
    let tick = Math.floor(effectiveT / TICK_MS);
    let late = false;
    if (tick < this.currentTick) {
      tick = this.currentTick;
      late = true;
    }
    const offset = late ? 0 : effectiveT - tick * TICK_MS;
    const rec: InputRecord = { t, effectiveT, action, tick, offset, late };
    this.queue.push(rec);
    this.inputs.push(rec);
    applyAction(this.clientActive, action, this.quickPrayers, this.points);
    return rec;
  }

  /** Process every boundary at or before `t`. */
  advanceTo(t: number): TickResult[] {
    const out: TickResult[] = [];
    while ((this.currentTick + 1) * TICK_MS - this.latencyMs <= t) {
      out.push(this.processBoundary());
    }
    return out;
  }

  private processBoundary(): TickResult {
    const window = this.currentTick;
    const nextTick = window + 1;
    const inputs = this.queue.filter((r) => r.tick === window);
    this.queue = this.queue.filter((r) => r.tick > window);

    const startActive = [...this.serverActive];
    const activatedDuring = new Set<PrayerId>();
    const state = new Set(this.serverActive);
    for (const rec of inputs) {
      const before = new Set(state);
      applyAction(state, rec.action, this.quickPrayers, this.points);
      for (const id of state) if (!before.has(id)) activatedDuring.add(id);
    }

    const free: PrayerId[] = [];
    let drainEffect = 0;
    for (const id of state) {
      if (this.config.activationTickIsFree && activatedDuring.has(id)) {
        free.push(id);
        continue;
      }
      drainEffect += PRAYER_DRAIN[id];
    }

    this.counter += drainEffect;
    let pointsLost = 0;
    const exceeds = () =>
      this.config.strictGreaterThan ? this.counter > this.resistance : this.counter >= this.resistance;
    while (exceeds() && this.points > 0) {
      this.points -= 1;
      this.counter -= this.resistance;
      pointsLost += 1;
    }
    if (this.points <= 0) {
      this.points = 0;
      state.clear();
    }
    if (state.size === 0 && this.config.resetDrainCounterOnAllOff) this.counter = 0;

    this.serverActive = state;
    this.currentTick = nextTick;
    // Rebuild the client view from the new server state plus anything still queued.
    this.clientActive = new Set(state);
    for (const rec of this.queue) applyAction(this.clientActive, rec.action, this.quickPrayers, this.points);

    const result: TickResult = {
      tick: nextTick,
      time: nextTick * TICK_MS,
      startActive,
      active: [...state],
      free,
      drainEffect,
      pointsLost,
      points: this.points,
      counter: this.counter,
      inputs,
    };
    this.history.push(result);
    return result;
  }
}

const PRAYER_DRAIN = Object.fromEntries(PRAYERS.map((p) => [p.id, p.drain])) as Record<PrayerId, number>;

function activate(state: Set<PrayerId>, id: PrayerId) {
  for (const other of [...state]) if (conflicts(id, other)) state.delete(other);
  state.add(id);
}

/** Apply one action to a prayer set. The quick-prayer orb turns everything off if anything is on. */
export function applyAction(state: Set<PrayerId>, action: Action, quick: PrayerId[], points: number) {
  if (action.kind === 'toggle') {
    if (state.has(action.prayer)) state.delete(action.prayer);
    else if (points > 0) activate(state, action.prayer);
    return;
  }
  if (state.size > 0) {
    state.clear();
  } else if (points > 0) {
    for (const id of quick) activate(state, id);
  }
}

/** Points lost leaving `prayers` on continuously for `ticks` boundaries (the no-flick baseline). */
export function continuousDrain(
  prayers: PrayerId[],
  ticks: number,
  opts: Omit<EngineOptions, 'quickPrayers'> = {},
): number {
  const eng = new PrayerEngine({ ...opts, quickPrayers: prayers, latencyMs: 0 });
  const start = eng.points;
  eng.input({ kind: 'quick' }, 0);
  eng.advanceTo(ticks * TICK_MS);
  return start - eng.points;
}
