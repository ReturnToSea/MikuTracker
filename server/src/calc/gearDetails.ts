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
  type?: string; // its equipment type ("Katara", "Shield", …): kataras and Zero's Lapis star like weapons
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

// Class stats by branch: what Star Force raises ("only class-relevant stats": the wiki; masonym gives
// all four to an item any class wears). A job's primary and secondary stats.
const BRANCH_STATS: Record<string, MainStat[]> = { Warrior: ["str", "dex"], Magician: ["int", "luk"], Bowman: ["dex", "str"], Thief: ["luk", "dex"], Pirate: ["str", "dex"] };
export function classStatsOf(branches: string[] | null): MainStat[] {
  if (!branches || branches.length === 0) return [...MAIN_STATS];
  const set = new Set(branches.flatMap((b) => BRANCH_STATS[b] ?? MAIN_STATS));
  return MAIN_STATS.filter((s) => set.has(s));
}

// Which items gain stars like weapons: weapons, and the secondaries that are weapon-like: kataras
// (Nexon's Astra notice: the Astra Blade follows the Arcane Umbra katara's rule) and Zero's Lapis
// (heavy swords). Every other secondary gains like armor (Nexon: Astra secondaries as Lv. 200 armor).
// (Those two types only ever appear on secondaries.)
const WEAPON_LIKE_SECONDARIES = new Set<string | undefined>(["Katara", "Heavy Sword"]);
const isWeaponLike = (item: DetailItem) => item.slot === "weapon" || WEAPON_LIKE_SECONDARIES.has(item.type);
const NO_STAR_HP = new Set(["gloves", "shoes", "face", "eye"]);

// An item level's bracket of 16★+ figures (none below Lv. 128).
const bracketOf = (level: number) => BRACKETS.findLast((b) => level >= b.from);

// The stars an item can be set to: from its minimum (22 on Genesis and Destiny weapons) to its limit.
export const starRange = (item: DetailItem): [number, number] => [Math.min(item.starMin, item.starMax), item.starMax];

// What `stars` stars add in all.
export function starGains(item: DetailItem, stars: number): Gains {
  const out = noGains();
  const weapon = isWeaponLike(item);
  const bracket = bracketOf(item.level);
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
      if (star <= 22) for (const s of item.classStats) out[s] += bracket.stat;
      const table = weapon ? bracket.weaponAtt : bracket.armorAtt;
      const add = table[star - 16] ?? 0;
      // weapons: only an attack they have (the wiki); armor and accessories: both
      if (!weapon || (item.stats.att ?? 0) > 0) out.att += add;
      if (!weapon || (item.stats.matt ?? 0) > 0) out.matt += add;
    }
  }
  return out;
}

// What the page notes about an item's star figures, from the star where it applies (only notes the
// item can reach): the weapon figures nobody has seen, and shoes' speed, where the sources differ by 1.
export interface StarNote {
  from: number;
  text: string;
}
export function starNotes(item: DetailItem): StarNote[] {
  // (a note that doesn't apply starts at "never" and is filtered out with the ones the item can't reach)
  const weapon = (isWeaponLike(item) ? bracketOf(item.level)?.weaponUnconfirmedFrom : undefined) ?? Infinity;
  const shoes = item.slot === "shoes" ? EARLY.shoesSpeedDisputedFrom : Infinity;
  return [
    { from: weapon, text: `From ${weapon}★ this weapon's attack isn't known from any source (nobody stars it that far): masonym's estimate.` },
    { from: shoes, text: `Speed and jump from ${shoes}★: masonym says +2 a star from 11★, the wiki from 12★ (a difference of 1).` },
  ].filter((n) => n.from <= item.starMax);
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
  // other (the owner: a physical weapon's magic attack flame is the same as its attack flame)
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
