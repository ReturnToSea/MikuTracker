import { HEXA_NODES, STAT_BUFFS_MAGIC, STAT_BUFFS_PHYSICAL, STATS_DEFAULTS, type StatsInput, type StatsTryInput, statsTryInput } from "@miku/shared";
import type { StatsBoard } from "../api/types";

// The Stats page's display rules (v4.0.0), as plain functions.

// The buffs' GMS names (chablades/mapledoro's), the guild skills', Champion's Renown's and the links'.
export const BUFF_NAMES: Readonly<Record<string, string>> = {
  candiedApple: "Candied Apple", sayramElixir: "Sayram's Elixir", collectorElixir: "Collector's Elixir", honorableElixir: "Honorable Elixir", extremePotion: "Extreme Potion",
  sparklingRedStar: "Sparkling Red Star Potion", brightMoonlight: "Bright Moonlight Potion", heroEcho: "Hero's Echo", legionMight: "Legion's Might", masarayuGift: "Masarayu's Gift",
  caretakerSupport: "Caretaker's Support", vipBuff: "VIP Buff (Stats)", mvpSuperpower: "MVP Superpower Buff", genepass: "Power of the Adversary", enlightenedOne: "The Enlightened One",
  sparklingBlueStar: "Sparkling Blue Star Potion", greatHeroBoost: "Advanced Great Hero Boost Potion", legendaryHero: "Legendary Hero Potion", advWeaponTempering: "Advanced Weapon Tempering",
  tengusJudgement: "Tengu's Judgement", attackPotionV: "Advanced Attack Potion V", magicPotionV: "Advanced Magic Potion V", onyxApple: "Onyx Apple", energizerDrink: "The Energizer Drink",
  energizerDrinkMagic: "The Energizer Drink", fishBuff: "Tree Ornament", witchStew: "Witch's Special Stew", ssiwsCheese: "Ssiws Cheese",
  arcticFriends: "Arctic Friends", babyDragonFood: "Baby Dragon Food",
  believeInYourself: "Believe in Yourself", gourmandPower: "Gourmand Power", peerlessMarble: "Peerless Marble",
  sacredSymbols: "Sacred symbols",
  statPotionSTR: "Advanced Stat Potion X", statPotionDEX: "Advanced Stat Potion X", statPotionINT: "Advanced Stat Potion X", statPotionLUK: "Advanced Stat Potion X", statPotionHP: "Advanced Stat Potion X",
};
// (in MapleScouter's order: v4.1.0)
export const GUILD_NAMES: Readonly<Record<keyof StatsInput["guild"], string>> = { bossSlayers: "Boss Slayers", undeterred: "Undeterred", forTheGuild: "For the Guild!", hardHitter: "Hard Hitter" };
export const RENOWN_NAMES: Readonly<Record<keyof StatsInput["renown"], string>> = { allStat: "Renown: All Stats", atk: "Renown: ATT", boss: "Renown: Boss DMG", ied: "Renown: IED", critDmg: "Renown: Crit DMG" };
export const LINK_NAMES: Readonly<Record<keyof StatsInput["links"], string>> = {
  thief: "Thief's Cunning", magician: "Empirical Knowledge", kadena: "Unfair Advantage", illium: "Tide of Battle", ark: "Solus", kain: "Time to Prepare", angel: "Terms and Conditions", kanna: "Elementalism", mukhyun: "Qi Cultivation", hoyoung: "Bravado",
};
// A buff's picture's id: the Magic ATT Energizer Drink shares the other's.
export const iconId = (buff: string): string => (buff === "energizerDrinkMagic" ? "energizerDrink" : buff);

// Whether a job sees a group B buff: some are only for jobs that use Magic ATT, some only for the others.
export const shownFor = (buff: string, magic: boolean): boolean => (STAT_BUFFS_MAGIC.includes(buff) ? magic : STAT_BUFFS_PHYSICAL.includes(buff) ? !magic : true);

// A whole number grouped (272,801,300); a score not worked out: "—".
export const formatWhole = (n: number | null): string => (n === null ? "—" : Math.round(n).toLocaleString("en-US"));
// Final Damage as MapleScouter shows it: two decimals (139.35).
export const formatPct = (n: number): string => n.toFixed(2);

// The input with one number changed, at a path like "stats.main.base" or "wildHunter".
export function withValue(input: StatsInput, path: string, value: number): StatsInput {
  const out = structuredClone(input) as unknown as Record<string, unknown>;
  const keys = path.split(".");
  let at = out;
  for (const k of keys.slice(0, -1)) at = at[k] as Record<string, unknown>;
  at[keys.at(-1)!] = value;
  return out as unknown as StatsInput;
}
// A group's pick: picking the one already picked takes it off (only one counts).
export function withPick(input: StatsInput, group: "buffA" | "buffB", buff: string): StatsInput {
  return { ...input, [group]: input[group] === buff ? null : buff };
}

// ── v4.1.0 ─────────────────────────────────────────────────────────────────────────────────────
// A buff whose effect isn't known yet (it counts nothing, said on hover).
export const UNCOUNTED_BUFFS: readonly string[] = ["arcticFriends", "babyDragonFood"];
// The Oz rings, in MapleScouter's order.
export const RINGS = [
  ["restraint", "Ring of Restraint"],
  ["weapon", "Weapon Jump Ring"],
  ["continuous", "Continuous Ring"],
] as const;

// A number at a path like "stats.main.base" in the sheet.
export const valueAt = (input: StatsInput, path: string): unknown => path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], input);

// Test mode: each character's test sheet, kept in this browser until the test ends (decided 2026-11-04).
// Storage can be blocked (a private window): then nothing is kept, and the test still works.
const testKey = (id: number) => `miku-stats-test-${id}`;
// A test kept from before a change to the sheet's fields: what it lacks filled from the defaults (a field
// whose kind changed too), then checked against the rules; one that still doesn't pass ends (null).
function filled(defaults: unknown, kept: unknown): unknown {
  const isObject = (x: unknown) => typeof x === "object" && x !== null && !Array.isArray(x);
  // (none is the default; a value of another kind too, but where the default is null, a pick: what was picked)
  if (kept === undefined) return defaults;
  if (!isObject(defaults)) return defaults !== null && typeof kept !== typeof defaults ? defaults : kept;
  if (!isObject(kept)) return defaults;
  const d = defaults as Record<string, unknown>;
  const k = kept as Record<string, unknown>;
  return Object.fromEntries(Object.keys(d).map((key) => [key, filled(d[key], k[key])]));
}
export function loadTest(id: number): StatsTryInput | null {
  try {
    // (nothing kept reads as null, and a null has no input: no test)
    const kept = JSON.parse(String(window.localStorage.getItem(testKey(id)))) as Partial<StatsTryInput>;
    const ok = statsTryInput.safeParse({ ...kept, input: filled(STATS_DEFAULTS, kept.input) });
    return ok.success ? ok.data : null;
  } catch {
    return null;
  }
}
export function keepTest(id: number, t: StatsTryInput | null): void {
  try {
    if (t === null) window.localStorage.removeItem(testKey(id));
    else window.localStorage.setItem(testKey(id), JSON.stringify(t));
  } catch {
    // (not kept: the test goes on this visit)
  }
}
// A test starting from what's saved: the sheet, the level now and every HEXA node's level now (one the page
// doesn't show, Sol Janus: 0, it adds no damage).
export function testFrom(b: StatsBoard): StatsTryInput {
  const hexa = Object.fromEntries(HEXA_NODES.map((n) => [n, b.hexa.find((x) => x.node === n)?.level ?? 0])) as StatsTryInput["hexa"];
  return { input: structuredClone(b.input), level: b.level, hexa };
}
// The test's score against the saved one: "+0.92%" (null: either not worked out).
export function scoreChange(saved: number | null, test: number | null): string | null {
  if (saved === null || test === null || saved === 0) return null;
  const pct = (test / saved - 1) * 100;
  return `${pct >= 0 ? "+" : "−"}${Math.abs(pct).toFixed(2)}%`;
}

// Stat efficiency's rows, as MapleScouter's "Detail Eff." lists them, in the job's own stats' names.
type Efficiency = NonNullable<StatsBoard["efficiency"]>;
export function efficiencyRows(e: Efficiency, labels: StatsBoard["labels"]): { label: string; value: number; pct: boolean }[] {
  const atk = labels.atk === "Magic ATT" ? "Magic ATT" : "ATT";
  const rows: [string, number, boolean][] = [
    ["Boss Damage / Damage", e.bossDmg, true],
    [atk, e.att, false],
    [atk, e.attPct, true],
    ["Critical Damage", e.critDmg, true],
    ["IED (300% defense)", e.ied300, true],
    ["IED (380% defense)", e.ied380, true],
    [labels.main, 1, false],
    [labels.main, e.mainPct, true],
    [`${labels.main} % doesn't multiply`, e.mainFlat, false],
    [labels.sub, e.sub, false],
    [labels.sub, e.subPct, true],
    // (a job with a third stat has its figures)
    ...(labels.third === null ? [] : ([[labels.third, e.third!, false], [labels.third, e.thirdPct!, true]] as [string, number, boolean][])),
    ["All Stats", e.allStatPct, true],
  ];
  return rows.map(([label, value, pct]) => ({ label, value, pct }));
}

// The boss clears.
type Boss = StatsBoard["bosses"][number];
// MapleScouter's filter (its result page's): a boss is shown from 15% to 1,000% clear; a party-only one
// from a full party's 85% (its rate ÷ party size), to its rate ÷ party size above 10.
export function relevant(b: Boss): boolean {
  const scaled = b.partyOnly ? b.rate / b.partyLimit : b.rate;
  if (scaled > 10) return false;
  return b.partyOnly ? b.rate >= 0.85 / b.partyLimit : b.rate >= 0.15;
}
// Each tag's colour (one tag, one colour: mapledoro's): the theme's.
const TONE: Readonly<Record<string, string>> = {
  Easy: "easy", Possible: "possible", "Solo Min": "solo", "Party-able": "party", "Party Min": "partymin",
  "1p Min Cut": "easy", "2p Min Cut": "possible", "3p Min Cut": "solo", "4p Min Cut": "party", "6p Min Cut": "partymin",
};
export const toneOf = (tag: string): string => TONE[tag] ?? "none";
// A clear rate as a %: one decimal below 1,000%, whole numbers from there ("1,577%").
export const formatRate = (rate: number): string => (rate >= 10 ? `${Math.round(rate * 100).toLocaleString("en-US")}%` : `${(rate * 100).toFixed(1)}%`);
// A share lost: "−16%", one decimal below 10% ("−3.3%"); none: "full".
export function formatLoss(loss: number): string {
  if (loss < 0.0005) return "full";
  return `−${loss < 0.1 ? (loss * 100).toFixed(1) : Math.round(loss * 100)}%`;
}
// What's short of full damage: the gap and how much more ("Level 285, 7 more"), or null.
export function shortOf(g: Boss["gaps"][number]): string | null {
  if (g.you >= g.full) return null;
  const name = { level: "Level", arcane: "Arcane Force", sacred: "Sacred Force" }[g.kind];
  return `${name} ${g.you.toLocaleString("en-US")} / ${g.full.toLocaleString("en-US")} (${(g.full - g.you).toLocaleString("en-US")} more)`;
}
// HP as the game rounds it: trillions ("224.4T"), quadrillions ("1.61Q").
export function formatHp(n: number): string {
  if (n >= 1e15) return `${(n / 1e15).toFixed(2)}Q`;
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  return `${(n / 1e9).toFixed(1)}B`;
}
