// Local session history and personal bests (PRD §6.3).

import { useCallback, useState } from 'react';
import { loadArray, save } from '../settings/storage';

export type ModeId = 'oneTickQuick' | 'oneTickBook' | 'lazy' | 'offensive' | 'switching';

export const MODE_LABEL: Record<ModeId, string> = {
  oneTickQuick: '1-tick: quick-prayer orb',
  oneTickBook: '1-tick: prayer book',
  lazy: 'Lazy flicking',
  offensive: 'Offensive flicking',
  switching: 'Prayer switching',
};

export interface SessionRecord {
  id: string;
  mode: ModeId;
  /** Difficulty or preset, e.g. "Blind" or "Jad-style". */
  variant: string;
  date: string;
  ticks: number;
  accuracy: number;
  longestStreak: number;
  /** Standard deviation of first-click offsets (ms); lower is more consistent. */
  consistencyMs?: number;
  pointsDrained: number;
  baselineDrain: number;
  stats: Record<string, number>;
}

const KEY = 'pft.history.v1';

export function useHistory() {
  const [history, setHistory] = useState<SessionRecord[]>(() => loadArray<SessionRecord>(KEY));

  const add = useCallback((rec: Omit<SessionRecord, 'id' | 'date'>) => {
    // Re-read storage so another open view's sessions aren't overwritten.
    const next = [...loadArray<SessionRecord>(KEY), { ...rec, id: crypto.randomUUID(), date: new Date().toISOString() }];
    save(KEY, next);
    setHistory(next);
  }, []);

  const replace = useCallback((recs: SessionRecord[]) => {
    save(KEY, recs);
    setHistory(recs);
  }, []);

  return { history, add, replace };
}

export function personalBest(history: SessionRecord[], mode: ModeId, variant: string): SessionRecord | undefined {
  return history
    .filter((r) => r.mode === mode && r.variant === variant)
    .sort((a, b) => b.accuracy - a.accuracy || b.longestStreak - a.longestStreak)[0];
}
