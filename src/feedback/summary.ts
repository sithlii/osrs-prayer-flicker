// Session statistics (PRD §6.2).

import { ERROR_TEXT, ERROR_TIP, type FlickError, type TickVerdict } from '../engine/scoring';

export interface FlickSummary {
  ticks: number;
  correct: number;
  accuracy: number;
  longestStreak: number;
  firstOffsets: number[];
  secondOffsets: number[];
  meanOffset: number;
  stdOffset: number;
  meanGap: number;
  errors: Partial<Record<FlickError, number>>;
  topError?: { error: FlickError; count: number; text: string; tip: string };
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

export function longestStreak(verdicts: TickVerdict[], ok: (v: TickVerdict) => boolean): number {
  let best = 0;
  let cur = 0;
  for (const v of verdicts) {
    cur = ok(v) ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}

export function summarizeFlicks(verdicts: TickVerdict[]): FlickSummary {
  const correct = verdicts.filter((v) => v.status === 'correct').length;
  const firstOffsets = verdicts.filter((v) => v.offsets.length >= 1).map((v) => v.offsets[0]);
  const secondOffsets = verdicts.filter((v) => v.offsets.length >= 2).map((v) => v.offsets[1]);
  const gaps = verdicts.map((v) => v.gap).filter((g): g is number => g !== undefined);
  const errors: Partial<Record<FlickError, number>> = {};
  for (const v of verdicts) if (v.error) errors[v.error] = (errors[v.error] ?? 0) + 1;
  const top = (Object.entries(errors) as [FlickError, number][]).sort((a, b) => b[1] - a[1])[0];
  return {
    ticks: verdicts.length,
    correct,
    accuracy: verdicts.length ? correct / verdicts.length : 0,
    longestStreak: longestStreak(verdicts, (v) => v.status === 'correct'),
    firstOffsets,
    secondOffsets,
    meanOffset: mean(firstOffsets),
    stdOffset: std(firstOffsets),
    meanGap: mean(gaps),
    errors,
    topError: top ? { error: top[0], count: top[1], text: ERROR_TEXT[top[0]], tip: ERROR_TIP[top[0]] } : undefined,
  };
}
