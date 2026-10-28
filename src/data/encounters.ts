// Monster and encounter presets (PRD §5). Delay values for boss-style checks are
// approximations pending sourcing (PRD §13, open question 4).

import type { PrayerId } from './prayers';

export type Style = 'melee' | 'ranged' | 'magic';

export type PrayerCheck =
  | { kind: 'animationStart' }
  | { kind: 'delayed'; n: number }
  | { kind: 'projectileArrival'; travel: number };

export interface Attacker {
  name: string;
  styles: Style[];
  /** Attack speed in ticks. An array means variable speed, picked per attack. */
  speed: number | number[];
  check: PrayerCheck;
  /** Tick of the first attack animation, relative to the encounter start. */
  firstAttack: number;
}

export interface Weapon {
  name: string;
  speed: number;
  prayer: PrayerId;
}

export interface Encounter {
  id: string;
  name: string;
  description: string;
  attackers: Attacker[];
  weapon?: Weapon;
  approximate?: boolean;
}

export const PROTECT_FOR: Record<Style, PrayerId> = {
  melee: 'protectFromMelee',
  ranged: 'protectFromMissiles',
  magic: 'protectFromMagic',
};

export const STYLE_LABEL: Record<Style, string> = { melee: 'Melee', ranged: 'Ranged', magic: 'Magic' };

const melee = (name: string, speed: number | number[], firstAttack = 0): Attacker => ({
  name, styles: ['melee'], speed, check: { kind: 'animationStart' }, firstAttack,
});

export const LAZY_PRESETS: Encounter[] = [
  {
    id: 'starter',
    name: 'Starter: 4-tick bloodveld-style',
    description: 'Wiki-recommended starter. A 4-tick melee monster that never misses, so mistakes are obvious.',
    attackers: [melee('Bloodveld-style', 4)],
  },
  {
    id: 'six-tick',
    name: '6-tick melee brute',
    description: 'A slow 6-tick melee attacker. More time between attacks, but you must hold the rhythm longer.',
    attackers: [melee('Brute', 6)],
  },
  {
    id: 'ranger',
    name: 'Ranged attacker (5-tick)',
    description: 'Arrows check when the animation starts, just like melee.',
    attackers: [{ name: 'Archer', styles: ['ranged'], speed: 5, check: { kind: 'animationStart' }, firstAttack: 0 }],
  },
  {
    id: 'mager',
    name: 'Magic attacker (5-tick)',
    description: 'A caster on a 5-tick cycle.',
    attackers: [{ name: 'Caster', styles: ['magic'], speed: 5, check: { kind: 'animationStart' }, firstAttack: 0 }],
  },
  {
    id: 'delayed',
    name: 'Delayed-check boss (check 3 ticks after animation)',
    description: 'Jad-style timing: the prayer is checked a few ticks after the animation starts, so you can react to it.',
    attackers: [{ name: 'Boss', styles: ['magic'], speed: 8, check: { kind: 'delayed', n: 3 }, firstAttack: 0 }],
    approximate: true,
  },
  {
    id: 'projectile',
    name: 'Projectile-arrival boss',
    description: 'The prayer is checked when the projectile lands (2 ticks of travel).',
    attackers: [{ name: 'Projectile boss', styles: ['ranged'], speed: 6, check: { kind: 'projectileArrival', travel: 2 }, firstAttack: 0 }],
    approximate: true,
  },
  {
    id: 'variable',
    name: 'Variable speed (cave horror-style)',
    description: 'Attack speed varies between 3 and 5 ticks. Lazy flicking is unreliable here; 1-tick flicking always works.',
    attackers: [melee('Horror', [3, 4, 5])],
  },
];

export const OFFENSIVE_PRESETS: Encounter[] = [
  {
    id: 'off-4',
    name: 'Offence only: 4-tick weapon',
    description: 'Flick Piety on for each of your attacks.',
    attackers: [],
    weapon: { name: '4-tick weapon', speed: 4, prayer: 'piety' },
  },
  {
    id: 'off-5',
    name: 'Offence only: 5-tick weapon',
    description: 'Flick Rigour on for each of your attacks.',
    attackers: [],
    weapon: { name: '5-tick weapon', speed: 5, prayer: 'rigour' },
  },
  {
    id: 'combo-4-4',
    name: 'Combined: 4-tick weapon vs 4-tick monster',
    description: 'Both prayers land on the same tick. Use quick-prayers set to both.',
    attackers: [melee('Monster', 4, 0)],
    weapon: { name: '4-tick weapon', speed: 4, prayer: 'piety' },
  },
  {
    id: 'combo-4-6',
    name: 'Combined: 4-tick weapon vs 6-tick monster',
    description: 'The prayers fall on different ticks. Flick each separately.',
    attackers: [melee('Monster', 6, 1)],
    weapon: { name: '4-tick weapon', speed: 4, prayer: 'piety' },
  },
];

export const SWITCHING_PRESETS: Encounter[] = [
  {
    id: 'alternate',
    name: 'Random alternation',
    description: 'One attacker, random style each attack. Checked 2 ticks after the animation.',
    attackers: [{ name: 'Shifter', styles: ['melee', 'ranged', 'magic'], speed: 5, check: { kind: 'delayed', n: 2 }, firstAttack: 0 }],
  },
  {
    id: 'jad',
    name: 'Jad-style',
    description: 'One attacker, magic or ranged, telegraphed by animation. Checked 3 ticks after the animation.',
    attackers: [{ name: 'Volcanic beast', styles: ['magic', 'ranged'], speed: 8, check: { kind: 'delayed', n: 3 }, firstAttack: 0 }],
    approximate: true,
  },
  {
    id: 'waves',
    name: 'Multi-attacker wave',
    description: 'A mage, a ranger and a melee attacker on different cycles. Prioritise the next projectile to land.',
    attackers: [
      { name: 'Mage', styles: ['magic'], speed: 6, check: { kind: 'projectileArrival', travel: 3 }, firstAttack: 0 },
      { name: 'Ranger', styles: ['ranged'], speed: 6, check: { kind: 'projectileArrival', travel: 2 }, firstAttack: 2 },
      { name: 'Melee', styles: ['melee'], speed: 6, check: { kind: 'delayed', n: 1 }, firstAttack: 4 },
    ],
    approximate: true,
  },
  {
    id: 'crowd',
    name: 'Aggressive crowd',
    description: 'Several melee attackers with variable speeds. Only 1-tick flicking protects you without draining points.',
    attackers: [
      melee('Brawler A', [4, 5, 6], 0),
      melee('Brawler B', [4, 5, 6], 1),
      melee('Brawler C', [4, 5, 6], 3),
    ],
  },
];
