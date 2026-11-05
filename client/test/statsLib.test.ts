import { STATS_DEFAULTS, STAT_BUFFS, STAT_BUFFS_A, STAT_BUFFS_B, STAT_EVENT_BUFFS, STAT_LINKS } from "@miku/shared";
import { describe, expect, it, vi } from "vitest";
import type { StatsBoard } from "../src/api/types";
import { BUFF_NAMES, efficiencyRows, UNCOUNTED_BUFFS, formatHp, formatLoss, formatPct, formatRate, formatWhole, GUILD_NAMES, iconId, keepTest, LINK_NAMES, loadTest, relevant, RENOWN_NAMES, RINGS, scoreChange, shortOf, shownFor, testFrom, toneOf, valueAt, withPick, withValue } from "../src/lib/stats";
import { boxesOn, shortNumber } from "../src/lib/statValues";

describe("names", () => {
  it("every buff has its GMS name; every link its skill's", () => {
    for (const k of [...STAT_BUFFS, ...STAT_BUFFS_A, ...STAT_BUFFS_B, ...STAT_EVENT_BUFFS]) expect(BUFF_NAMES[k], k).toBeTruthy();
    expect(Object.keys(LINK_NAMES).sort()).toEqual(Object.keys(STAT_LINKS).sort());
    expect([BUFF_NAMES.sayramElixir, BUFF_NAMES.fishBuff, BUFF_NAMES.energizerDrinkMagic, LINK_NAMES.kadena, LINK_NAMES.thief]).toEqual(["Sayram's Elixir", "Tree Ornament", "The Energizer Drink", "Unfair Advantage", "Thief's Cunning"]);
  });
  it("each name, as the game words it", () => {
    expect(LINK_NAMES).toEqual({ thief: "Thief's Cunning", magician: "Empirical Knowledge", kadena: "Unfair Advantage", illium: "Tide of Battle", ark: "Solus", kain: "Time to Prepare", angel: "Terms and Conditions", kanna: "Elementalism", mukhyun: "Qi Cultivation", hoyoung: "Bravado" });
    expect(RENOWN_NAMES).toEqual({ allStat: "Renown: All Stats", atk: "Renown: ATT", boss: "Renown: Boss DMG", ied: "Renown: IED", critDmg: "Renown: Crit DMG" });
    expect(GUILD_NAMES).toEqual({ bossSlayers: "Boss Slayers", undeterred: "Undeterred", forTheGuild: "For the Guild!", hardHitter: "Hard Hitter" });
    // (in MapleScouter's order: v4.1.0, the guild swap the owner hit)
    expect(Object.keys(GUILD_NAMES)).toEqual(["bossSlayers", "undeterred", "forTheGuild", "hardHitter"]);
    expect(BUFF_NAMES).toEqual({
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
    });
  });
  it("the Magic ATT Energizer Drink shows the other's picture; the rest their own", () => {
    expect([iconId("energizerDrinkMagic"), iconId("energizerDrink"), iconId("sayramElixir")]).toEqual(["energizerDrink", "energizerDrink", "sayramElixir"]);
  });
});

describe("shownFor", () => {
  it("a magic job sees the Magic ATT foods, the others the ATT ones; the rest everyone", () => {
    expect(["magicPotionV", "energizerDrinkMagic", "ssiwsCheese"].map((k) => [shownFor(k, true), shownFor(k, false)])).toEqual([[true, false], [true, false], [true, false]]);
    expect(["attackPotionV", "energizerDrink"].map((k) => [shownFor(k, true), shownFor(k, false)])).toEqual([[false, true], [false, true]]);
    expect([shownFor("onyxApple", true), shownFor("onyxApple", false)]).toEqual([true, true]);
  });
});

describe("formatting", () => {
  it("whole numbers grouped; none: —; Final Damage to 2 decimals", () => {
    expect([formatWhole(272_801_300), formatWhole(87_582.4), formatWhole(null), formatWhole(0)]).toEqual(["272,801,300", "87,582", "—", "0"]);
    expect([formatPct(139.3523), formatPct(93.28782), formatPct(0)]).toEqual(["139.35", "93.29", "0.00"]);
  });
});

describe("changing the input", () => {
  it("a number at a path, the rest as it was (the input itself untouched)", () => {
    const a = withValue(STATS_DEFAULTS, "stats.main.base", 7812);
    expect(a.stats.main).toEqual({ base: 7812, per: 0, abs: 0 });
    expect(a.stats.sub).toEqual(STATS_DEFAULTS.stats.sub);
    expect(STATS_DEFAULTS.stats.main.base).toBe(0);
    expect(withValue(STATS_DEFAULTS, "wildHunter", 212).wildHunter).toBe(212);
    expect(withValue(STATS_DEFAULTS, "links.kain", 3).links).toEqual({ ...STATS_DEFAULTS.links, kain: 3 });
  });
  it("a group's pick: picked; picking another swaps it; picking it again takes it off; the other group untouched", () => {
    const a = withPick(STATS_DEFAULTS, "buffA", "legendaryHero");
    expect([a.buffA, a.buffB]).toEqual(["legendaryHero", null]);
    expect(withPick(a, "buffA", "greatHeroBoost").buffA).toBe("greatHeroBoost");
    expect(withPick(a, "buffA", "legendaryHero").buffA).toBeNull();
    expect(withPick(a, "buffB", "onyxApple")).toMatchObject({ buffA: "legendaryHero", buffB: "onyxApple" });
  });
});

// ── v4.1.0 ──
type Boss = StatsBoard["bosses"][number];
const boss = (over: Partial<Boss>): Boss => ({ key: "hard_seren", boss: "seren", name: "Seren", difficulty: "Hard", partyLimit: 6, partyOnly: false, rate: 1, shown: 1, tag: "Possible", bossStat: 1, need: 1, icon: null, phases: null, gaps: [], loss: 0, cannotEnter: false, ...over });

describe("the boss clears' filter (MapleScouter's): 15% to 1,000%; a party-only boss by its party size", () => {
  it("a solo boss: shown from 15% to 1,000%, both ends in", () => {
    expect([0.1499, 0.15, 1, 10, 10.0001].map((rate) => relevant(boss({ rate })))).toEqual([false, true, true, true, false]);
  });
  it("a party-only boss of 3: from a full party's 85% (0.85 ÷ 3) to 10 parties' worth (rate ÷ 3 above 10)", () => {
    const p = (rate: number) => relevant(boss({ rate, partyOnly: true, partyLimit: 3 }));
    expect([0.28, 0.85 / 3, 30, 30.01].map(p)).toEqual([false, true, true, false]);
    // (6: from 0.85 ÷ 6)
    expect([0.14, 0.142].map((rate) => relevant(boss({ rate, partyOnly: true, partyLimit: 6 })))).toEqual([false, true]);
  });
});

describe("the boss clears' words and numbers", () => {
  it("one colour per tag (the party tags share the solo ones by rank); the rest none", () => {
    expect(["Easy", "Possible", "Solo Min", "Party-able", "Party Min", "1p Min Cut", "2p Min Cut", "3p Min Cut", "4p Min Cut", "6p Min Cut", "Impossible", "Can't Enter"].map(toneOf)).toEqual(["easy", "possible", "solo", "party", "partymin", "easy", "possible", "solo", "party", "partymin", "none", "none"]);
  });
  it("a rate: one decimal below 1,000%, whole and grouped from there", () => {
    expect([0.001, 0.405, 9.999, 10, 15.774].map(formatRate)).toEqual(["0.1%", "40.5%", "999.9%", "1,000%", "1,577%"]);
  });
  it("a loss: one decimal below 10%, whole from there; none is 'full'", () => {
    expect([0, 0.0004, 0.033, 0.0999, 0.16, 0.457].map(formatLoss)).toEqual(["full", "full", "−3.3%", "−10.0%", "−16%", "−46%"]);
  });
  it("what's short of full damage: the best and how much more; nothing when there", () => {
    expect(shortOf({ kind: "level", you: 278, boss: 280, full: 285, loss: 0.16 })).toBe("Level 278 / 285 (7 more)");
    expect(shortOf({ kind: "sacred", you: 280, boss: 300, full: 350, loss: 0.36 })).toBe("Sacred Force 280 / 350 (70 more)");
    expect(shortOf({ kind: "arcane", you: 1410, boss: 1320, full: 1452, loss: 0.09 })).toBe("Arcane Force 1,410 / 1,452 (42 more)");
    expect(shortOf({ kind: "level", you: 285, boss: 280, full: 285, loss: 0 })).toBeNull();
  });
  it("HP: billions, trillions, quadrillions", () => {
    expect([5.2e11, 224448e9, 1612962e9].map(formatHp)).toEqual(["520.0B", "224.4T", "1.61Q"]);
  });
});

describe("test mode", () => {
  it("the change from the saved score, signed, two decimals; none without both", () => {
    expect([scoreChange(44705, 45120), scoreChange(44705, 44000), scoreChange(44705, 44705), scoreChange(null, 1), scoreChange(1, null), scoreChange(0, 5)]).toEqual(["+0.93%", "−1.58%", "+0.00%", null, null, null]);
  });
  it("starts from what's saved: the sheet (a copy), the level, every HEXA node's level (Sol Janus 0)", () => {
    const b = { input: STATS_DEFAULTS, level: 278, hexa: [{ node: "origin", level: 9 }, { node: "ascent", level: 1 }] } as unknown as StatsBoard;
    const t = testFrom(b);
    expect(t).toEqual({ input: STATS_DEFAULTS, level: 278, hexa: { origin: 9, ascent: 1, mastery1: 0, mastery2: 0, mastery3: 0, mastery4: 0, boost1: 0, boost2: 0, boost3: 0, boost4: 0, janus: 0, hecate: 0, common3: 0 } });
    expect(t.input).not.toBe(STATS_DEFAULTS);
  });
  it("kept per character in this browser until it ends; blocked storage keeps nothing and breaks nothing", () => {
    const t = { input: STATS_DEFAULTS, level: 280, hexa: Object.fromEntries(["origin", "ascent", "mastery1", "mastery2", "mastery3", "mastery4", "boost1", "boost2", "boost3", "boost4", "janus", "hecate", "common3"].map((n) => [n, 0])) } as never;
    keepTest(5, t);
    expect([loadTest(5), loadTest(6)]).toEqual([t, null]);
    keepTest(5, null);
    expect(loadTest(5)).toBeNull();
    const get = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => keepTest(5, t)).not.toThrow();
    expect(loadTest(5)).toBeNull();
    expect(get).toHaveBeenCalled();
  });
  it("a test kept from before a change to the sheet's fields: what it lacks filled from the defaults; one that can't pass ends (review)", () => {
    const hexa = Object.fromEntries(["origin", "ascent", "mastery1", "mastery2", "mastery3", "mastery4", "boost1", "boost2", "boost3", "boost4", "janus", "hecate", "common3"].map((n) => [n, 1]));
    const old = structuredClone(STATS_DEFAULTS) as unknown as Record<string, Record<string, unknown>>;
    delete old.eventStats!.arcane; // (added since)
    delete old.buffA; // (a pick whose default is none, added since)
    old.statPotion = 3 as never; // (a field whose kind changed)
    window.localStorage.setItem("miku-stats-test-9", JSON.stringify({ input: { ...old, wildHunter: 212 }, level: 280, hexa }));
    expect(loadTest(9)).toEqual({ input: { ...STATS_DEFAULTS, wildHunter: 212 }, level: 280, hexa });
    window.localStorage.setItem("miku-stats-test-9", JSON.stringify({ input: STATS_DEFAULTS, level: 999, hexa }));
    expect(loadTest(9)).toBeNull();
    window.localStorage.setItem("miku-stats-test-9", "{not json");
    expect(loadTest(9)).toBeNull();
  });
  it("a value at a path of the sheet", () => {
    expect([valueAt(INPUT_X, "stats.main.base"), valueAt(INPUT_X, "wildHunter")]).toEqual([5, 212]);
  });
});
const INPUT_X = { ...STATS_DEFAULTS, stats: { ...STATS_DEFAULTS.stats, main: { base: 5, per: 0, abs: 0 } }, wildHunter: 212 };

describe("stat efficiency's rows: MapleScouter's order, the job's own names", () => {
  const e = { bossDmg: 12.7, att: 3.9, attPct: 47.5, critDmg: 38.4, ied300: 14.1, ied380: 18.6, mainPct: 11, mainFlat: 0.22, sub: 0.13, subPct: 1.5, third: null, thirdPct: null, allStatPct: 12.5, fdPer100: 1.1, cooldown: { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5 } };
  it("a two-stat job: no third rows; 1 of the main stat is 1", () => {
    const rows = efficiencyRows(e, { main: "STR", sub: "DEX", third: null, atk: "Attack" });
    expect(rows.map((r) => `${r.pct ? "%" : ""}${r.label}=${r.value}`)).toEqual(["%Boss Damage / Damage=12.7", "ATT=3.9", "%ATT=47.5", "%Critical Damage=38.4", "%IED (300% defense)=14.1", "%IED (380% defense)=18.6", "STR=1", "%STR=11", "STR % doesn't multiply=0.22", "DEX=0.13", "%DEX=1.5", "%All Stats=12.5"]);
  });
  it("a third stat and Magic ATT", () => {
    const rows = efficiencyRows({ ...e, third: 0.12, thirdPct: 1.4 }, { main: "LUK", sub: "DEX", third: "STR", atk: "Magic ATT" });
    expect(rows.map((r) => r.label)).toEqual(["Boss Damage / Damage", "Magic ATT", "Magic ATT", "Critical Damage", "IED (300% defense)", "IED (380% defense)", "LUK", "LUK", "LUK % doesn't multiply", "DEX", "DEX", "STR", "STR", "All Stats"]);
  });
});

describe("the Oz rings and the gear pages' boxes", () => {
  it("the Oz rings in MapleScouter's order", () => {
    expect(RINGS.map(([k]) => k)).toEqual(["restraint", "weapon", "continuous"]);
  });
  it("each page's boxes: only what it uses (the owner, 2026-11-04)", () => {
    const f = (p: Parameters<typeof boxesOn>[0]) => {
      const o = boxesOn(p);
      return [[...o.fields], o.pct, o.cooldown, o.defense];
    };
    expect(f("flames")).toEqual([["att", "allStat", "secRatio", "bossDmg", "fdPer100"], false, false, false]);
    expect(f("starforce")).toEqual([["att", "secRatio", "fdPer100"], false, false, false]);
    expect(f("potential")).toEqual([["att", "allStat", "secRatio", "bossDmg", "fdPer100", "attPct", "critDmg", "ied300", "ied380"], true, true, true]);
    expect(f("all")).toEqual([["att", "allStat", "secRatio", "bossDmg", "fdPer100", "attPct", "mainFlat", "critDmg", "ied300", "ied380"], true, true, true]);
  });
});

describe("a stat value as the pages show it", () => {
  it("two decimals at most; three below 1", () => {
    expect([12.72634, 3.9, 0.97812, 0.125, 0.2224, 4].map(shortNumber)).toEqual(["12.73", "3.9", "0.978", "0.125", "0.222", "4"]);
  });
});

describe("survivors of mutation testing (v4.1.0)", () => {
  it("the buffs counting nothing yet: Arctic Friends and Baby Dragon Food", () => {
    expect(UNCOUNTED_BUFFS).toEqual(["arcticFriends", "babyDragonFood"]);
  });
  it("a loss and HP at their edges: 0.05% is a loss; 10% whole; exactly a trillion and a quadrillion", () => {
    expect([formatLoss(0.0005), formatLoss(0.1)]).toEqual(["−0.1%", "−10%"]);
    expect([formatHp(1e12), formatHp(1e15)]).toEqual(["1.0T", "1.00Q"]);
  });
  it("a kept test: a pick (null by default) kept; an object gone null filled; ending it leaves nothing kept", () => {
    const hexa = Object.fromEntries(["origin", "ascent", "mastery1", "mastery2", "mastery3", "mastery4", "boost1", "boost2", "boost3", "boost4", "janus", "hecate", "common3"].map((n) => [n, 0]));
    window.localStorage.setItem("miku-stats-test-4", JSON.stringify({ input: { ...STATS_DEFAULTS, buffA: "legendaryHero", eventStats: null }, level: 280, hexa }));
    expect(loadTest(4)).toEqual({ input: { ...STATS_DEFAULTS, buffA: "legendaryHero" }, level: 280, hexa });
    keepTest(4, null);
    expect(window.localStorage.getItem("miku-stats-test-4")).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });
});
