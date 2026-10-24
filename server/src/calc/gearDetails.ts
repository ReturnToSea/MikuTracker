import { doubleStatStep, type FlameStat, flamePool, flameTiers, hpStep, singleStatStep, weaponAttFlame } from "../gameFigures/flames";
import { STARLESS_KINDS } from "../gameFigures/gear";
import { BRACKETS, EARLY, levelStarLimit } from "../gameFigures/starForce";

// What stars, flames and hammers add to an item. Pure: the item comes in, the numbers go out.

export interface DetailItem {
  slot: string; // the kind of slot ("hat", "weapon", …)
  level: number;
  stats: Partial<Record<"str" | "dex" | "int" | "luk" | "att" | "matt", number>>; // its own stats
  classStats: MainStat[]; // the main stats its class requirement covers (all four for anyone's)
  starMin: number;
  starMax: number;
  flames: "boss" | "normal" | null; // null: it can't have flames
  typed?: true; // a typed "Other item": its own stats aren't known
}

export type MainStat = "str" | "dex" | "int" | "luk";
export const MAIN_STATS: MainStat[] = ["str", "dex", "int", "luk"];
export interface Gains {
  str: number;
  dex: number;
  int: number;
  luk: number;
  hp: number;
  mp: number;
  att: number;
  matt: number;
  speed: number;
  jump: number;
}
export const noGains = (): Gains => ({ str: 0, dex: 0, int: 0, luk: 0, hp: 0, mp: 0, att: 0, matt: 0, speed: 0, jump: 0 });

// Class stats by branch (StrategyWiki: a job's primary and secondary stats; Thief items don't get STR).
const BRANCH_STATS: Record<string, MainStat[]> = { Warrior: ["str", "dex"], Magician: ["int", "luk"], Bowman: ["dex", "str"], Thief: ["luk", "dex"], Pirate: ["str", "dex"] };
export function classStatsOf(branches: string[] | null): MainStat[] {
  if (!branches || branches.length === 0) return [...MAIN_STATS];
  const set = new Set(branches.flatMap((b) => BRANCH_STATS[b] ?? MAIN_STATS));
  return MAIN_STATS.filter((s) => set.has(s));
}

const isWeaponLike = (slot: string) => slot === "weapon" || slot === "secondary"; // secondaries: masonym (unconfirmed)
const NO_STAR_HP = new Set(["gloves", "shoes", "face", "eye"]);

// The stars an item can be set to: from its minimum (22 on Genesis and Destiny weapons) to its limit.
export const starRange = (item: DetailItem): [number, number] => [Math.min(item.starMin, item.starMax), item.starMax];

// What `stars` stars add in all.
export function starGains(item: DetailItem, stars: number): Gains {
  const out = noGains();
  const weapon = isWeaponLike(item.slot);
  // 16★–22★ add the stats the item shows (a typed item's aren't known: its class stats)
  const shown = item.typed ? item.classStats : MAIN_STATS.filter((s) => (item.stats[s] ?? 0) > 0);
  const bracket = [...BRACKETS].reverse().find((b) => item.level >= b.from);
  let att = item.stats.att ?? 0;
  let matt = item.stats.matt ?? 0;
  for (let star = 1; star <= stars; star += 1) {
    if (star <= 15) {
      const i = star - 1;
      for (const s of item.classStats) out[s] += EARLY.stat[i]!;
      if (weapon) {
        out.hp += EARLY.weaponHp[i]!;
        out.mp += EARLY.weaponHp[i]!;
        // +1 + 2% of the attack so far, rounded down, compounding (only an attack the weapon has)
        if (att > 0) {
          const add = 1 + Math.floor((att * EARLY.weaponAttPercent) / 100);
          att += add;
          out.att += add;
        }
        if (matt > 0) {
          const add = 1 + Math.floor((matt * EARLY.weaponAttPercent) / 100);
          matt += add;
          out.matt += add;
        }
      } else if (!NO_STAR_HP.has(item.slot)) out.hp += EARLY.armorHp[i]!;
      if (item.slot === "shoes") {
        out.speed += EARLY.shoesSpeed[i]!;
        out.jump += EARLY.shoesSpeed[i]!;
      }
      if (item.slot === "gloves" && (EARLY.glovesAttStars as readonly number[]).includes(star)) {
        if ((item.stats.att ?? 0) > 0) out.att += 1;
        if ((item.stats.matt ?? 0) > 0) out.matt += 1;
      }
    } else if (bracket) {
      if (star <= 22) for (const s of shown) out[s] += bracket.stat;
      const table = weapon ? bracket.weaponAtt : bracket.armorAtt;
      const add = table[star - 16] ?? 0;
      // weapons: only an attack they have (the wiki); armor and accessories: both
      if (!weapon || (item.stats.att ?? 0) > 0) out.att += add;
      if (!weapon || (item.stats.matt ?? 0) > 0) out.matt += add;
    }
  }
  return out;
}

// Whether a weapon star's figure isn't confirmed by any source (masonym's guesses).
export function starUnconfirmed(item: DetailItem, star: number): boolean {
  return star >= (unconfirmedFrom(item) ?? Infinity);
}

// The first star whose figure no source confirms, if the item can reach it (else null).
export function unconfirmedFrom(item: DetailItem): number | null {
  if (!isWeaponLike(item.slot)) return null;
  const from = [...BRACKETS].reverse().find((b) => item.level >= b.from)?.weaponUnconfirmedFrom ?? Infinity;
  return from <= item.starMax ? from : null;
}

// A typed "Other item"'s star limit: by its level, none for the kinds of item that can't take stars.
export const otherStarLimit = (slot: string, level: number): number => (STARLESS_KINDS.has(slot) ? 0 : levelStarLimit(level));

// The flame grid: each stat the item can roll, with its value at each tier (null where the tier
// can't be rolled). Two-stat lines add the value to both stats.
export interface FlameRow {
  stat: FlameStat;
  values: (number | null)[]; // tiers 1–7
}
export function flameGrid(item: DetailItem): FlameRow[] {
  if (!item.flames) return [];
  const weapon = item.slot === "weapon";
  const [low, high] = flameTiers(item.flames === "boss");
  // a weapon's attack and magic attack flames are a share of its own; one it doesn't have uses the
  // other (unconfirmed: no source says)
  const att = item.stats.att || item.stats.matt || 0;
  const matt = item.stats.matt || item.stats.att || 0;
  const step: (stat: FlameStat, tier: number) => number = (stat, tier) => {
    if (stat.includes("+")) return doubleStatStep(item.level) * tier;
    if (stat === "STR" || stat === "DEX" || stat === "INT" || stat === "LUK" || stat === "Defense") return singleStatStep(item.level) * tier;
    if (stat === "Max HP" || stat === "Max MP") return hpStep(item.level) * tier;
    if (stat === "Req. level") return -5 * tier;
    if (stat === "Boss damage %") return 2 * tier;
    if (weapon && stat === "ATT") return weaponAttFlame(att, item.level, tier, item.flames === "boss");
    if (weapon && stat === "M. ATT") return weaponAttFlame(matt, item.level, tier, item.flames === "boss");
    return tier; // attack and magic attack on other items, damage %, all stats %, speed, jump
  };
  return flamePool(weapon, item.level).map((stat) => ({ stat, values: [1, 2, 3, 4, 5, 6, 7].map((t) => (t >= low && t <= high ? step(stat, t) : null)) }));
}
