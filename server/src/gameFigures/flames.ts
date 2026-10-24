// Flames (bonus stats). Values: the MapleStory Wiki's "Bonus Stats/Stat Tables" (every level bracket);
// which stats each kind of item can roll, and the level rules: Nexon Korea's official page
// (maplestory.nexon.com/Guide/OtherProbability/game/gameAddOption: each option equally likely; boss
// items two tiers higher, tiers 3–7, always 4 lines). Checked against mafhcow's flame calculator
// (js/flameEngine.js: the same values, and weapon attack rounded up). Read 2026-10-24.

export const FLAME_STATS = ["STR", "DEX", "INT", "LUK", "STR+DEX", "STR+INT", "STR+LUK", "DEX+INT", "DEX+LUK", "INT+LUK", "Max HP", "Max MP", "Req. level", "Defense", "ATT", "M. ATT", "Boss damage %", "Damage %", "All Stats %", "Speed", "Jump"] as const;
export type FlameStat = (typeof FLAME_STATS)[number];

// What a weapon can roll, and what anything else can (Nexon's two lists, in its order).
const WEAPON_POOL: FlameStat[] = ["STR", "DEX", "INT", "LUK", "STR+DEX", "STR+INT", "STR+LUK", "DEX+INT", "DEX+LUK", "INT+LUK", "Max HP", "Max MP", "Req. level", "Defense", "ATT", "M. ATT", "Boss damage %", "Damage %", "All Stats %"];
const OTHER_POOL: FlameStat[] = ["STR", "DEX", "INT", "LUK", "STR+DEX", "STR+INT", "STR+LUK", "DEX+INT", "DEX+LUK", "INT+LUK", "Max HP", "Max MP", "Req. level", "Defense", "ATT", "M. ATT", "Speed", "Jump", "All Stats %"];

// The stats an item can roll: boss damage on weapons only from Lv. 90; attack and magic attack on
// other items only from Lv. 60, all stat % from Lv. 70 (Nexon).
export function flamePool(weapon: boolean, level: number): FlameStat[] {
  if (weapon) return WEAPON_POOL.filter((s) => s !== "Boss damage %" || level >= 90);
  return OTHER_POOL.filter((s) => !((s === "ATT" || s === "M. ATT") && level < 60) && !(s === "All Stats %" && level < 70));
}

// What a Black Flame (GMS's Eternal Rebirth Flame; the same odds) rolls, from Nexon Korea's page: each
// line's tier (boss items two tiers higher: 4–7), and how many lines an item that isn't a boss item gets
// (boss items: always 4). Each line is a different stat, every stat the item can roll equally likely.
// (A reset that comes out exactly like the old flames is rerolled: left out, too small to matter.)
// Read 2026-10-24; mafhcow's and Whackybeanz's calculators use the same figures.
export const BLACK_FLAME_TIERS: readonly [tier: number, chance: number][] = [[2, 0.29], [3, 0.45], [4, 0.25], [5, 0.01]];
export const FLAME_LINES: readonly [lines: number, chance: number][] = [[1, 0.4], [2, 0.4], [3, 0.16], [4, 0.04]];

// The tiers an item can have: boss items 3–7, others 1–5.
export const flameTiers = (boss: boolean): [number, number] => (boss ? [3, 7] : [1, 5]);

// One tier's worth of a stat, by item level (the wiki's brackets):
//   single stats and defense: every 20 levels (1 per tier up to Lv. 19, … 10 at Lv. 180–199), 11 at
//   Lv. 200–229, 12 from Lv. 230;
//   two-stat lines: every 40 levels (1 up to Lv. 39, … 5 at Lv. 160–199), 6 at Lv. 200–249, 7 from 250;
//   Max HP / MP: 3 below Lv. 10, then 30 per 10 levels up to Lv. 199 (570), then 600 at Lv. 200 and
//   +20 per 10 levels to 700 from Lv. 250.
// (At Lv. 200 each next formula gives the same as the step it replaces: ⌊200 ÷ 20⌋ + 1 = 11,
// ⌊200 ÷ 40⌋ + 1 = 6, 20 × 30 = 600; so those boundaries can't be told apart by any value.)
export function singleStatStep(level: number): number {
  if (level >= 230) return 12;
  // Stryker disable next-line EqualityOperator: see above
  if (level >= 200) return 11;
  return Math.floor(level / 20) + 1;
}
export function doubleStatStep(level: number): number {
  if (level >= 250) return 7;
  // Stryker disable next-line EqualityOperator: see above
  if (level >= 200) return 6;
  return Math.floor(level / 40) + 1;
}
export function hpStep(level: number): number {
  if (level < 10) return 3;
  // Stryker disable next-line EqualityOperator: see above
  if (level < 200) return Math.floor(level / 10) * 30;
  return Math.min(700, 600 + Math.floor((level - 200) / 10) * 20);
}

// A weapon's attack (or magic attack) flame: a share of its own attack. Boss weapons:
// (⌊level / 40⌋ + 1) × tier × 1.1^(tier − 3) %; others 1.1^(tier − 1). Rounded up (mafhcow).
export function weaponAttFlame(baseAttack: number, level: number, tier: number, boss: boolean): number {
  const percent = (Math.floor(level / 40) + 1) * tier * 1.1 ** (tier - (boss ? 3 : 1));
  // the tiny subtraction keeps a whole number whole: 250 × 26.4% is 66.00000000000001 in decimal maths
  return Math.ceil((baseAttack * percent) / 100 - 1e-9);
}
