// Prayer table from PRD §4.6 (verified against the OSRS Wiki).

export type PrayerGroup = 'defence' | 'strength' | 'attack' | 'ranged' | 'magic' | 'overhead';

export type PrayerId =
  | 'thickSkin' | 'burstOfStrength' | 'clarityOfThought' | 'sharpEye' | 'mysticWill'
  | 'rockSkin' | 'superhumanStrength' | 'improvedReflexes' | 'rapidRestore' | 'rapidHeal'
  | 'protectItem' | 'hawkEye' | 'mysticLore' | 'steelSkin' | 'ultimateStrength'
  | 'incredibleReflexes' | 'protectFromMagic' | 'protectFromMissiles' | 'protectFromMelee'
  | 'eagleEye' | 'mysticMight' | 'retribution' | 'redemption' | 'smite' | 'preserve'
  | 'chivalry' | 'deadeye' | 'mysticVigour' | 'piety' | 'rigour' | 'augury' | 'zeal';

export interface Prayer {
  id: PrayerId;
  name: string;
  level: number;
  effect: string;
  drain: number;
  overhead: boolean;
  groups: PrayerGroup[];
}

const p = (
  level: number, id: PrayerId, name: string, effect: string, drain: number,
  groups: PrayerGroup[],
): Prayer => ({ id, name, level, effect, drain, overhead: groups.includes('overhead'), groups });

export const PRAYERS: Prayer[] = [
  p(1, 'thickSkin', 'Thick Skin', '+5% Defence', 1, ['defence']),
  p(4, 'burstOfStrength', 'Burst of Strength', '+5% Strength', 1, ['strength']),
  p(7, 'clarityOfThought', 'Clarity of Thought', '+5% Attack', 1, ['attack']),
  p(8, 'sharpEye', 'Sharp Eye', '+5% Ranged attack, +5% Ranged Strength', 1, ['ranged']),
  p(9, 'mysticWill', 'Mystic Will', '+5% Magic Attack and Defence', 1, ['magic']),
  p(10, 'rockSkin', 'Rock Skin', '+10% Defence', 6, ['defence']),
  p(13, 'superhumanStrength', 'Superhuman Strength', '+10% Strength', 6, ['strength']),
  p(16, 'improvedReflexes', 'Improved Reflexes', '+10% Attack', 6, ['attack']),
  p(19, 'rapidRestore', 'Rapid Restore', '2x restore rate for all skills except Hitpoints and Prayer', 1, []),
  p(22, 'rapidHeal', 'Rapid Heal', '2x restore rate for Hitpoints', 2, []),
  p(25, 'protectItem', 'Protect Item', 'Keep one extra item on death', 2, []),
  p(26, 'hawkEye', 'Hawk Eye', '+10% Ranged attack, +10% Ranged Strength', 6, ['ranged']),
  p(27, 'mysticLore', 'Mystic Lore', '+10% Magic Attack and Defence, +1% Magic damage', 6, ['magic']),
  p(28, 'steelSkin', 'Steel Skin', '+15% Defence', 12, ['defence']),
  p(31, 'ultimateStrength', 'Ultimate Strength', '+15% Strength', 12, ['strength']),
  p(34, 'incredibleReflexes', 'Incredible Reflexes', '+15% Attack', 12, ['attack']),
  p(37, 'protectFromMagic', 'Protect from Magic', '100% protection from NPC magic, 40% from players', 12, ['overhead']),
  p(40, 'protectFromMissiles', 'Protect from Missiles', '100% protection from NPC ranged, 40% from players', 12, ['overhead']),
  p(43, 'protectFromMelee', 'Protect from Melee', '100% protection from NPC melee, 40% from players', 12, ['overhead']),
  p(44, 'eagleEye', 'Eagle Eye', '+15% Ranged attack, +15% Ranged Strength', 12, ['ranged']),
  p(45, 'mysticMight', 'Mystic Might', '+15% Magic Attack and Defence, +2% Magic damage', 12, ['magic']),
  p(46, 'retribution', 'Retribution', 'On death, deals up to 25% of base Prayer level to targets in a 3x3 area', 3, ['overhead']),
  p(49, 'redemption', 'Redemption', 'Below 10% HP, heals 25% of base Prayer level and drains all prayer points', 6, ['overhead']),
  p(52, 'smite', 'Smite', "Reduces opponent's prayer by 25% of damage dealt", 18, ['overhead']),
  p(55, 'preserve', 'Preserve', 'Boosted stats last 50% longer', 2, []),
  p(60, 'chivalry', 'Chivalry', '+15% Attack, +18% Strength, +20% Defence', 12, ['attack', 'strength', 'defence']),
  p(62, 'deadeye', 'Deadeye', '+18% Ranged attack, +18% Ranged Strength, +5% Defence', 12, ['ranged', 'defence']),
  p(63, 'mysticVigour', 'Mystic Vigour', '+18% Magic Attack and Defence, +5% Defence, +3% Magic damage', 12, ['magic', 'defence']),
  p(70, 'piety', 'Piety', '+20% Attack, +23% Strength, +25% Defence', 24, ['attack', 'strength', 'defence']),
  p(74, 'rigour', 'Rigour', '+20% Ranged attack, +23% Ranged Strength, +25% Defence', 24, ['ranged', 'defence']),
  p(77, 'augury', 'Augury', '+25% Magic Attack and Defence, +25% Defence, +4% Magic damage', 24, ['magic', 'defence']),
  p(84, 'zeal', 'Zeal', '+25% Attack, +28% Strength, +25% Defence', 24, ['attack', 'strength', 'defence']),
];

export const PRAYER_BY_ID: Record<PrayerId, Prayer> = Object.fromEntries(
  PRAYERS.map((pr) => [pr.id, pr]),
) as Record<PrayerId, Prayer>;

/** Prayers that do nothing when 1-tick flicked (PRD §4.4). */
export const FLICK_USELESS: PrayerId[] = ['preserve', 'rapidHeal'];

export const OFFENSIVE_PRAYERS: PrayerId[] = ['piety', 'rigour', 'augury', 'zeal', 'chivalry', 'deadeye', 'mysticVigour', 'eagleEye', 'mysticMight'];

const STYLE_OF: Partial<Record<PrayerGroup, 'melee' | 'ranged' | 'magic'>> = {
  attack: 'melee', strength: 'melee', ranged: 'ranged', magic: 'magic',
};

function styles(pr: Prayer): Set<string> {
  return new Set(pr.groups.map((g) => STYLE_OF[g]).filter((s): s is 'melee' | 'ranged' | 'magic' => !!s));
}

/** True when turning on `a` must turn off `b` (shared group, or offensive prayers of different styles). */
export function conflicts(a: PrayerId, b: PrayerId): boolean {
  if (a === b) return false;
  const pa = PRAYER_BY_ID[a];
  const pb = PRAYER_BY_ID[b];
  if (pa.groups.some((g) => pb.groups.includes(g))) return true;
  const sa = styles(pa);
  const sb = styles(pb);
  if (sa.size === 0 || sb.size === 0) return false;
  for (const s of sb) if (!sa.has(s)) return true;
  for (const s of sa) if (!sb.has(s)) return true;
  return false;
}
