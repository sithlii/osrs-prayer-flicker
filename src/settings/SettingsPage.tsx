// Preferences and keybind editor (PRD §7, §8).

import { useEffect, useState } from 'react';
import {
  DEFAULT_KEYBINDS, DEFAULT_SETTINGS, TABS, conflictingActions, keyLabel, useSettings, type ActionId, type Settings,
} from './settings';
import { decodeCode, encodeCode } from './storage';
import { PRAYERS } from '../data/prayers';
import { Metronome } from '../ui/metronome';
import { Segmented } from '../ui/components';

const ACTIONS: { id: ActionId; label: string; group: string }[] = [
  { id: 'quickPrayer', label: 'Quick-prayer orb', group: 'General' },
  ...TABS.map((t) => ({ id: `tab:${t.id}` as ActionId, label: `${t.label} tab`, group: 'Side-panel tabs' })),
  ...PRAYERS.map((p) => ({ id: `prayer:${p.id}` as ActionId, label: p.name, group: 'Individual prayers (optional)' })),
];

export function SettingsPage() {
  const { settings, update, setBind, replace } = useSettings();
  const [capturing, setCapturing] = useState<ActionId | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const conflicts = conflictingActions(settings.keybinds);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== 'Escape') setBind(capturing, e.code === 'Backspace' || e.code === 'Delete' ? undefined : e.code);
      setCapturing(null);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [capturing, setBind]);

  const num = (key: keyof Settings, min: number, max: number) => (
    <input
      type="number"
      min={min}
      max={max}
      value={settings[key] as number}
      onChange={(e) => update({ [key]: Math.max(min, Math.min(max, Number(e.target.value) || 0)) })}
    />
  );

  const testMetronome = () => {
    const m = new Metronome({
      volume: settings.metronomeVolume, pitch: settings.metronomePitch, sound: settings.metronomeSound,
    });
    m.start(performance.now() + 50);
    setTimeout(() => m.stop(), 4 * 600 + 100);
  };

  const groups = [...new Set(ACTIONS.map((a) => a.group))];

  return (
    <section className="drill">
      <header className="drill-head"><h2>Settings</h2></header>

      <div className="card settings-grid">
        <h3>Character</h3>
        <label>Prayer bonus {num('prayerBonus', -20, 100)}</label>
        <label>Prayer level / starting points {num('prayerLevel', 1, 99)}</label>
        <label>Latency offset (ms) {num('latencyMs', 0, 150)} <span className="muted small">Shifts the effective tick boundary earlier to mimic ping.</span></label>
      </div>

      <div className="card settings-grid">
        <h3>Metronome</h3>
        <div className="field" role="group" aria-label="Sound"><span>Sound</span> <Segmented value={settings.metronomeSound} onChange={(v) => update({ metronomeSound: v })} options={[{ value: 'click', label: 'Click' }, { value: 'drums', label: 'Drum loop' }]} /></div>
        <label>Volume <input type="range" min={0} max={1} step={0.05} value={settings.metronomeVolume} onChange={(e) => update({ metronomeVolume: Number(e.target.value) })} /></label>
        <label>Pitch <input type="range" min={300} max={2000} step={50} value={settings.metronomePitch} onChange={(e) => update({ metronomePitch: Number(e.target.value) })} /> <span className="muted small">{settings.metronomePitch}Hz</span></label>
        <div><button onClick={testMetronome}>Test</button></div>
        <p className="muted small">
          Tip: the metronome runs at 100 BPM, one beat per tick. In-game songs at 100 BPM, such as Sea Shanty 2, Dogs of War and Null and Void, work as a metronome too.
        </p>
      </div>

      <div className="card settings-grid">
        <h3>Display</h3>
        <div className="field" role="group" aria-label="Theme"><span>Theme</span> <Segmented value={settings.theme} onChange={(v) => update({ theme: v })} options={[{ value: 'dark', label: 'Stone' }, { value: 'light', label: 'Parchment' }, { value: 'system', label: 'Match system' }]} /></div>
        <label className="check"><input type="checkbox" checked={settings.showKeyLabels} onChange={(e) => update({ showKeyLabels: e.target.checked })} /> Show keybind labels during drills</label>
      </div>

      <div className="card">
        <h3>Keybinds</h3>
        <p className="muted small">Click a bind, then press a key. Esc cancels, Backspace clears. Auto-repeat is ignored during drills.</p>
        {conflicts.size > 0 && <p className="warning" role="alert">⚠ Some actions share a key: {[...conflicts].map((a) => ACTIONS.find((x) => x.id === a)?.label).join(', ')}.</p>}
        {groups.map((g) => {
          const rows = ACTIONS.filter((a) => a.group === g);
          const body = (
            <table className="table binds">
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className={conflicts.has(a.id) ? 'conflict' : ''}>
                    <td>{a.label}</td>
                    <td>
                      <button className="bind" onClick={() => setCapturing(a.id)}>
                        {capturing === a.id ? 'Press a key…' : keyLabel(settings.keybinds[a.id]) || <span className="muted">unbound</span>}
                      </button>
                      {conflicts.has(a.id) && <span className="conflict-flag"> ⚠ conflict</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
          return g.startsWith('Individual') ? (
            <details key={g}><summary>{g}</summary>{body}</details>
          ) : (
            <div key={g}><h4>{g}</h4>{body}</div>
          );
        })}
        <div className="actions">
          <button onClick={() => update({ keybinds: DEFAULT_KEYBINDS })}>Reset keybinds</button>
          <button onClick={() => { setCode(encodeCode(settings.keybinds)); setMessage('Code generated. Copy it to share or back up your binds.'); }}>Export code</button>
          <button
            onClick={() => {
              try {
                update({ keybinds: decodeCode(code) });
                setMessage('Keybinds imported.');
              } catch {
                setMessage('That code is not valid.');
              }
            }}
            disabled={!code.trim()}
          >
            Import code
          </button>
        </div>
        <textarea className="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste a keybind code here" rows={2} />
        {message && <p className="muted small">{message}</p>}
      </div>

      <details className="card">
        <summary>Engine flags (debugging)</summary>
        <p className="muted small">These control the drain model (PRD §4.5). The defaults match the OSRS Wiki and in-game testing.</p>
        <label className="check"><input type="checkbox" checked={settings.engine.activationTickIsFree} onChange={(e) => update({ engine: { ...settings.engine, activationTickIsFree: e.target.checked } })} /> activationTickIsFree</label>
        <label className="check"><input type="checkbox" checked={settings.engine.resetDrainCounterOnAllOff} onChange={(e) => update({ engine: { ...settings.engine, resetDrainCounterOnAllOff: e.target.checked } })} /> resetDrainCounterOnAllOff</label>
        <label className="check"><input type="checkbox" checked={settings.engine.strictGreaterThan} onChange={(e) => update({ engine: { ...settings.engine, strictGreaterThan: e.target.checked } })} /> strictGreaterThan</label>
      </details>

      <div className="actions">
        <button className="danger" onClick={() => { if (confirm('Reset all settings to defaults?')) replace(DEFAULT_SETTINGS); }}>Reset all settings</button>
      </div>
    </section>
  );
}
