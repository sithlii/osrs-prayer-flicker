// Preferences and keybinds (PRD §7, §8), persisted in localStorage.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { load, save } from './storage';
import type { EngineConfig } from '../engine/config';
import { DEFAULT_CONFIG } from '../engine/config';
import type { PrayerId } from '../data/prayers';

export type TabId = 'combat' | 'inventory' | 'equipment' | 'prayer' | 'magic';
export const TABS: { id: TabId; label: string }[] = [
  { id: 'combat', label: 'Combat' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'equipment', label: 'Equipment' },
  { id: 'prayer', label: 'Prayer' },
  { id: 'magic', label: 'Magic' },
];

export type ActionId = 'quickPrayer' | `tab:${TabId}` | `prayer:${PrayerId}`;

export interface Settings {
  prayerBonus: number;
  prayerLevel: number;
  latencyMs: number;
  metronomeVolume: number;
  metronomePitch: number;
  metronomeSound: 'click' | 'drums';
  theme: 'system' | 'light' | 'dark';
  showKeyLabels: boolean;
  engine: EngineConfig;
  keybinds: Partial<Record<ActionId, string>>;
}

export const DEFAULT_KEYBINDS: Partial<Record<ActionId, string>> = {
  quickPrayer: 'Space',
  'tab:combat': 'F1',
  'tab:inventory': 'F2',
  'tab:equipment': 'F3',
  'tab:prayer': 'F4',
  'tab:magic': 'F5',
};

export const DEFAULT_SETTINGS: Settings = {
  prayerBonus: 0,
  prayerLevel: 99,
  latencyMs: 0,
  metronomeVolume: 0.6,
  metronomePitch: 1000,
  metronomeSound: 'click',
  theme: 'dark',
  showKeyLabels: true,
  engine: DEFAULT_CONFIG,
  keybinds: DEFAULT_KEYBINDS,
};

const KEY = 'pft.settings.v1';

interface Ctx {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  setBind: (action: ActionId, code: string | undefined) => void;
  replace: (s: Settings) => void;
}

const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    const s = load(KEY, DEFAULT_SETTINGS);
    return { ...s, engine: { ...DEFAULT_CONFIG, ...s.engine } };
  });

  useEffect(() => save(KEY, settings), [settings]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const setBind = useCallback((action: ActionId, code: string | undefined) => {
    setSettings((s) => {
      const keybinds = { ...s.keybinds };
      if (code) keybinds[action] = code;
      else delete keybinds[action];
      return { ...s, keybinds };
    });
  }, []);
  const replace = useCallback((s: Settings) => setSettings({ ...DEFAULT_SETTINGS, ...s }), []);

  const value = useMemo(() => ({ settings, update, setBind, replace }), [settings, update, setBind, replace]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings outside SettingsProvider');
  return ctx;
}

/** Human-readable key label, e.g. "KeyQ" → "Q", "Digit1" → "1". */
export function keyLabel(code: string | undefined): string {
  if (!code) return '';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num' + code.slice(6);
  return code;
}

/** Actions that share a key with another action. */
export function conflictingActions(binds: Partial<Record<ActionId, string>>): Set<ActionId> {
  const byKey = new Map<string, ActionId[]>();
  for (const [action, code] of Object.entries(binds) as [ActionId, string][]) {
    if (!code) continue;
    byKey.set(code, [...(byKey.get(code) ?? []), action]);
  }
  const out = new Set<ActionId>();
  for (const list of byKey.values()) if (list.length > 1) list.forEach((a) => out.add(a));
  return out;
}

/** Points restored by one dose of prayer potion: 7 + floor(level / 4). */
export function potionRestore(level: number): number {
  return 7 + Math.floor(level / 4);
}
