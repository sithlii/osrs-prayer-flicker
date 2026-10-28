// Classify each tick boundary for flick drills (PRD §4.4 failure modes, §6.1 timeline states).

import type { InputRecord, TickResult } from './engine';
import type { PrayerId } from '../data/prayers';

export type TickStatus = 'correct' | 'drained' | 'off' | 'idle';

export type FlickError =
  | 'split'        // pair crossed a boundary
  | 'late'         // off-click alone; the on-click slipped past the boundary
  | 'noInputOff'   // no clicks and the prayer was off
  | 'noInputDrain' // no clicks and the prayer stayed on (drained)
  | 'extra';       // three or more clicks

export interface TickVerdict {
  tick: number;
  status: TickStatus;
  error?: FlickError;
  clicks: InputRecord[];
  /** Offset of each relevant click within the window. */
  offsets: number[];
  /** Gap between first and second click, if two or more. */
  gap?: number;
  pointsLost: number;
}

export const ERROR_TEXT: Record<FlickError, string> = {
  split: 'Clicks split across ticks',
  late: 'Late: on-click landed after the boundary',
  noInputOff: 'No input: prayer was off',
  noInputDrain: 'No clicks: prayer stayed on and drained',
  extra: 'Extra input',
};

export const ERROR_TIP: Record<FlickError, string> = {
  split:
    'Your off-click is landing near the end of the tick and the on-click falls into the next one. Start the double-tap right after the beat, not just before it.',
  late:
    'You are finishing the pair after the tick has already rolled over. Tap slightly earlier, aiming for the first half of the tick.',
  noInputOff: 'You skipped a tick entirely. Keep a steady rhythm: one double-tap per beat.',
  noInputDrain:
    'You left the prayer on through a whole tick. Every tick needs an off-on pair, even when it feels redundant.',
  extra: 'You are clicking three or more times per tick. Keep it to a crisp off-on pair.',
};

/** Does this input touch the target? Quick-prayer inputs always do. */
function touches(rec: InputRecord, target: PrayerId[]): boolean {
  return rec.action.kind === 'quick' || target.includes(rec.action.prayer);
}

/** 1-tick verdict: the target must be on at the boundary and freshly activated (no drain). */
export function classifyOneTick(res: TickResult, target: PrayerId[]): TickVerdict {
  const clicks = res.inputs.filter((r) => touches(r, target));
  const offsets = clicks.map((c) => c.offset);
  const gap = offsets.length >= 2 ? offsets[1] - offsets[0] : undefined;
  const on = target.every((id) => res.active.includes(id));
  const free = on && target.every((id) => res.free.includes(id));
  const wasOn = target.every((id) => res.startActive.includes(id));
  const base = { tick: res.tick, clicks, offsets, gap, pointsLost: res.pointsLost };

  if (on && free) {
    return { ...base, status: 'correct', error: clicks.length >= 3 ? 'extra' : undefined };
  }
  if (on) return { ...base, status: 'drained', error: 'noInputDrain' };
  if (clicks.length === 0) return { ...base, status: 'off', error: 'noInputOff' };
  if (clicks.length >= 3) return { ...base, status: 'off', error: 'extra' };
  if (clicks.length === 1 && wasOn) return { ...base, status: 'off', error: 'late' };
  return { ...base, status: 'off', error: 'split' };
}

/**
 * Lazy/offensive verdict: the prayer should be on at `needed` boundaries and off otherwise.
 * Returns 'correct' when needed and on, 'off' when needed and missing, 'drained' when on
 * but not needed (wasted), 'idle' when correctly off.
 */
export function classifyNeeded(res: TickResult, target: PrayerId[], needed: boolean): TickVerdict {
  const clicks = res.inputs.filter((r) => touches(r, target));
  const offsets = clicks.map((c) => c.offset);
  const on = target.some((id) => res.active.includes(id));
  const base = { tick: res.tick, clicks, offsets, pointsLost: res.pointsLost };
  if (needed) return { ...base, status: on ? 'correct' : 'off' };
  return { ...base, status: on ? 'drained' : 'idle' };
}
