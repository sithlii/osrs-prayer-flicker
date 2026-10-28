// Tick length and drain-model flags. See PRD §4.5 for the evidence behind each default.

export const TICK_MS = 600;

export interface EngineConfig {
  /** Drain counter goes to 0 when no prayers are active. Supported false by in-game test. */
  resetDrainCounterOnAllOff: boolean;
  /** A prayer (re)activated during a tick adds no drain at that tick's boundary. Confirmed by the wiki. */
  activationTickIsFree: boolean;
  /** A point is removed when counter > resistance (true) or >= resistance (false). */
  strictGreaterThan: boolean;
}

export const DEFAULT_CONFIG: EngineConfig = {
  resetDrainCounterOnAllOff: false,
  activationTickIsFree: true,
  strictGreaterThan: true,
};

export function drainResistance(prayerBonus: number): number {
  return 60 + 2 * prayerBonus;
}

/** Seconds per prayer point for a given total drain effect (PRD §4.2). */
export function secondsPerPoint(totalDrainEffect: number, prayerBonus: number): number {
  if (totalDrainEffect <= 0) return Infinity;
  return (0.6 * drainResistance(prayerBonus)) / totalDrainEffect;
}
