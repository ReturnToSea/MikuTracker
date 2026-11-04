import figures from "./stats-jobs.json";

// The Stats page (v4.0.0): MapleScouter's damage formula and score, the game's Final Damage and damage
// range, read 2026-11-03 (research in tempdata/stats/; decided with the owner).
// - Each job's figures (stats-jobs.json, rebuilt by hand with scripts/stats-data.mjs, dated): MapleScouter's
//   per-class constants as chablades/mapledoro measured them (collected before MapleScouter blocked
//   scripts), each class's always-on Final Damage from the game's v.271 skill data, and its weapon
//   multiplier (the MapleStory Wiki's Damage Formula), through mapledoro.
// - The constants below: game figures and MapleScouter's measured buff values, from mapledoro's rebuild
//   (src/features/characters/scouter/engine/scouterEngine.ts; its code has no license: a reference, read
//   as data; the maths is calc/stats.ts, our own).

type Spline = { x: number[]; y: number[]; m: number[] };
export interface StatsJob {
  class: string; // mapledoro's class id
  stat: { hiddenBase: Partial<Record<"main" | "sub" | "ssub", number>>; flat: number; perLevel: number };
  flatAtk: number;
  atkPct: number;
  restraint: { lv4: number; lv5: number };
  dmg: number;
  dmgPerBuffDuration: number;
  crit: number;
  defenseK: number;
  toggles: { isReboot?: number; passiveSkillLevelUp?: number; oneHandSword?: number };
  perCooldownPercent: number;
  perResetChance: number;
  perSummonDuration: number;
  spline300?: Spline;
  spline380?: Spline;
  splineScale: number | null;
  scale: number;
  cooldownScale?: Record<string, number>;
  finalDamage: [number, number, number]; // without, with Decent, with a Paladin's Combat Orders (%)
  weapon: number | { oneHanded: number; twoHanded: number }; // the damage range's weapon multiplier
  magic: boolean; // its range counts Magic ATT
}
export type CooldownRefs = Record<string, { rows: { h0: number; bonus: Record<string, number> }[]; norm2: number }>;

// A job's figures by the name Nexon's rankings use (null: none).
export function statsJob(name: string): StatsJob | null {
  const jobs = figures.jobs as unknown as Record<string, StatsJob>;
  return Object.hasOwn(jobs, name) ? jobs[name]! : null;
}
export const STATS_FIGURES = { generated: figures.generated };
export const statLinks = (): Readonly<Record<string, Readonly<Record<string, number>>>> => figures.links;
export const cooldownRefs = (): CooldownRefs => figures.cooldownRefs as CooldownRefs;

// Each GMS buff's box on MapleScouter's page (chablades/mapledoro's mapping; the last ones aren't
// MapleScouter's: mapledoro's own GMS buffs, valued below by their in-game ATT). The sacred symbol buff
// (authenticDmg) isn't ticked: it's on once every Sacred symbol is maxed (the Symbols page).
export const BUFF_KEY: Readonly<Record<string, string>> = {
  candiedApple: "candy", sayramElixir: "sayram", collectorElixir: "collector", honorableElixir: "buff275", extremePotion: "extreme", sparklingRedStar: "shiningRed", brightMoonlight: "moonshine", heroEcho: "heroesHawl",
  legionMight: "unionsPower", masarayuGift: "urus", caretakerSupport: "house", vipBuff: "additional1", mvpSuperpower: "superPower", genepass: "genePass", enlightenedOne: "enlightenedOne",
  sparklingBlueStar: "shiningBlue", greatHeroBoost: "bigHero", legendaryHero: "legendHero", advWeaponTempering: "jangBi",
  tengusJudgement: "tengu", attackPotionV: "attackPotionV", magicPotionV: "magicPotionV", onyxApple: "apple", energizerDrink: "energizerDrink", energizerDrinkMagic: "energizerDrinkMagic", fishBuff: "fish", witchStew: "witchStew", ssiwsCheese: "ssiwsCheese",
  believeInYourself: "believeInYourself", gourmandPower: "gourmandPower", peerlessMarble: "peerlessMarble",
};
// What each box adds, by group, in the group's own units (MapleScouter's measured values; a box missing
// here had no effect when measured): flat ATT, damage % points, crit damage % points, ATT % points, the
// share of defense ignored (0.2: 20%), base all stats. mapledoro's own: their in-game ATT (Gourmand Power
// +30, the wiki, though its description says +10; The Enlightened One's +5 for 5 of every 20 minutes;
// Ssiws Cheese's +220 for 2 of 20 minutes).
export const BUFF_FLAT_ATT: Readonly<Record<string, number>> = {
  unionsPower: 30, urus: 30, extreme: 30, superPower: 30, legendHero: 30, fish: 30, sayram: 30, additional1: 15, collector: 44, moonshine: 20, tengu: 20, buff275: 60, apple: 100,
  believeInYourself: 20, gourmandPower: 30, enlightenedOne: 1.25, peerlessMarble: 30, ssiwsCheese: 22, witchStew: 40, energizerDrink: 25, energizerDrinkMagic: 30, attackPotionV: 10, magicPotionV: 10,
};
export const BUFF_DMG: Readonly<Record<string, number>> = { additional1: 15, sayram: 10, shiningRed: 20, authenticDmg: 20, house: 15, bigHero: 10, statPotion: 3 };
export const BUFF_CRIT_DMG: Readonly<Record<string, number>> = { sayram: 8, jangBi: 5 };
export const BUFF_ATT_PCT: Readonly<Record<string, number>> = { sayram: 10, heroesHawl: 4 };
export const BUFF_IED: Readonly<Record<string, number>> = { shiningBlue: 0.2, additional1: 0.15 };
// (Candy: nothing on a Demon Avenger; Peerless Marble: STR, DEX, INT and LUK +30)
export const BUFF_ALL_STAT: Readonly<Record<string, number>> = { additional1: 15, collector: 13, candy: 7, peerlessMarble: 30 };
// Demon Avenger only: the base HP some buffs add, and per Champion's Renown All Stats level.
export const DA_BUFF_HP: Readonly<Record<string, number>> = { sayram: 1295, additional1: 1505, collector: 182, moonshine: 2000, extreme: 2000 };
export const DA_HP_PER_CHAMPION_ALL = 490;
// The sacred symbol buff's damage: only against 380% bosses.
export const AUTHENTIC_DMG_PCT = 20;
// Per level: the guild's Boss Slayers (boss), For the Guild! (damage) +2%, Hard Hitter (crit damage)
// +2%, Undeterred (IED) 2%; Champion's Renown Boss +2%, All Stats +10, Crit DMG +0.5%, ATT +5, IED 2%; per
// Wild Hunter Legion rank (Lv. 60 / 100 / 140 / 200 / 250) +0.8% damage; the Magician link: +3% damage
// and 3% IED per 2 levels (rounded up).
export const GUILD_PER_LEVEL = 2;
export const CHAMPION = { boss: 2, allStat: 10, critDmg: 0.5, atk: 5, ied: 0.02 } as const;
export const WILD_HUNTER_RANKS = [60, 100, 140, 200, 250] as const;
export const WILD_HUNTER_DMG = 0.8;
export const MAGICIAN_LINK = { dmg: 3, ied: 0.03 } as const;

// Crit rate turns into crit damage for these (per point of crit rate, 100 at least).
export const CRIT_RATE_TO_CRIT_DMG: Readonly<Record<string, number>> = { bow_master: 0.2425, marksman: 0.235, pathfinder: 0.2817, wind_archer: 0.255, wild_hunter: 0.2678, mercedes: 0.294, kain: 0.263 };
// How much each stat weighs in the stat term (main 4, secondary 1, a third 0), but: Xenon's three alike,
// Demon Avenger's HP 0.8 / 3.5 of a STR point, and the LUK thieves' third stat as the second.
export const STAT_WEIGHTS: Readonly<Record<string, { main: number; sub: number; ssub: number }>> = {
  xenon: { main: 1, sub: 1, ssub: 1 },
  demon_avenger: { main: 0.8 / 3.5, sub: 1, ssub: 0 },
  blade_master: { main: 4, sub: 1, ssub: 1 },
  shadower: { main: 4, sub: 1, ssub: 1 },
  cadena: { main: 4, sub: 1, ssub: 1 },
};
export const DEFAULT_WEIGHTS = { main: 4, sub: 1, ssub: 0 } as const;

// Ring of Restraint Lv. 1–4 as a share of Lv. 4 (Lv. 6 is Lv. 5's 20 s with 85% ATT instead of 68%);
// Continuous Ring by level: ATT % and boss damage %, at full uptime.
export const RESTRAINT_SHAPE = [0, 0.165, 0.372, 0.628, 0.934, 1].map((v) => v / 0.934);
export const RESTRAINT_LV6_OVER_LV5 = 85 / 68;
export const CONTINUOUS_ATT = [0, 4, 6, 8, 10, 12, 14] as const;
export const CONTINUOUS_BOSS = [0, 9, 18, 27, 36, 45, 54] as const;
export const RING_MAX = 6;
// Liberated Genesis weapon and the Ruin Force Shield: 10% final damage each.
export const GENESIS_FD = 1.1;
export const RUIN_FORCE_SHIELD_FD = 1.1;
// The jobs whose final attacks the Artifact's Final Attack boosts (measured on Ren: 30 → +0.136%).
export const FINAL_ATTACK_CLASSES: ReadonlySet<string> = new Set(["hero", "paladin", "dark_knight", "arch_mage_f_p", "arch_mage_i_l", "bishop", "bow_master", "marksman", "blade_master", "buccaneer", "corsair", "aran", "evan", "mercedes", "demon_avenger", "battle_mage", "wild_hunter", "blaster", "mihile", "ren"]);
export const FINAL_ATTACK_PER_30 = 0.00136;
// Only Lara's damage moves with summon duration, up to 42%.
export const SUMMON_CAP = 42;
// Ignore elemental resistance: whole points, up to 5.
export const ELEMENTAL_CAP = 5;
// Below Lv. 260 everything does 3% less.
export const UNDER_260 = 0.97;
// Heroic (Reboot) worlds' final damage by level (StrategyWiki; mapledoro checked 4 characters at 200–249):
// below 100, 150, 200, 250, and from 250.
export const HEROIC_FD = [
  [100, 15],
  [150, 20],
  [200, 25],
  [250, 35],
] as const;
export const HEROIC_FD_TOP = 45;
// Demon Avenger's pure HP (every AP in HP): 545 + 90 a level (the damage range's stat).
export const DA_PURE_HP = { base: 545, perLevel: 90 } as const;

// The worlds tracked that are Heroic (formerly Reboot): both (shared/src/worlds.ts).
export const HEROIC_WORLDS: readonly number[] = [45, 70];
