// Turn an encounter into a deterministic list of attack events.

import type { Encounter, PrayerCheck, Style } from '../data/encounters';

export interface AttackEvent {
  attacker: number;
  style: Style;
  /** Tick the attack animation starts (the cue). */
  animTick: number;
  /** Tick whose start must have the right prayer active. */
  checkTick: number;
  /** Tick the hitsplat appears. */
  hitTick: number;
}

export interface PlayerAttack {
  animTick: number;
}

/** mulberry32: small seeded PRNG so a seed always replays the same encounter. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function checkOffset(check: PrayerCheck): number {
  switch (check.kind) {
    case 'animationStart':
      return 0;
    case 'delayed':
      return check.n;
    case 'projectileArrival':
      return check.travel;
  }
}

/** Build all attacks whose animation starts in [startTick, endTick). */
export function buildSchedule(enc: Encounter, startTick: number, endTick: number, seed: number) {
  const rand = rng(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const attacks: AttackEvent[] = [];

  enc.attackers.forEach((a, i) => {
    let tick = startTick + a.firstAttack;
    const offset = checkOffset(a.check);
    while (tick < endTick) {
      const style = pick(a.styles);
      const checkTick = tick + offset;
      // Hitsplats appear after the check, never on the animation tick itself.
      attacks.push({ attacker: i, style, animTick: tick, checkTick, hitTick: Math.max(checkTick, tick + 1) });
      tick += Array.isArray(a.speed) ? pick(a.speed) : a.speed;
    }
  });

  const playerAttacks: PlayerAttack[] = [];
  if (enc.weapon) {
    for (let tick = startTick + 2; tick < endTick; tick += enc.weapon.speed) playerAttacks.push({ animTick: tick });
  }

  attacks.sort((x, y) => x.checkTick - y.checkTick || x.attacker - y.attacker);
  return { attacks, playerAttacks };
}
