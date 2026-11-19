import measured from "./measured-classes.json";
import curves from "./score-curves.json";
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
  kalingAscent?: number; // the Ascent core's share Kaling's figure is measured at (mapledoro's fit; v4.1.0)
  // Angelic Buster's link at level 2, damage % points: at buff duration 0, and per point of buff duration (v4.6.0:
  // the only thing buff duration changes in MapleScouter's damage). Measured classes have their own; the rest: angelLink's defaults.
  angel?: { base: number; perBuffDuration: number };
  // (v4.6.0) Illium's link by level, where MapleScouter counts it otherwise for the class (it stacks as you move): a measured class's own
  illium?: Readonly<Record<string, number>>;
}
export type CooldownRefs = Record<string, { rows: { h0: number; bonus: Record<string, number> }[]; norm2: number }>;

// A job's figures by the name Nexon's rankings use (null: none): mapledoro's, with the figures we measured from
// MapleScouter's answers for the classes in measured-classes.json (v4.6.0, rebuilt by hand with
// scripts/class-data.mjs, dated: the class's own damage %, Angelic Buster's link, ATT %, the Ring of Restraint's level 5,
// its Illium link where MapleScouter counts it otherwise, and scale; and for every class the
// shared defense factor measured there), and its score
// curves from score-curves.json (v4.5.0, rebuilt by hand with scripts/curve-data.mjs, dated): measured from
// MapleScouter's answers for the classes measured in full, else mapledoro's from 33,228 up and MapleScouter's
// shared shape below.
type MeasuredClass = Pick<StatsJob, "dmg" | "atkPct" | "restraint" | "scale" | "illium"> & { angel: NonNullable<StatsJob["angel"]>; how: string };
const measuredClasses = measured.classes as Record<string, MeasuredClass>;
const merged = new Map<string, StatsJob>();
export function statsJob(name: string): StatsJob | null {
  const jobs = figures.jobs as unknown as Record<string, StatsJob>;
  if (!Object.hasOwn(jobs, name)) return null;
  const known = merged.get(name);
  if (known) return known;
  const c = (curves.classes as Record<string, ScoreCurves>)[name];
  const m = Object.hasOwn(measuredClasses, name) ? measuredClasses[name]! : null;
  const job: StatsJob = {
    ...jobs[name]!,
    // (every class: MapleScouter's 380% boss keeps a little more of its defense than mapledoro's figures say, v4.6.0:
    // measured-classes.json's shared defenseKeep, ~0.2%)
    defenseK: jobs[name]!.defenseK * measured.shared.defenseKeep,
    ...(m && { dmg: m.dmg, atkPct: m.atkPct, restraint: m.restraint, scale: m.scale, angel: m.angel }),
    ...(m?.illium && { illium: m.illium }),
    ...(c && { spline380: c.spline380, spline300: c.spline300 }),
  };
  merged.set(name, job);
  return job;
}
// A job's figures as mapledoro measured them, with its own curves (null: none), for checking ours against its engine:
// through our formula they give its answers only where our rules are still its (v4.6.0: the Stat Potion on, Illium's and
// Angelic Buster's links and buff duration at 0, no Final Attack; tempdata/stats/fixture/make.ts).
export function mapledoroJob(name: string): StatsJob | null {
  const jobs = figures.jobs as unknown as Record<string, StatsJob>;
  return Object.hasOwn(jobs, name) ? jobs[name]! : null;
}
type ScoreCurves = { source: CurveSource; spline380: Spline; spline300: Spline };
// measured: from MapleScouter's answers in full; fitted: mapledoro's, its low end fitted to the class's own
// answers; mapledoro: mapledoro's, its low end the shared shape
export type CurveSource = "measured" | "fitted" | "mapledoro";
// Where a job's score curve comes from, and the day the curves were rebuilt (null: no curve).
export function curveSource(name: string): { source: CurveSource; date: string } | null {
  const c = (curves.classes as Record<string, ScoreCurves>)[name];
  return c ? { source: c.source, date: curves.generated } : null;
}
// Where a job's own figures come from: measured against MapleScouter's answers (measured-classes.json), or
// mapledoro's (null: no figures).
export type ClassFiguresSource = "measured" | "mapledoro";
export function classFiguresSource(name: string): { source: ClassFiguresSource; date: string } | null {
  if (!Object.hasOwn(figures.jobs, name)) return null;
  return Object.hasOwn(measuredClasses, name) ? { source: "measured", date: measured.generated } : { source: "mapledoro", date: figures.generated };
}
export const STATS_FIGURES = { generated: figures.generated };
// The links' damage % by level: mapledoro's (Angelic Buster's: angelLink, by class and buff duration). Illium's stacks as
// you move, so MapleScouter counts it by class (v4.6.0's probes: Ren 7 / 10 / 13, Night Walker mapledoro's 3.5 / 5 / 6.5;
// the wiki's full value would be 8 / 12 / 16): a measured class's own, its `illium` (the owner: mapledoro's for the rest
// until each is measured). The fuller table, Ren's: ILLIUM_LINK.
export const ILLIUM_LINK: Readonly<Record<string, number>> = { "0": 0, "1": 7, "2": 10, "3": 13 };
const links = figures.links;
export const statLinks = (): Readonly<Record<string, Readonly<Record<string, number>>>> => links;
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
  // (MapleScouter's GMS tiles we don't know the effect of yet: no table has them, so they count nothing)
  arcticFriends: "whiteBear", babyDragonFood: "dragonsMeal",
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
export const BUFF_DMG: Readonly<Record<string, number>> = { additional1: 15, sayram: 10, shiningRed: 20, authenticDmg: 20, house: 15, bigHero: 10 };
// The Advanced Stat Potion X (MapleScouter's one box, 30): +30 main and secondary stat before the stat %, and no
// damage (v4.6.0's probes; it was +3% damage until then). mapledoro's figures had it inside every class's hidden
// base stat, on or off: these are its measured amounts there (a class with nothing else hidden), taken back out
// with the potion off, for a class whose hidden stats hold at least them (not Cannoneer's, nor Demon Avenger's
// and Xenon's stat terms, which work differently: theirs stay as measured).
export const STAT_POTION = { main: 29.95622435, sub: 29.75665399 } as const;
export const STAT_POTION_ASIDE: ReadonlySet<string> = new Set(["demon_avenger", "xenon"]);
// Angelic Buster's link (Soul Contract, 10 s of damage a minute: MapleScouter averages it): by level, a share of
// level 2's (2 : 3 : 4, measured at 1, 2 and 3), the class's own amount at level 2 (measured classes), else the
// measured classes' average at buff duration 0 and the class's mapledoro per-buff-duration figure × the share
// MapleScouter's came to (the same, 0.805, for all three measured).
export const ANGEL_LINK_SHARE = [0, 2 / 3, 1, 4 / 3] as const;
export const ANGEL_LINK_DEFAULT = { base: measured.shared.angelBase, perBuffDurationShare: measured.shared.angelPerBuffDurationShare } as const;
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
// The jobs whose final attacks the Artifact's Final Attack boosts: damage % points per 30 (v4.6.0's probes, on
// Ren: 30 → +1.416; it was +0.136% final damage until then, measured before MapleScouter's November change).
export const FINAL_ATTACK_CLASSES: ReadonlySet<string> = new Set(["hero", "paladin", "dark_knight", "arch_mage_f_p", "arch_mage_i_l", "bishop", "bow_master", "marksman", "blade_master", "buccaneer", "corsair", "aran", "evan", "mercedes", "demon_avenger", "battle_mage", "wild_hunter", "blaster", "mihile", "ren"]);
export const FINAL_ATTACK_PER_30 = 1.416;
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
