import { STAT_VALUE_DEFAULTS } from "@miku/shared";
import { describe, expect, it } from "vitest";
import { FLAME_STATS } from "../gameFigures/flames";
import { jobStats } from "../gameFigures/jobStats";
import { bestFlameScore, chanceAtLeast, flameCurves, flameDistribution, flameMetrics, flameOdds, flameScore, type FlameWeights, flameWeights, flamesForChance, stopScore } from "./flames";
import { type DetailItem, type FlameRow, flameGrid } from "./gearDetails";

// Numbers worked out by hand (written next to each), and checked against mafhcow's flame calculator's
// own engine (js/flameEngine.js, run on the same items: 2026-10-24), not by running the same code.
// the v2.1.0 defaults the hand-worked numbers below use (all stat % became 14.65 in v2.3.0)
const V = { ...STAT_VALUE_DEFAULTS, allStat: 10 }; // 1 ATT = 4, 1% all stat = 10, secondary 0.125, 1% boss/damage = 12
const warrior = jobStats("Ren", ["Warrior"])!;
const item = (over: Partial<DetailItem>): DetailItem => ({ slot: "hat", level: 200, stats: {}, classStats: ["str", "dex"], starMin: 0, starMax: 30, flames: "boss", ...over });
const hatGrid = flameGrid(item({}));
const renArmor = flameWeights(warrior, V, false);

// A made-up item for hand-worked odds: 4 stats, each worth 10 a tier, only STR counting.
const only = (stat: string): FlameWeights => Object.fromEntries(FLAME_STATS.map((s) => [s, s === stat ? 1 : 0])) as FlameWeights;
const toy: FlameRow[] = (["STR", "DEX", "INT", "LUK"] as const).map((stat) => ({ stat, values: [10, 20, 30, 40, 50, null, null] }));
// Not a boss item: 1–4 lines (40/40/16/4%), STR among them 1/4, 2/4, 3/4, 4/4 of the time:
// 0.4 × 0.25 + 0.4 × 0.5 + 0.16 × 0.75 + 0.04 = 0.46. Its tier: 2/3/4/5 at 29/45/25/1% → 20/30/40/50.
const TOY = [[0, 0.54], [2000, 0.46 * 0.29], [3000, 0.46 * 0.45], [4000, 0.46 * 0.25], [5000, 0.46 * 0.01]] as [number, number][];

describe("flameWeights", () => {
  it("a Warrior (Ren): STR 1, DEX the secondary ratio, pairs add both halves, ATT, all stat, boss and damage", () => {
    expect(renArmor).toMatchObject({ STR: 1, DEX: 0.125, INT: 0, LUK: 0, "STR+DEX": 1.125, "STR+INT": 1, "STR+LUK": 1, "DEX+INT": 0.125, "DEX+LUK": 0.125, "INT+LUK": 0, ATT: 4, "M. ATT": 0, "All Stats %": 10, "Boss damage %": 12, "Damage %": 12 });
    expect([renArmor["Max HP"], renArmor["Max MP"], renArmor.Defense, renArmor["Req. level"], renArmor.Speed, renArmor.Jump]).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("a mage scores Magic ATT with the ATT value, and ATT as nothing", () => {
    const w = flameWeights(jobStats("Bishop", ["Magician"])!, V, true);
    expect([w.INT, w.LUK, w["M. ATT"], w.ATT, w.STR]).toEqual([1, 0.125, 4, 0, 0]);
    // its pairs: the INT half counts, the LUK half at the ratio
    expect([w["STR+INT"], w["DEX+INT"], w["INT+LUK"], w["STR+LUK"], w["STR+DEX"]]).toEqual([1, 1, 1.125, 0.125, 0]);
  });

  it("Xenon: STR, DEX and LUK each count fully, so a pair of them counts twice; a pair with INT once", () => {
    const w = flameWeights(jobStats("Xenon", ["Thief", "Pirate"])!, V, false);
    expect([w.STR, w.DEX, w.LUK, w.INT, w["STR+DEX"], w["DEX+LUK"], w["STR+INT"], w["INT+LUK"]]).toEqual([1, 1, 1, 0, 2, 2, 1, 1]);
  });

  it("two secondary stats (Shadower): STR and DEX at the ratio each, so STR+DEX at twice it", () => {
    const w = flameWeights(jobStats("Shadower", ["Thief"])!, V, false);
    expect([w.LUK, w.STR, w.DEX, w["STR+DEX"], w["DEX+LUK"], w["STR+LUK"]]).toEqual([1, 0.125, 0.125, 0.25, 1.125, 1.125]);
  });

  it("Demon Avenger: HP is the main stat; all stat % doesn't raise HP; STR counts nothing", () => {
    const w = flameWeights(jobStats("Demon Avenger", ["Warrior"])!, V, false);
    expect([w["Max HP"], w.ATT, w["All Stats %"], w.STR, w["STR+DEX"]]).toEqual([1, 4, 0, 0, 0]);
  });

  it("Zero: boss and damage % count twice on its weapon (copied to the secondary), once elsewhere", () => {
    const zero = jobStats("Zero", ["Warrior"])!;
    expect([flameWeights(zero, V, true)["Boss damage %"], flameWeights(zero, V, true)["Damage %"], flameWeights(zero, V, false)["Boss damage %"], flameWeights(warrior, V, true)["Boss damage %"]]).toEqual([24, 24, 12, 12]);
  });

  it("follows the character's own values", () => {
    const w = flameWeights(warrior, { ...STAT_VALUE_DEFAULTS, att: 3, allStat: 11, secRatio: 0.1, bossDmg: 9, fdPer100: 1 }, true);
    expect([w.DEX, w["STR+DEX"], w.ATT, w["All Stats %"], w["Damage %"]]).toEqual([0.1, 1.1, 3, 11, 9]);
  });
});

describe("jobStats", () => {
  it("by branch, with the exceptions; null for a job the list doesn't know", () => {
    expect(jobStats("Night Walker", ["Thief"])).toEqual({ main: ["LUK"], secondary: ["DEX"] });
    expect(jobStats("Wind Archer", ["Bowman"])).toEqual({ main: ["DEX"], secondary: ["STR"] });
    expect(jobStats("Buccaneer", ["Pirate"])).toEqual({ main: ["STR"], secondary: ["DEX"] });
    expect(jobStats("Corsair", ["Pirate"])).toEqual({ main: ["DEX"], secondary: ["STR"] });
    expect(jobStats("Lara", ["Magician"])).toEqual({ main: ["INT"], secondary: ["LUK"], magic: true });
    expect(jobStats("Some New Job", undefined)).toBeNull();
    expect(jobStats("Some New Job", ["Ranger"])).toBeNull();
    expect(jobStats("constructor", undefined)).toBeNull();
  });
});

describe("flameScore and bestFlameScore (in hundredths)", () => {
  it("a Lv. 200 boss hat: STR T6 66, STR+DEX T5 30 × 1.125, ATT T5 5 × 4, all stat T4 4 × 10 = 159.75", () => {
    // 66 + 33.75 + 20 + 40
    expect(flameScore(hatGrid, renArmor, { STR: 6, "STR+DEX": 5, ATT: 5, "All Stats %": 4 })).toBe(15975);
  });

  it("no flames: 0; a stat the grid doesn't have counts nothing", () => {
    expect(flameScore(hatGrid, renArmor, {})).toBe(0);
    expect(flameScore(hatGrid, renArmor, { "Boss damage %": 7, STR: 3 })).toBe(3300);
  });

  it("the best: the 4 best lines at the top tier: STR 77, all stat 70, STR+DEX 42 × 1.125, STR+INT 42 = 236.25", () => {
    expect(bestFlameScore(hatGrid, renArmor)).toBe(23625);
    // not a boss item: tier 5 at most, Lv. 150 (8 a tier, pairs 4): 40 + 50 + 22.5 + 20 = 132.5
    expect(bestFlameScore(flameGrid(item({ slot: "belt", level: 150, flames: "normal" })), renArmor)).toBe(13250);
  });
});

describe("flameDistribution", () => {
  it("a boss item rolls 4 lines, tiers 4–7: with 4 stats, STR is always one of them", () => {
    const grid = toy.map((r) => ({ ...r, values: [10, 20, 30, 40, 50, 60, 70] }));
    const d = flameDistribution(grid, only("STR"), true);
    expect(d.map(([s]) => s)).toEqual([4000, 5000, 6000, 7000]);
    [0.29, 0.45, 0.25, 0.01].forEach((p, i) => expect(d[i]![1]).toBeCloseTo(p, 12));
  });

  it("an item that isn't a boss item rolls 1–4 lines, tiers 2–5 (worked out above)", () => {
    const d = flameDistribution(toy, only("STR"), false);
    expect(d.map(([s]) => s)).toEqual(TOY.map(([s]) => s));
    d.forEach(([, p], i) => expect(p).toBeCloseTo(TOY[i]![1], 12));
  });

  it("real items add up to 1, reach the best score, and match mafhcow's engine (4 decimals)", () => {
    const d = flameDistribution(hatGrid, renArmor, true);
    expect(d.reduce((a, [, p]) => a + p, 0)).toBeCloseTo(1, 12);
    expect([d.length, d.at(-1)![0], d[0]![0]]).toEqual([1477, 23625, 0]);
    // mafhcow at 59.1 and 118.1 (its scores rounded to 0.1): 0.360395 / E 9.2904, 0.029028 / E 0.4305
    expect(flameOdds(d, 5913).better).toBeCloseTo(0.360395, 5);
    expect(flameOdds(d, 5913).gain).toBeCloseTo(9.29, 1);
    expect(flameOdds(d, 11813).better).toBeCloseTo(0.029028, 5);
    // a Lv. 150 belt that isn't a boss item: 0.065265 better at 33.125, E 0.6815 (identical)
    const belt = flameDistribution(flameGrid(item({ slot: "belt", level: 150, flames: "normal" })), renArmor, false);
    expect(belt.reduce((a, [, p]) => a + p, 0)).toBeCloseTo(1, 12);
    expect(flameOdds(belt, 3313).better).toBeCloseTo(0.065265, 5);
    expect(flameOdds(belt, 3313).gain).toBeCloseTo(0.6815, 3);
    // a 340-ATT Lv. 200 boss weapon: 0.081979 better at 584.5, E 8.8868
    const weapon = flameDistribution(flameGrid(item({ slot: "weapon", stats: { att: 340 } })), flameWeights(warrior, V, true), true);
    expect([weapon.length, weapon.at(-1)![0]]).toEqual([6797, 116900]);
    expect(flameOdds(weapon, 58450).better).toBeCloseTo(0.081979, 5);
    expect(flameOdds(weapon, 58450).gain).toBeCloseTo(8.887, 2);
  });
});

describe("flameOdds and flameMetrics", () => {
  it("from 30: better 40 or 50, worse 0 or 20, gain 0.115 × 10 + 0.0046 × 20 = 1.242", () => {
    const o = flameOdds(TOY, 3000);
    expect(o.better).toBeCloseTo(0.1196, 12);
    expect(o.worse).toBeCloseTo(0.6734, 12);
    expect(o.gain).toBeCloseTo(1.242, 12);
  });

  it("the metrics at 3m a flame and 0.785% final damage per 100 score", () => {
    const m = flameMetrics(TOY, 3000, 3_000_000, 0.785);
    expect(m.beats).toBeCloseTo(0.6734, 12);
    expect(m.gainIfBetter).toBeCloseTo(1.242 / 0.1196, 9); // 10.38
    // that gain as final damage: 10.38 × 0.785 / 100 = 0.0815%
    expect(m.fdIfBetter).toBeCloseTo((1.242 / 0.1196) * 0.00785, 9);
    expect(m.flamesToBetter).toBeCloseTo(1 / 0.1196, 9); // 8.36
    expect(m.mesoToBetter).toBeCloseTo(3_000_000 / 0.1196, 3); // 25.08m
    // 1.242 points × 0.785 / 100 = 0.0097497% final damage a flame: 3m ÷ that = 307.7m per 1%
    expect(m.mesoPerFd).toBeCloseTo(307_701_775.4, 0);
    // 1 − 0.8804^n: 25% at n = 3 (31.8%; 2 gives 22.5%), 50% at 6, 70% at 10, 99% at 37
    expect(m.flamesForChance).toEqual([{ chance: 0.25, flames: 3 }, { chance: 0.5, flames: 6 }, { chance: 0.7, flames: 10 }, { chance: 0.99, flames: 37 }]);
  });

  it("at the top, or with nothing to gain, the endless figures are null", () => {
    const m = flameMetrics(TOY, 5000, 3_000_000, 0.785);
    expect([m.better, m.gain, m.gainIfBetter, m.fdIfBetter, m.flamesToBetter, m.mesoToBetter, m.mesoPerFd, m.flamesForChance[0]!.flames]).toEqual([0, 0, null, null, null, null, null, null]);
    expect(flameMetrics(TOY, 3000, 3_000_000, 0).mesoPerFd).toBeNull();
  });
});

describe("flamesForChance", () => {
  it("the fewest flames for a chance of at least x: 1 − (1 − p)^n ≥ x", () => {
    // ln 0.5 / ln 0.9 = 6.58 → 7; ln 0.01 / ln 0.5 = 6.64 → 7; ln 0.75 / ln 0.5 = 0.415 → 1
    expect([flamesForChance(0.5, 0.1), flamesForChance(0.99, 0.5), flamesForChance(0.25, 0.5)]).toEqual([7, 7, 1]);
    // exactly 2: 1 − 0.5² = 0.75
    expect(flamesForChance(0.75, 0.5)).toBe(2);
    expect([flamesForChance(0.5, 0), flamesForChance(0.99, 1)]).toEqual([null, 1]);
    // a tiny chance stays exact: 1 − 1e-17 would round to 1 (and "never"); ln 2 / 1e-17 = 6.93 × 10¹⁶
    expect(flamesForChance(0.5, 1e-17)! / 1e16).toBeCloseTo(6.931, 3);
  });
});

describe("stopScore", () => {
  it("where one more flame costs the budget: between 20 and 30, a flame adds 11.04 − 0.3266 t", () => {
    // scores above t in [20, 30): 30, 40, 50 → 0.207 × 30 + 0.115 × 40 + 0.0046 × 50 = 11.04, chance 0.3266.
    // A budget where a flame may add 2 points on average: t = 9.04 / 0.3266 = 27.679…
    const budget = (3_000_000 * 100) / (0.785 * 2);
    expect(stopScore(TOY, 3_000_000, 0.785, budget)).toBeCloseTo(9.04 / 0.3266, 9);
    // exactly where a flame adds 1.242 (from 30): 30
    expect(stopScore(TOY, 3_000_000, 0.785, 307_701_775.4)).toBeCloseTo(30, 6);
  });

  it("a budget too small for even the first flame: 0; a huge one: just under the top", () => {
    // from 0 a flame adds 13.708 on average
    expect(stopScore(TOY, 3_000_000, 0.785, (3_000_000 * 100) / (0.785 * 14))).toBe(0);
    const t = stopScore(TOY, 3_000_000, 0.785, 1e15)!;
    expect(t).toBeGreaterThan(49.99);
    expect(t).toBeLessThan(50);
  });

  it("free flames go all the way to the top; no budget or no final damage value: null", () => {
    expect(stopScore(TOY, 0, 0.785, 1e9)).toBe(50);
    expect([stopScore(TOY, 3e6, 0.785, 0), stopScore(TOY, 3e6, 0, 1e9), stopScore([], 3e6, 0.785, 1e9)]).toEqual([null, null, null]);
  });

  it("with no roll scoring 0, the first piece runs from 0 to the lowest score", () => {
    // 10 or 30, half each: from 0 to 10 a flame adds 20 − t; a budget allowing 15: t = 5
    expect(stopScore([[1000, 0.5], [3000, 0.5]], 3_000_000, 0.785, (3_000_000 * 100) / (0.785 * 15))).toBeCloseTo(5, 9);
  });

  it("a score of 0 that can be rolled doesn't count as the first piece", () => {
    // [0, 20): every score above 0 counts: 0.46 × (0.29 × 20 + 0.45 × 30 + 0.25 × 40 + 0.01 × 50) = 13.708, chance 0.46
    // a flame adding 10 on average: t = 3.708 / 0.46 = 8.06…
    expect(stopScore(TOY, 3_000_000, 0.785, (3_000_000 * 100) / (0.785 * 10))).toBeCloseTo(3.708 / 0.46, 9);
  });
});

describe("chanceAtLeast and flameCurves", () => {
  it("the chance of at least a score", () => {
    expect(chanceAtLeast(TOY, 30)).toBeCloseTo(0.3266, 12);
    expect(chanceAtLeast(TOY, 31)).toBeCloseTo(0.1196, 12);
    expect(chanceAtLeast(TOY, 0)).toBeCloseTo(1, 12);
    // scores are whole hundredths: at least 12.344 means 12.35 or more; 12.34 itself counts for 12.34
    expect(chanceAtLeast([[1234, 0.5], [1235, 0.5]], 12.344)).toBe(0.5);
    expect(chanceAtLeast([[1234, 0.5], [1235, 0.5]], 12.34)).toBe(1);
  });

  it("from 0 to where 99.9% of rolls stay (50 here): the added score and its meso per point", () => {
    // gain(0) = 13.708; gain(10) = 1.334 + 4.14 + 3.45 + 0.184 = 9.108; gain(20) = 2.07 + 2.3 + 0.138 = 4.508;
    // gain(30) = 1.242; gain(40) = 0.046; gain(50) = 0
    const c = flameCurves(TOY, 3_000_000, 5);
    expect(c.map((p) => p.score)).toEqual([0, 10, 20, 30, 40, 50]);
    [13.708, 9.108, 4.508, 1.242, 0.046, 0].forEach((g, i) => expect(c[i]!.gain).toBeCloseTo(g, 9));
    expect(c[3]!.mesoPerScore).toBeCloseTo(3_000_000 / 1.242, 3);
    expect(c[5]!.mesoPerScore).toBeNull();
    expect(flameCurves(TOY, 1)).toHaveLength(151);
  });

  it("the curves stop at the score 99.9% of rolls stay at or below, not the very top", () => {
    // exactly 99.9% at 0: the curves end at 0
    expect(flameCurves([[0, 0.999], [1000, 0.001]], 1, 4).map((p) => p.score)).toEqual([0, 0, 0, 0, 0]);
    // the hat: well below 236.25
    const top = flameCurves(flameDistribution(hatGrid, renArmor, true), 1, 10).at(-1)!.score;
    expect(top).toBeGreaterThan(120);
    expect(top).toBeLessThan(200);
  });
});
