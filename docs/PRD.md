# PRD: OSRS Prayer Flick Trainer

**Status:** Draft v1.3 (prayer table and core flick mechanics verified against the OSRS Wiki)
**Platform:** Browser (desktop first)
**Owner:** Isaac Gartz

---

## 1. Overview

A browser app that teaches Old School RuneScape players to prayer flick. It simulates the 0.6s game tick and the server's prayer drain logic. Players drill each flicking technique and get detailed, immediate feedback on their timing.

The core value is **feedback**. In the game a mistimed flick fails silently: you take a hit or lose points and don't know why. The trainer shows exactly where every input landed relative to the tick and what it cost.

## 2. Goals

1. Teach 1-tick flicking, lazy flicking, offensive flicking and prayer switching.
2. Model the game's tick and drain rules closely enough that skills transfer directly to the game.
3. Give per-input, per-session and long-term feedback on timing.
4. Let players use their own keybinds, so they practise with their real setup.
5. Add competition and motivation with leaderboards.

### Non-goals (v1)
- Mobile or touch support
- Reading data from the live game client or integrating with RuneLite
- Accounts with passwords (see §9 for leaderboard identity)

## 3. Target users

- **New flickers:** they know the concept but can't keep the rhythm.
- **Intermediate players:** they can flick but are inconsistent, or they want to learn lazy or offensive flicking for bossing.
- **PvM learners:** they are preparing for prayer-switching content such as Jad, Zulrah or the Inferno.

---

## 4. Game mechanics model (source of truth)

All timing and drain logic lives in one engine module. It is driven by a config table, so values can be corrected without touching the logic.

### 4.1 Tick clock
- `TICK_MS = 600`
- The engine keeps a monotonic tick counter and the start timestamp of each tick, using `performance.now()`.
- Every input is timestamped and assigned to the tick window it falls in. Inputs take effect at the **next tick boundary**, as in the game, where client inputs are processed on the server tick.
- An optional "latency" setting (0–150ms) shifts the effective boundary to mimic ping. The default is 0.

### 4.2 Drain formula
```
drainResistance = 60 + 2 * prayerBonus
secondsPerPoint = 0.6 * drainResistance / totalDrainEffect
```
- `totalDrainEffect` is the **sum** of the drain effects of every prayer active for the tick (stacking is additive).
- Example: Protect from Melee (12) + Piety (24) = 36. At +0 bonus that's 0.6 × 60 / 36 = 1.0s per point. At +20 bonus it's 0.6 × 100 / 36 ≈ 1.67s per point.

### 4.3 Drain counter ("prayer bucket"), evaluated at each tick boundary
```
for each tick boundary:
    drainThisTick = 0
    for each prayer active at this boundary:
        if config.activationTickIsFree and prayer was (re)activated during the tick that just ended:
            continue                      # activation tick is free
        drainThisTick += prayer.drainEffect
    counter += drainThisTick
    while exceeds(counter, drainResistance):  # > or >= per config.strictGreaterThan; can remove >1 point per tick
        prayerPoints -= 1
        counter -= drainResistance
    if no prayers active and config.resetDrainCounterOnAllOff:
        counter = 0
```

### 4.4 Core rules (confirmed by the OSRS Wiki)
- **Prayers apply only if active at the start of a tick.** A prayer turned on during a tick does nothing for attacks on that tick.
- **No drain on the activation tick.** The game compensates for the rule above by not draining a prayer on the tick it is turned on.
- **1-tick flicking** follows from both rules. The prayer is on at the start of every tick, so it affects every attack. Because it is turned off and back on before the next tick, the game sees it as freshly activated every tick and never drains it.
- **Click pattern (wiki):**
  - Tick 1: turn the prayer on (one click).
  - Tick 2 and every tick after: turn it off, then back on before the tick ends (two clicks).
  The engine and drills must model the single opening click, not just the repeating double click.
- **Lazy flicking** turns the prayer on just before the needed tick and off within the next tick. Done right, it costs nothing.
- **Preserve and Rapid Heal do nothing when 1-tick flicked.** Preserve must stay on for 15s continuously, and each activation of Rapid Heal resets the HP regen timer to 30s. The quick-prayer setup screen warns when either is included.

**Failure modes the engine must detect (1-tick):**
- **Pair crosses a boundary:** the off-click lands in tick N and the on-click in tick N+1. The prayer is **off at the start of tick N+1**, so there's no protection or bonus that tick.
- **Only one click in a window:** the prayer is either left on into a second continuous tick (it drains) or left off (no effect).
- **No clicks in a window:** the prayer stays on continuously and drains.
- **Three or more clicks:** the final state decides. Flag it as "extra input".

### 4.5 Engine config flags

These live in `engine/config.ts`. Two are now confirmed by the OSRS Wiki text. The third is supported by an early in-game test.

| Flag | Default | Controls | Impact |
|---|---|---|---|
| `resetDrainCounterOnAllOff` | `false` (supported by test, see below) | `true`: the drain counter goes to 0 when no prayers are active. `false`: partial drain is kept and resumes when a prayer comes back on. | **High** for lazy and offensive flicking: it decides whether brief, repeated activations eventually cost points. |
| `activationTickIsFree` | `true` (**confirmed**: OSRS Wiki) | `true`: a prayer (re)activated during a tick adds no drain at that tick's boundary (the §4.3 model). `false`: every prayer active at a boundary drains. | **Critical.** With `false`, 1-tick flicking would save nothing, which contradicts the wiki. Kept only as a debugging flag. |
| `strictGreaterThan` | `true` (wiki says the counter must **exceed** resistance) | `true`: a point is removed when `counter > drainResistance`. `false`: when `counter >= drainResistance`. | **Low.** It only delays the *first* point by one tick (0.6s). The long-run drain rate is the same either way. |

#### Test log
- **Test 1, run 1 (gear on, about 1 minute of 20s-on / 10s-off cycles):** lost 1 point.
  - If the counter reset on all-off, each 20s stretch (~33 ticks) could never reach a resistance of 60 or more, so **0 points** would be lost at any prayer bonus.
  - Losing a point therefore supports `resetDrainCounterOnAllOff = false`.
  - A single point is weak evidence: a mistimed stretch longer than 36s could also cause it. A full 6-minute run would confirm it.

#### Stopwatch test plan (no tick counting needed)
Use a stopwatch or phone timer. Write down prayer points before and after. Gear can stay on: plug your prayer bonus `b` into the expected values.

1. **`resetDrainCounterOnAllOff`.** Use **Thick Skin**, which loses 1 point per 36s if left on.
   - Repeat this cycle for 6 minutes: on for 20s, off for 10s. That totals 4 minutes (400 ticks) of prayer-on time.
   - Counter kept (`false`): you lose about `400 / (60 + 2b)` points. That's ~6–7 at +0, ~5 at +10, ~4 at +20.
   - Counter reset (`true`): you lose **0 points** at any bonus, because no 20s stretch reaches 36s.
   - The two outcomes are far apart, so the result is clear even with imprecise timing.
2. **`activationTickIsFree`.** Use **Piety**, or any 24-drain prayer: 1 point per 1.5s.
   - 1-tick flick for 60s, using the trainer's metronome or a RuneLite metronome plugin.
   - Free activation tick (`true`): you lose about 0 points, plus a few from missed flicks.
   - Not free (`false`): you lose about 40 points.
3. **`strictGreaterThan`.** This can't be checked by hand: the difference is a single 0.6s tick on the first point only. Keep the default. If it ever matters, check it with a RuneLite tick-counter plugin (Thick Skin from full: is the first point lost on tick 60 or tick 61?).

The trainer's sandbox mode (§5.6) shows the simulated result of each test, so players can compare it with what they see in game.

### 4.6 Prayer data table

| Lvl | Prayer | Effect | Drain effect | Time per point (+0 bonus) | Overhead | Group (for exclusivity) |
|---|---|---|---|---|---|---|
| 1 | Thick Skin | +5% Defence | 1 | 36s | No | defence |
| 4 | Burst of Strength | +5% Strength | 1 | 36s | No | strength |
| 7 | Clarity of Thought | +5% Attack | 1 | 36s | No | attack |
| 8 | Sharp Eye | +5% Ranged attack, +5% Ranged Strength | 1 | 36s | No | ranged |
| 9 | Mystic Will | +5% Magic Attack and Defence | 1 | 36s | No | magic |
| 10 | Rock Skin | +10% Defence | 6 | 6s | No | defence |
| 13 | Superhuman Strength | +10% Strength | 6 | 6s | No | strength |
| 16 | Improved Reflexes | +10% Attack | 6 | 6s | No | attack |
| 19 | Rapid Restore | 2x restore rate for all skills except Hitpoints and Prayer | 1 | 36s | No | — |
| 22 | Rapid Heal | 2x restore rate for Hitpoints | 2 | 18s | No | — |
| 25 | Protect Item | Keep one extra item on death | 2 | 18s | No | — |
| 26 | Hawk Eye | +10% Ranged attack, +10% Ranged Strength | 6 | 6s | No | ranged |
| 27 | Mystic Lore | +10% Magic Attack and Defence, +1% Magic damage | 6 | 6s | No | magic |
| 28 | Steel Skin | +15% Defence | 12 | 3s | No | defence |
| 31 | Ultimate Strength | +15% Strength | 12 | 3s | No | strength |
| 34 | Incredible Reflexes | +15% Attack | 12 | 3s | No | attack |
| 37 | Protect from Magic | 100% protection from NPC magic, 40% from players | 12 | 3s | Yes | overhead |
| 40 | Protect from Missiles | 100% protection from NPC ranged, 40% from players | 12 | 3s | Yes | overhead |
| 43 | Protect from Melee | 100% protection from NPC melee, 40% from players | 12 | 3s | Yes | overhead |
| 44 | Eagle Eye | +15% Ranged attack, +15% Ranged Strength | 12 | 3s | No | ranged |
| 45 | Mystic Might | +15% Magic Attack and Defence, +2% Magic damage | 12 | 3s | No | magic |
| 46 | Retribution | On death, deals up to 25% of base Prayer level to targets in a 3x3 area | 3 | 12s | Yes | overhead |
| 49 | Redemption | Below 10% HP, heals 25% of base Prayer level and drains all prayer points | 6 | 6s | Yes | overhead |
| 52 | Smite | Reduces opponent's prayer by 25% of damage dealt | 18 | 2s | Yes | overhead |
| 55 | Preserve | Boosted stats last 50% longer | 2 | 18s | No | — |
| 60 | Chivalry | +15% Attack, +18% Strength, +20% Defence | 12 | 3s | No | melee combo (attack + strength + defence) |
| 62 | Deadeye | +18% Ranged attack, +18% Ranged Strength, +5% Defence | 12 | 3s | No | ranged + defence (unlockable) |
| 63 | Mystic Vigour | +18% Magic Attack and Defence, +5% Defence, +3% Magic damage | 12 | 3s | No | magic + defence (unlockable) |
| 70 | Piety | +20% Attack, +23% Strength, +25% Defence | 24 | 1.5s | No | melee combo |
| 74 | Rigour | +20% Ranged attack, +23% Ranged Strength, +25% Defence | 24 | 1.5s | No | ranged + defence |
| 77 | Augury | +25% Magic Attack and Defence, +25% Defence, +4% Magic damage | 24 | 1.5s | No | magic + defence |
| 84 | Zeal | +25% Attack, +28% Strength, +25% Defence | 24 | 1.5s | No | melee combo |

> All values verified against the user-supplied OSRS Wiki table. **Chivalry drains 12, not 24.** The previous draft was wrong; Deadeye and Mystic Vigour are in the same tier as Chivalry. **Zeal** (level 84, drain 24) has been added. The *Overhead* column means the prayer shows an overhead icon, and only one overhead can be active at a time.

**Exclusivity rules:** turning on a prayer turns off any active prayer that shares one of its groups. Only one overhead can be on at a time. Combo prayers occupy every group they list. Offensive groups (attack/strength, ranged, magic) are mutually exclusive across combat styles.

---

## 5. Training modes

Every mode shares: a tick metronome (visual, plus optional audio), a live prayer-points readout, a configurable prayer bonus, start/pause, and a session summary.

- **Metronome:** 100 BPM (one beat per 0.6s tick). Offer a plain click and an original 100 BPM drum loop. A tips panel notes that in-game songs at 100 BPM (Sea Shanty 2, Dogs of War, Null and Void) can stand in for a metronome. Don't bundle game music.
- **Encounter model:** each monster has an attack speed (ticks) and a `prayerCheck` rule:
  - `animationStart` (default): protection must be active at the start of the tick the attack animation begins, **not** when the hitsplat appears.
  - `delayed(n)`: checked a few ticks after the animation starts (TzTok-Jad, The Nightmare, Verzik Vitur), which gives time to react.
  - `projectileArrival`: checked when the projectile reaches the player (Scurrius, The Leviathan).
  - `variable`: the attack speed varies (e.g. cave horrors), so lazy flicking is unreliable and only 1-tick flicking works.

### 5.1 1-tick flick: quick-prayer orb
- **Goal:** double-tap the orb or hotkey once per tick, indefinitely.
- **Difficulty levels:**
  1. Visual and audio metronome, with a large timing bar showing the tick window.
  2. Audio only.
  3. Visual only.
  4. **Blind:** no metronome. The player keeps the rhythm alone, and the trainer still scores it.
- **Opening:** a single click on tick 1, then two clicks on every tick after (wiki pattern).
- **Success per tick:** both clicks in the same window, and the prayer is on at the start of the next tick.
- **Scoring:** % of ticks flicked correctly, longest streak, points saved compared with leaving the prayer on.

### 5.2 1-tick flick: single prayer in the prayer book
- The same as 5.1, but clicking a specific prayer icon in the prayer tab, such as Protect from Melee.
- Optional "stacked" variant: flick protection plus an offensive prayer through quick-prayers.

### 5.3 Lazy flicking
- A simulated monster attacks on a fixed interval (configurable: 4-tick, 5-tick, 6-tick and so on).
- **Presets:**
  - **Starter (wiki-recommended):** 4-tick melee monster with a 4-tick weapon, modelled on a Mutated Bloodveld. It isn't aggressive and its hits are accurate, so mistakes are obvious.
  - 4-tick weapon vs. 6-tick monster.
  - Ranged and magic attackers.
  - Delayed-check bosses (`delayed(n)`, `projectileArrival`).
- The attack animation start is the cue. The hitsplat appears later, as in the game, so players learn to react to the animation, not the damage.
- **Goal:** the protection prayer is active at the start of the tick the monster's `prayerCheck` happens, and off otherwise.
- **Scoring:** hits blocked vs. taken, ticks the prayer was on unnecessarily, points spent compared with leaving it on.

### 5.4 Offensive flicking
- The player has a weapon with a configurable attack speed (e.g. 4-tick, 5-tick).
- **Goal:** the offensive prayer (Piety/Rigour/Augury/Zeal etc.) is active at the start of the tick your attack animation begins, and off otherwise.
- Visual cue: the XP drop and the prayer icon appear together on a correctly flicked attack, as in the game.
- **Combined drills (offence + protection):** 4-tick weapon vs. 4-tick monster (both prayers on the same tick), and 4-tick weapon vs. 6-tick monster (the prayers fall on different ticks).
- **Scoring:** attacks boosted vs. unboosted, wasted active ticks.

### 5.5 Prayer switching (OSRS-style interface)
- A full OSRS-style layout: side panel with tabs (prayer, inventory, combat, equipment at least), the prayer book and the orbs.
- Monsters or scripted encounters attack with mixed styles. Telegraphs (animation colour, projectile type) show the incoming style.
- **Presets:**
  - Simple random alternation, melee/range/mage
  - Jad-style (one attacker, two styles, telegraphed by animation, `delayed(n)` check so there's time to react)
  - Multi-attacker waves (Inferno-style ordering drills)
  - Aggressive multi-combat crowd: only 1-tick flicking protects you without draining points
- Tabs must be switched with the player's own F-key binds. Being on the wrong tab costs real time, as in the game.
- **Scoring:** correct prayer at the hit tick, reaction time from telegraph to correct prayer, unnecessary tab switches or clicks.

### 5.6 Freeplay sandbox
- Pick any prayers and see the live drain rate (seconds per point, points per minute), so stacking costs are obvious.
- A drain calculator panel: choose prayers and bonus, and see the result.

---

## 6. Feedback system (highest priority)

### 6.1 Live, per input
- **Timing offset:** each click's ms offset from the tick start (e.g. "+87ms"). The pair's gap is shown too.
- **Tick timeline:** a scrolling strip with one cell per tick, coloured:
  - green: correct (on at boundary, no drain)
  - amber: on at boundary but drained (missed the off/on pair)
  - red: off at boundary (protection or bonus lost)
  - grey: intentionally off (lazy and offensive modes)
- Click markers drawn inside each tick cell so the player sees where in the 600ms they clicked.
- Short text callouts for common errors: "Clicks split across ticks", "Late: off-click after boundary", "Only one click".

### 6.2 Session summary
- Accuracy %, longest streak, total ticks.
- **Timing histogram:** distribution of first-click and second-click offsets within the tick.
- Mean and standard deviation of offsets (consistency score).
- Points drained compared with the no-flick baseline and the perfect-flick baseline.
- Most common error type, with one actionable tip for it.
- Mode-specific stats: blocked hits, boosted attacks, reaction time.

### 6.3 Progress over time
- Saved locally: session history per mode, trend charts of accuracy and consistency, personal bests.
- Optional export/import as JSON.

---

## 7. Keybinds and input

- Every action can be rebound: the quick-prayer orb, each side-panel tab, and optionally individual prayers (for players who use RuneLite plugins or custom binds).
- Tab binds default to F-keys but accept any key. A conflict warning appears if two actions share a key.
- Mouse input is supported everywhere. The orb and prayer icons are clickable.
- An option to show the keybind label on screen during drills (helps while learning a new layout).
- Binds are saved in `localStorage` with an export/import code so players can share or back up their setup.
- Input handling uses `keydown` (with auto-repeat ignored) and `pointerdown`, not `click`, to avoid added latency.

---

## 8. UI and visual design

- **Flick drills (5.1–5.4):** a clean, minimal layout focused on the metronome, the orb, the timeline and stats. OSRS styling is optional.
- **Switching drills (5.5):** a faithful OSRS-style interface. Recreate the look (stone panel textures, orb shape, prayer icon layout, hitsplats) with original art or CSS/SVG. **Do not ship ripped Jagex assets.**
- Accessibility: colour-blind safe palette for timeline states (use shape or pattern as well as colour). Metronome volume and pitch are adjustable.
- Settings: prayer bonus, starting prayer points, latency offset, metronome options, theme.

---

## 9. Leaderboard

- **Boards** per mode and difficulty, e.g. "1-tick quick-prayer: Blind, 60s run".
- **Ranked runs** use fixed, standardised settings (duration, bonus, latency 0) so scores are comparable.
- **Ranked metrics:** accuracy %, then longest streak as tie-breaker. Switching drills rank by correct switches and mean reaction time.
- **Identity:** a display name on submit, no account in v1. An optional RSN field (unverified).
- **Anti-cheat (basic):** the server checks submitted input logs (timestamps) by replaying them through the same engine. Reject runs with impossible input rates.
- **Backend options:** Supabase/Firebase, or a small Node/Edge API with SQLite/Postgres. Decide during implementation.
- Views: global top 100, your rank, and friends via a shared "group code".

---

## 10. Technical approach (suggested)

- **Stack:** TypeScript, with React or Svelte + Vite.
- **Engine:** a pure, framework-free module (`engine/`) holding the tick clock, input queue, drain bucket and prayer state. Unit-tested and deterministic: given an input log and a seed, it produces the same output. The same engine is reused for server-side replay validation.
- **Timing:** schedule ticks from `performance.now()` with drift correction, not chained `setTimeout`. Render with `requestAnimationFrame`. Use the Web Audio API for sample-accurate metronome clicks.
- **Data:** a prayer table in `data/prayers.ts` (§4.6) and monster/encounter presets in `data/encounters.ts`.
- **Persistence:** `localStorage` for settings, keybinds and history. A backend only for the leaderboard.

```
src/
  engine/        tick clock, drain model, prayer state, scoring
  data/          prayers.ts, encounters.ts
  modes/         oneTick/, lazy/, offensive/, switching/, sandbox/
  ui/            metronome, timeline, orb, prayerBook, osrsPanel/
  feedback/      live callouts, summary, histograms, history
  settings/      keybinds, preferences
  leaderboard/   api client, views
```

---

## 11. Milestones

| # | Scope | Done when |
|---|---|---|
| M1 | Engine + 1-tick quick-prayer drill + live timeline + session summary | Engine unit tests pass for every failure mode in §4.4, and the drill is playable at all four difficulties |
| M2 | Keybind system + settings + local history/progress | All actions rebindable and binds persist; trend charts render |
| M3 | Lazy and offensive flicking drills + sandbox/drain calculator | Calculator output matches the §4.2 formula; encounter presets work |
| M4 | OSRS-style interface + prayer switching drills | Tabs bound to user keys; Jad-style and multi-attacker presets playable |
| M5 | Leaderboard (ranked runs, replay validation) | Submissions validated server-side; boards per mode and difficulty |

---

## 12. Acceptance criteria (engine)

- [ ] Prayer left on continuously drains at exactly `0.6 × resistance / totalDrain` seconds per point, over a 10-minute simulated run.
- [ ] A perfect 1-tick flick input log (off+on inside every window) drains 0 points and the prayer is active at every boundary.
- [ ] A pair crossing a boundary marks that tick "off at boundary".
- [ ] A single click per window results in drain on the following tick.
- [ ] Stacked prayers drain using the summed effect, and more than one point can be removed in a single tick when the counter allows.
- [ ] Exclusivity groups disable conflicting prayers on activation.
- [ ] Measured tick jitter in the browser stays under ±5ms over 5 minutes on a mid-range machine.

## 13. Open questions

1. Optional: run the full 6-minute Test 1 to confirm `resetDrainCounterOnAllOff = false`.
2. Leaderboard backend choice and hosting.
3. Should ranked runs allow audio metronome, or only blind mode for top boards?
4. How closely should switching encounters copy specific bosses' attack patterns and timings? (The `delayed(n)` values for Jad, Nightmare and Verzik need sourcing.)
