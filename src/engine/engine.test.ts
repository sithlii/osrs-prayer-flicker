import { describe, expect, it } from 'vitest';
import { PrayerEngine, continuousDrain } from './engine';
import { classifyOneTick } from './scoring';
import { TICK_MS, secondsPerPoint } from './config';
import type { PrayerId } from '../data/prayers';

const T = TICK_MS;
const quick = (eng: PrayerEngine, t: number) => eng.input({ kind: 'quick' }, t);
const toggle = (eng: PrayerEngine, prayer: PrayerId, t: number) => eng.input({ kind: 'toggle', prayer }, t);

/** Opening click in tick 0, then an off-on pair at the given offsets in every later tick. */
function perfectFlicks(eng: PrayerEngine, ticks: number, first = 100, second = 250) {
  quick(eng, 50);
  for (let k = 1; k < ticks; k++) {
    quick(eng, k * T + first);
    quick(eng, k * T + second);
  }
  return eng.advanceTo(ticks * T);
}

describe('drain formula', () => {
  it('matches §4.2 examples', () => {
    expect(secondsPerPoint(36, 0)).toBeCloseTo(1.0);
    expect(secondsPerPoint(36, 20)).toBeCloseTo(1.667, 2);
  });

  it.each([
    [['thickSkin'], 0],
    [['protectFromMelee'], 0],
    [['piety'], 15],
    [['protectFromMelee', 'piety'], 0],
    [['protectFromMelee', 'piety'], 20],
  ] as [PrayerId[], number][])('continuous %j at +%i drains at the formula rate over 10 minutes', (prayers, bonus) => {
    const ticks = 1000; // 10 minutes
    const eng = new PrayerEngine({ prayerBonus: bonus, prayerPoints: 10_000, quickPrayers: prayers });
    quick(eng, 0);
    eng.advanceTo(ticks * T);
    const total = prayers.reduce((s, id) => s + ({ thickSkin: 1, protectFromMelee: 12, piety: 24 } as Record<string, number>)[id], 0);
    const expected = (ticks * T) / 1000 / secondsPerPoint(total, bonus);
    // First tick is free, and strict ">" delays the first point by at most one point.
    expect(10_000 - eng.points).toBeGreaterThanOrEqual(Math.floor(expected) - 1);
    expect(10_000 - eng.points).toBeLessThanOrEqual(Math.ceil(expected));
  });

  it('removes 2 points in one tick when drain per tick exceeds twice resistance', () => {
    // Resistance 20 (bonus -20) and Piety + Protect from Melee = 36 → >1 point most ticks; with
    // stacked drain 43 (> 2 × 20) every drained tick removes at least 2.
    const eng = new PrayerEngine({
      prayerPoints: 99,
      prayerBonus: -20,
      quickPrayers: ['piety', 'protectFromMelee', 'protectItem', 'rapidHeal', 'preserve', 'rapidRestore'],
    });
    quick(eng, 0);
    const [first, second] = eng.advanceTo(2 * T);
    expect(first.pointsLost).toBe(0); // activation tick is free
    expect(second.drainEffect).toBe(43);
    expect(second.pointsLost).toBe(2);
  });
});

describe('1-tick flicking', () => {
  it('a perfect flick log drains 0 and is active at every boundary', () => {
    const eng = new PrayerEngine({ quickPrayers: ['piety'] });
    const results = perfectFlicks(eng, 200);
    expect(eng.points).toBe(99);
    expect(results.every((r) => r.active.includes('piety'))).toBe(true);
    expect(results.every((r) => classifyOneTick(r, ['piety']).status === 'correct')).toBe(true);
  });

  it('models the single opening click', () => {
    const eng = new PrayerEngine({ quickPrayers: ['protectFromMelee'] });
    quick(eng, 300);
    const [r] = eng.advanceTo(T);
    expect(r.active).toEqual(['protectFromMelee']);
    expect(r.free).toEqual(['protectFromMelee']);
    expect(classifyOneTick(r, ['protectFromMelee']).status).toBe('correct');
  });

  it('a pair crossing a boundary marks that tick off at boundary', () => {
    const eng = new PrayerEngine({ quickPrayers: ['protectFromMelee'] });
    quick(eng, 50); // on in tick 0
    quick(eng, T + 580); // off in tick 1
    quick(eng, 2 * T + 20); // on in tick 2
    const results = eng.advanceTo(3 * T);
    const v2 = classifyOneTick(results[1], ['protectFromMelee']);
    expect(results[1].tick).toBe(2);
    expect(results[1].active).toEqual([]);
    expect(v2.status).toBe('off');
    expect(v2.error).toBe('late');
  });

  it('two clicks from off (split pair) are flagged as split', () => {
    const eng = new PrayerEngine({ quickPrayers: ['protectFromMelee'] });
    quick(eng, T + 580); // tick 1: on (pair's first click slipped late into... previous state off)
    quick(eng, T + 590);
    const results = eng.advanceTo(2 * T);
    const v = classifyOneTick(results[1], ['protectFromMelee']);
    expect(v.status).toBe('off');
    expect(v.error).toBe('split');
  });

  it('a single click per window drains on the following tick', () => {
    const eng = new PrayerEngine({ quickPrayers: ['piety'], prayerBonus: -15 }); // resistance 30
    quick(eng, 100); // on in tick 0 (free at boundary 1)
    const results = eng.advanceTo(3 * T); // no clicks in ticks 1-2
    expect(results[0].free).toEqual(['piety']);
    expect(results[1].drainEffect).toBe(24);
    expect(classifyOneTick(results[1], ['piety']).status).toBe('drained');
    expect(classifyOneTick(results[1], ['piety']).error).toBe('noInputDrain');
  });

  it('three or more clicks are flagged as extra input; final state decides', () => {
    const eng = new PrayerEngine({ quickPrayers: ['piety'] });
    quick(eng, 100);
    quick(eng, T + 100);
    quick(eng, T + 200);
    quick(eng, T + 300);
    quick(eng, T + 400);
    const results = eng.advanceTo(2 * T);
    const v = classifyOneTick(results[1], ['piety']);
    expect(v.status).toBe('correct');
    expect(v.error).toBe('extra');
  });

  it('activationTickIsFree=false makes flicking drain like leaving it on', () => {
    const eng = new PrayerEngine({ quickPrayers: ['piety'], config: { activationTickIsFree: false } });
    perfectFlicks(eng, 100);
    expect(99 - eng.points).toBeGreaterThanOrEqual(continuousDrain(['piety'], 100));
    expect(99 - eng.points).toBeGreaterThan(35);
  });

  it('latency shifts the effective boundary', () => {
    const eng = new PrayerEngine({ quickPrayers: ['piety'], latencyMs: 100 });
    const rec = quick(eng, 550);
    expect(rec.tick).toBe(1);
    expect(rec.offset).toBe(50);
  });

  it('late-arriving inputs fold into the open window', () => {
    const eng = new PrayerEngine({ quickPrayers: ['piety'] });
    eng.advanceTo(T);
    const rec = quick(eng, 590);
    expect(rec.late).toBe(true);
    expect(rec.tick).toBe(1);
  });
});

describe('lazy flicking', () => {
  it('on just before the needed tick, off within the next, costs nothing', () => {
    const eng = new PrayerEngine({ quickPrayers: ['protectFromMelee'] });
    for (let attack = 4; attack < 400; attack += 4) {
      toggle(eng, 'protectFromMelee', (attack - 1) * T + 400); // on in tick before the check
      toggle(eng, 'protectFromMelee', attack * T + 200); // off during the check tick
    }
    const results = eng.advanceTo(401 * T);
    expect(eng.points).toBe(99);
    for (let attack = 4; attack < 400; attack += 4) {
      expect(results.find((r) => r.tick === attack)!.active).toContain('protectFromMelee');
    }
  });
});

describe('drain counter persistence', () => {
  // Stopwatch test 1 (§4.5): Thick Skin 20s on / 10s off for 6 minutes.
  function run(reset: boolean, bonus = 0) {
    const eng = new PrayerEngine({ config: { resetDrainCounterOnAllOff: reset }, prayerBonus: bonus });
    for (let cycle = 0; cycle < 12; cycle++) {
      const start = cycle * 50 * T;
      toggle(eng, 'thickSkin', start + 10);
      toggle(eng, 'thickSkin', start + 33 * T + 10);
    }
    eng.advanceTo(600 * T);
    return 99 - eng.points;
  }

  it('reset=true never loses a point', () => {
    expect(run(true)).toBe(0);
  });

  it('reset=false loses about 400/(60+2b) points', () => {
    expect(run(false)).toBeGreaterThanOrEqual(5);
    expect(run(false)).toBeLessThanOrEqual(7);
    expect(run(false, 20)).toBe(3);
  });
});

describe('exclusivity', () => {
  it('turning on a prayer disables conflicting ones', () => {
    const eng = new PrayerEngine();
    toggle(eng, 'protectFromMelee', 10);
    toggle(eng, 'piety', 20);
    toggle(eng, 'protectFromMagic', 30); // replaces melee overhead
    toggle(eng, 'thickSkin', 40); // replaces Piety via the defence group
    toggle(eng, 'burstOfStrength', 50);
    toggle(eng, 'clarityOfThought', 60); // attack + strength coexist
    const [r] = eng.advanceTo(T);
    expect(new Set(r.active)).toEqual(new Set(['protectFromMagic', 'thickSkin', 'burstOfStrength', 'clarityOfThought']));
  });

  it('offensive styles are mutually exclusive', () => {
    const eng = new PrayerEngine();
    toggle(eng, 'burstOfStrength', 10);
    toggle(eng, 'sharpEye', 20);
    let [r] = eng.advanceTo(T);
    expect(r.active).toEqual(['sharpEye']);
    toggle(eng, 'augury', T + 10);
    [r] = eng.advanceTo(2 * T);
    expect(r.active).toEqual(['augury']);
  });
});

describe('determinism', () => {
  it('the same input log produces the same output', () => {
    const log = Array.from({ length: 300 }, (_, i) => i * 211.7 + (i % 7) * 13);
    const run = () => {
      const eng = new PrayerEngine({ quickPrayers: ['piety', 'protectFromMelee'] });
      log.forEach((t) => quick(eng, t));
      return JSON.stringify(eng.advanceTo(200 * T));
    };
    expect(run()).toBe(run());
  });
});
