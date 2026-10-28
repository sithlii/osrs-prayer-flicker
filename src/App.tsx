import { useEffect, useState } from 'react';
import { OneTickDrill } from './modes/OneTickDrill';
import { TimingDrill } from './modes/TimingDrill';
import { SwitchingDrill } from './modes/SwitchingDrill';
import { Sandbox } from './modes/Sandbox';
import { Progress } from './feedback/Progress';
import { SettingsPage } from './settings/SettingsPage';
import { warmAudio } from './ui/metronome';

const ROUTES = [
  { id: 'one-tick', label: '1-tick: orb', render: () => <OneTickDrill key="quick" variant="quick" /> },
  { id: 'one-tick-book', label: '1-tick: prayer book', render: () => <OneTickDrill key="book" variant="book" /> },
  { id: 'lazy', label: 'Lazy', render: () => <TimingDrill key="lazy" kind="lazy" /> },
  { id: 'offensive', label: 'Offensive', render: () => <TimingDrill key="off" kind="offensive" /> },
  { id: 'switching', label: 'Switching', render: () => <SwitchingDrill /> },
  { id: 'sandbox', label: 'Sandbox', render: () => <Sandbox /> },
  { id: 'progress', label: 'Progress', render: () => <Progress /> },
  { id: 'settings', label: 'Settings', render: () => <SettingsPage /> },
];

function currentRoute() {
  const id = location.hash.replace(/^#\/?/, '');
  return ROUTES.find((r) => r.id === id) ?? ROUTES[0];
}

export function App() {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHash);
    // Browsers only allow audio after a gesture; create the context on the first one so
    // its setup cost never lands inside a drill.
    const warm = () => warmAudio();
    window.addEventListener('pointerdown', warm, { once: true });
    window.addEventListener('keydown', warm, { once: true });
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('pointerdown', warm);
      window.removeEventListener('keydown', warm);
    };
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <h1>Prayer Flick Trainer</h1>
        <nav>
          {ROUTES.map((r) => (
            <a key={r.id} href={`#/${r.id}`} className={r.id === route.id ? 'on' : ''} aria-current={r.id === route.id ? 'page' : undefined}>
              {r.label}
            </a>
          ))}
        </nav>
      </header>
      <main>{route.render()}</main>
      <footer className="muted small">
        Fan-made training tool. Not affiliated with Jagex. All art is original.
      </footer>
    </div>
  );
}
