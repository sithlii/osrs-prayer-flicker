# OSRS Prayer Flick Trainer

A browser app for practising Old School RuneScape prayer flicking. It simulates the 0.6s game tick and the server's prayer drain rules, then shows exactly where each of your clicks landed and what it cost.

Everything runs locally in your browser. There is no account, no server and no tracking. Your settings, keybinds and session history are saved in your browser's local storage.

## Running it

You need [Node.js](https://nodejs.org/) 18 or newer.

```bash
git clone https://github.com/sithlii/osrs-prayer-flicker.git
cd osrs-prayer-flicker
npm install
npm run dev
```

Then open http://localhost:5173 in a desktop browser.

To build a static copy you can open without the dev server:

```bash
npm run build     # outputs to dist/
npm run preview   # serves dist/ at http://localhost:4173
```

## Training modes

| Mode | What you practise |
|---|---|
| **1-tick: orb** | Double-tapping the quick-prayer orb (or your bind) once per tick. Four difficulties: visual and audio metronome, audio only, visual only, and blind. Includes stacked quick-prayer presets. |
| **1-tick: prayer book** | The same rhythm on a single prayer icon in the prayer book. |
| **Lazy** | Turning a protection prayer on only for the tick a monster's attack is checked. Presets include a 4-tick starter monster, ranged and magic attackers, delayed-check bosses and a variable-speed monster. |
| **Offensive** | Flicking Piety, Rigour and similar prayers on for each of your own attacks, with combined offence and protection drills. |
| **Switching** | An OSRS-style interface with side-panel tabs bound to your F-keys. Read each attack's telegraph and switch to the right protection prayer. Drink prayer potions from the inventory when you run low. |
| **Sandbox** | Turn on any prayers and watch them drain live. Includes a drain calculator and simulated versions of the in-game stopwatch tests. |

Each drill gives live feedback: the offset of every click, a colour- and symbol-coded tick timeline, and a callout naming the mistake. At the end you get a summary with accuracy, streak, a histogram of where your clicks landed, consistency, points drained against the no-flick baseline, and a tip for your most common error. The **Progress** page tracks trends and personal bests, and can export or import your history as JSON.

## Default controls

| Action | Key |
|---|---|
| Quick-prayer orb | Space |
| Combat / Inventory / Equipment / Prayer / Magic tabs | F1 / F2 / F3 / F4 / F5 |

You can rebind everything in **Settings**, including optional binds for individual prayers. You can also share or back up your binds with an export code. Mouse clicks work everywhere.

Your input is timestamped when the key or mouse button goes down, so frame rate doesn't affect your score.

## How the simulation works

The engine (`src/engine/`) is plain TypeScript with no framework code. For a given input log it always produces the same result:

- Inputs take effect at the next tick boundary. A prayer only counts if it is active at the start of a tick.
- A prayer turned on during a tick does not drain at that tick's boundary. This is why 1-tick flicking is free.
- Drain uses `resistance = 60 + 2 × prayer bonus`. Each tick, the drain effects of the active prayers are added to a counter, and a point is lost each time the counter exceeds the resistance.
- Prayers in the same group switch each other off, as in the game.

The flags for the less certain parts of the model are in `src/engine/config.ts`, and can be toggled under **Settings → Engine flags**. The prayer table is in `src/data/prayers.ts`, and the monster presets are in `src/data/encounters.ts`. The check delays for the boss-style presets are approximations.

See [docs/PRD.md](docs/PRD.md) for the full product spec and the evidence behind each rule.

## Development

```bash
npm test           # engine unit tests (Vitest)
npm run typecheck  # TypeScript
```

```
src/
  engine/     tick clock, drain model, scoring, encounter schedules (+ tests)
  data/       prayer table, encounter presets
  modes/      one drill component per training mode
  ui/         shared drill runtime, metronome, orb, prayer book, timeline
  feedback/   session summary, charts, history and progress
  settings/   preferences, keybinds, local storage
```

## Disclaimer

This is a fan-made training tool. It is not affiliated with or endorsed by Jagex. All art is original CSS and SVG, and no game assets or music are included.
