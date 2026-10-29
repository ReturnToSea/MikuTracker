import { STAT_VALUE_DEFAULTS, type StatValuesInput } from "@miku/shared";
import { describe, expect, it } from "vitest";
import { jobStats } from "../gameFigures/jobStats";
import { type CubeRolls, cubeMetrics, cubesForChance, cubesToReach, cubeUntil, iedPercent, linePoints, linesPoints, oneCube, pctDefault, pctWorth, rollDistribution, statBoxes } from "./potential";

const V: StatValuesInput = { ...STAT_VALUE_DEFAULTS }; // main stat % 12.97, secondary % 1.68, all stat % 14.65, ATT % 53.82, 1 ATT 4, boss 12, crit damage 42.38, IED 20.52 at 380%
const ren = jobStats("Ren", ["Warrior"])!; // STR main, DEX secondary
const mage = jobStats("Bishop", ["Magician"])!;
const xenon = jobStats("Xenon", ["Thief", "Pirate"])!;
const da = jobStats("Demon Avenger", ["Warrior"])!;
const shadower = jobStats("Shadower", ["Thief"])!;

describe("linePoints: one potential line in hundredths of main stat", () => {
  it("main and secondary stat, flat and %, for a Ren", () => {
    // 13 × 12.97 = 168.61; 10 × 1.68 = 16.8; 12 × 1 = 12; 12 × 0.125 = 1.5
    expect(["STR +13%", "DEX +10%", "STR +12", "DEX +12", "INT +13%", "LUK +6"].map((l) => linePoints(l, ren, V))).toEqual([16861, 1680, 1200, 150, 0, 0]);
  });
  it("all stats: % at its own value, flat as every stat it raises", () => {
    // 10 × 14.65 = 146.5; +5 flat = 5 STR + 5 DEX × 0.125 = 5.625
    expect(["All Stats +10%", "All Stats +5"].map((l) => linePoints(l, ren, V))).toEqual([14650, 563]);
  });
  it("attack: the job's own kind only, flat at 1 ATT and % at 1% ATT", () => {
    // 13 × 53.82 = 699.66; 32 × 4 = 128
    expect(["ATT +13%", "ATT +32", "Magic ATT +13%"].map((l) => linePoints(l, ren, V))).toEqual([69966, 12800, 0]);
    expect(["ATT +13%", "Magic ATT +13%", "Magic ATT +32"].map((l) => linePoints(l, mage, V))).toEqual([0, 69966, 12800]);
  });
  it("boss and damage at the boss value, IED at the bosses' defense picked, crit damage", () => {
    // 40 × 12 = 480; 13 × 12 = 156; 40 × 20.52 = 820.8 (380%) or 40 × 15.6 = 624 (300%); 8 × 42.38 = 339.04
    expect(["Boss Damage +40%", "Damage +13%", "Ignore Enemy DEF +40%", "Critical Damage +8%"].map((l) => linePoints(l, ren, V))).toEqual([48000, 15600, 82080, 33904]);
    expect(linePoints("Ignore Enemy DEF +40%", ren, { ...V, bossDef: 300 })).toBe(62400);
  });
  it("skill cooldown: 0 until its value is typed, then that final damage as score", () => {
    expect(linePoints("Skill Cooldown -2 sec", ren, V)).toBe(0);
    // 2 s × 3% FD a second = 6% FD = 6 ÷ 0.785 × 100 = 764.33 score
    expect(linePoints("Skill Cooldown -2 sec", ren, { ...V, cooldown: 3 })).toBe(76433);
    expect(linePoints("Skill Cooldown -2 sec", ren, { ...V, cooldown: 3, fdPer100: 0 })).toBe(0);
  });
  it("only whole lines count: a line with more around it (\"STR +2 per 10 character levels\") is another line", () => {
    const lines = ["STR +13%", "All Stats +10%", "Max HP +12%", "ATT +13%", "Boss Damage +40%", "Damage +13%", "Ignore Enemy DEF +40%", "Critical Damage +8%", "Skill Cooldown -2 sec"];
    const values = { ...V, cooldown: 3 };
    for (const job of [ren, da]) {
      for (const line of lines) {
        expect(linePoints(`Max ${line}`, job, values)).toBe(0);
        expect(linePoints(`${line} per 10 character levels`, job, values)).toBe(0);
      }
    }
    // and every number of digits counts: 12% critical damage, a 10 s cooldown (made-up values)
    expect([linePoints("Critical Damage +12%", ren, V), linePoints("Skill Cooldown -10 sec", ren, { ...V, cooldown: 0.785 })]).toEqual([50856, 100000]);
  });

  it("an item's ignore defense lines multiply, as in game: 40, 40 and 30% are 74.8%, not 110%", () => {
    // 1 − 0.6 × 0.6 × 0.7 = 0.748: 74.8 × 20.52 = 1534.896
    expect(linesPoints(["Ignore Enemy DEF +40%", "Ignore Enemy DEF +40%", "Ignore Enemy DEF +30%"], ren, V)).toBe(153490);
    // one line alone as before (40 × 20.52); with others: ATT 13% 699.66 + boss 40% 480 + IED 35% 718.2
    expect(linesPoints(["Ignore Enemy DEF +40%", null, null], ren, V)).toBe(linePoints("Ignore Enemy DEF +40%", ren, V));
    expect(linesPoints(["ATT +13%", "Boss Damage +40%", "Ignore Enemy DEF +35%"], ren, V)).toBe(189786);
    // two IED lines at 300% defense: 64% × 15.6 = 998.4
    expect(linesPoints(["Ignore Enemy DEF +40%", "Ignore Enemy DEF +40%", "STR +13%"], ren, { ...V, bossDef: 300 })).toBe(99840 + 16861);
    expect(linesPoints([null, null, null], ren, V)).toBe(0);
    expect([iedPercent("Ignore Enemy DEF +35%"), iedPercent("Ignore Enemy DEF +35% when hit"), iedPercent("Max Ignore Enemy DEF +35%"), iedPercent("Boss Damage +35%")]).toEqual([35, 0, 0, 0]);
  });

  it("lines that add no damage are worth nothing", () => {
    expect(["Critical Rate +12%", "Max HP +12%", "Max HP +300", "DEF +6%", "Item Drop Rate +20%", "Mesos Obtained +20%", "Enables <Decent Haste>"].map((l) => linePoints(l, ren, V))).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });
  it("Demon Avenger: HP is its main stat (1% HP 12.97 until typed); stats and all stats are nothing", () => {
    // 12 × 12.97 = 155.64; 300 HP = 300
    expect(["Max HP +12%", "Max HP +300", "STR +13%", "All Stats +10%", "All Stats +5"].map((l) => linePoints(l, da, V))).toEqual([15564, 30000, 0, 0, 0]);
  });
  it("Xenon: a single stat % line a third of a main stat % line until typed, all stats % at the All Stat value; flat stats count each", () => {
    // 13 × 12.97 ÷ 3 = 56.2033; 10 × 14.65 = 146.5; +5 all stats = 15
    expect(["STR +13%", "LUK +13%", "INT +13%", "All Stats +10%", "STR +12", "All Stats +5"].map((l) => linePoints(l, xenon, V))).toEqual([5620, 5620, 0, 14650, 1200, 1500]);
    // each of its three typed on its own
    expect(["STR +13%", "DEX +13%", "LUK +13%"].map((l) => linePoints(l, xenon, { ...V, strPct: 5, dexPct: 4, lukPct: 6 }))).toEqual([6500, 5200, 7800]);
  });

  it("each stat's 1% value: what's typed, else the job's default; nothing for a stat the job doesn't use", () => {
    expect([pctDefault(ren, "STR"), pctDefault(ren, "DEX"), pctDefault(ren, "INT"), pctDefault(ren, "HP"), pctDefault(da, "HP"), pctDefault(da, "STR"), pctDefault(xenon, "LUK"), pctDefault(shadower, "STR")]).toEqual([12.97, 1.68, 0, 0, 12.97, 0, 12.97 / 3, 1.68]);
    const typed = { ...V, strPct: 13.5, dexPct: 2, intPct: 99, hpPct: 7 };
    expect([pctWorth(ren, typed, "STR"), pctWorth(ren, typed, "DEX"), pctWorth(ren, typed, "INT"), pctWorth(ren, typed, "HP"), pctWorth(da, typed, "HP"), pctWorth(ren, V, "STR")]).toEqual([13.5, 2, 0, 0, 7, 12.97]);
    // a typed value scores the line: 13 × 13.5 = 175.5
    expect(linePoints("STR +13%", ren, typed)).toBe(17550);
    expect(linePoints("Max HP +12%", da, typed)).toBe(8400);
  });

  it("statBoxes: the boxes each job needs", () => {
    expect(statBoxes(ren)).toEqual({ pct: [{ stat: "STR", field: "strPct", main: true, default: 12.97 }, { stat: "DEX", field: "dexPct", main: false, default: 1.68 }], magic: false, secondary: true, allStat: true });
    expect(statBoxes(mage)).toMatchObject({ pct: [{ stat: "INT", main: true }, { stat: "LUK", main: false }], magic: true });
    expect(statBoxes(xenon)).toEqual({ pct: ["STR", "DEX", "LUK"].map((stat) => ({ stat, field: `${stat.toLowerCase()}Pct`, main: true, default: 12.97 / 3 })), magic: false, secondary: false, allStat: true });
    expect(statBoxes(da)).toEqual({ pct: [{ stat: "HP", field: "hpPct", main: true, default: 12.97 }], magic: false, secondary: false, allStat: false });
    expect(statBoxes(shadower).pct.map((p) => [p.stat, p.main])).toEqual([["LUK", true], ["STR", false], ["DEX", false]]);
  });
  it("two secondary stats (Shadower): each at the secondary value", () => {
    expect(["STR +10%", "DEX +10%", "LUK +10%"].map((l) => linePoints(l, shadower, V))).toEqual([1680, 1680, 12970]);
  });
});

// a line's score from its name, for made-up tables
const pts = (line: string) => (line.startsWith("A") ? 100 : 0);

describe("rollDistribution: one cube's 3 lines, exactly", () => {
  it("three independent lines add up (a coin each: 0, 1, 2 or 3 good lines at 1/8, 3/8, 3/8, 1/8)", () => {
    const slot = [
      { line: "A", chance: 50 },
      { line: "B", chance: 50 },
    ];
    expect(rollDistribution([slot, slot, slot], pts)).toEqual([
      [0, 0.125],
      [100, 0.375],
      [200, 0.375],
      [300, 0.125],
    ]);
  });
  it("ignore defense lines multiply in a roll too, at the IED value given", () => {
    const slot = [
      { line: "Ignore Enemy DEF +40%", chance: 50 },
      { line: "A", chance: 50 },
    ];
    // two lines, in hundredths (A is 1 point; IED 1 point a percent here): A A 200; IED and A 40 + 1 = 4100;
    // IED IED 1 − 0.6 × 0.6 = 64%, 6400 (not 80%)
    expect(rollDistribution([slot, slot], pts, 1)).toEqual([
      [200, 0.25],
      [4100, 0.5],
      [6400, 0.25],
    ]);
    // no IED value: IED lines worth nothing
    expect(rollDistribution([slot, slot], pts)).toEqual([
      [0, 0.25],
      [100, 0.5],
      [200, 0.25],
    ]);
  });

  it("what's missing from 100% (lines left untranslated) counts as a line worth 0, on every line", () => {
    expect(rollDistribution([[{ line: "A", chance: 60 }]], pts)).toEqual([
      [0, 0.4],
      [100, 0.6],
    ]);
    // two lines: 0.4², 2 × 0.4 × 0.6, 0.6² (the rest isn't a limited kind)
    expect(rollDistribution([[{ line: "A", chance: 60 }], [{ line: "A", chance: 60 }]], pts).map(([s, p]) => [s, Number(p.toFixed(12))])).toEqual([
      [0, 0.16],
      [100, 0.48],
      [200, 0.36],
    ]);
  });
  it("at most 1 Decent skill line: once rolled, the later lines leave it out", () => {
    const slot = [
      { line: "Enables <Decent Haste>", chance: 50 },
      { line: "A", chance: 50 },
    ];
    // D A A ½ · A D A ¼ · A A D ⅛ → 200 at ⅞; A A A ⅛ → 300 (two Decent lines can't happen)
    expect(rollDistribution([slot, slot, slot], pts)).toEqual([
      [200, 0.875],
      [300, 0.125],
    ]);
  });
  it("at most 2 'ignore damage' lines", () => {
    const slot = [
      { line: "10% chance to ignore 20% damage when hit", chance: 50 },
      { line: "A", chance: 50 },
    ];
    // I I → A (¼); I A ·, A I · and A A · each split ½ / ½: 100 at ½, 200 at ⅜, 300 at ⅛
    expect(rollDistribution([slot, slot, slot], pts)).toEqual([
      [100, 0.5],
      [200, 0.375],
      [300, 0.125],
    ]);
  });
  it("each limited kind counts on its own: a Decent line doesn't use up an 'ignore damage' line's room", () => {
    const slot = [
      { line: "Enables <Decent Haste>", chance: 50 },
      { line: "10% chance to ignore 20% damage when hit", chance: 50 },
    ];
    // D I I, I D I, I I D: one Decent and two ignore lines, always; ignore lines worth 100 here
    expect(rollDistribution([slot, slot, slot], (l) => (l.includes("ignore") ? 100 : 0))).toEqual([[200, 1]]);
  });

  it("only lines that really are the limited kinds are limited", () => {
    const slot = [
      { line: "Shorter Invincibility after being hit +1 sec", chance: 50 },
      { line: "A", chance: 50 },
    ];
    // not Nexon's "Invincibility after being hit" line, nor its Decent skill line: free to roll three times (1/8, 3/8, 3/8, 1/8)
    const free = [
      [0, 0.125],
      [100, 0.375],
      [200, 0.375],
      [300, 0.125],
    ];
    expect(rollDistribution([slot, slot, slot], pts)).toEqual(free);
    const decent = [
      { line: "Never Enables <Decent Haste>", chance: 50 },
      { line: "A", chance: 50 },
    ];
    expect(rollDistribution([decent, decent, decent], pts)).toEqual(free);
    const longer = [
      { line: "10% chance to ignore 20% damage when hit twice", chance: 50 },
      { line: "A", chance: 50 },
    ];
    expect(rollDistribution([longer, longer, longer], pts)).toEqual(free);
  });

  it("the rest are rescaled by Nexon's rule: shown chance ÷ (100% − the left-out chances)", () => {
    const later = [
      { line: "Enables <Decent Sharp Eyes>", chance: 20 },
      { line: "A", chance: 30 },
      { line: "B", chance: 50 },
    ];
    // after a first Decent line: A 30 / 80 = 0.375, B 50 / 80 = 0.625 on each later line
    const d = rollDistribution([[{ line: "Enables <Decent Haste>", chance: 100 }], later, later], pts);
    expect(d.map(([s]) => s)).toEqual([0, 100, 200]);
    expect(d.map(([, p]) => p)).toEqual([0.625 * 0.625, 2 * 0.375 * 0.625, 0.375 * 0.375].map((x) => expect.closeTo(x, 12)));
  });
});

const legendary: CubeRolls = {
  ranks: [
    [
      [0, 0.5],
      [100, 0.3],
      [200, 0.2],
    ],
  ],
  rankUp: [],
};
// two ranks: nothing at the first beats 0; a cube ranks it up 20% of the time, then rolls the second
const twoRanks: CubeRolls = {
  ranks: [
    [[0, 1]],
    [
      [0, 0.5],
      [100, 0.5],
    ],
  ],
  rankUp: [0.2],
};

describe("cubeUntil: cubing until a roll beats the current score, rank-ups on the way", () => {
  it("one rank: a fixed chance a cube (1 in 5 beats 100: 5 cubes, ending on 200)", () => {
    expect(cubeUntil(legendary, 0, 100)).toMatchObject({ cubes: expect.closeTo(5, 12), final: expect.closeTo(200, 12), first: 0.2 });
    // beating 0: half the rolls; they average (0.3 × 100 + 0.2 × 200) / 0.5 = 140
    expect(cubeUntil(legendary, 0, 0)).toMatchObject({ cubes: 2, final: 140, first: 0.5 });
  });
  it("a rank-up first: 5 cubes on average to rank up, ending there half the time, else 2 more: 6", () => {
    const c = cubeUntil(twoRanks, 0, 0);
    expect(c.cubes).toBeCloseTo(6, 12);
    expect(c.final).toBeCloseTo(100, 12);
    // the next cube: ranks up (20%) and beats it (50%)
    expect(c.first).toBeCloseTo(0.1, 12);
    expect(cubeUntil(twoRanks, 1, 0).cubes).toBe(2);
  });
  it("a rank-up while the lower rank can beat it too: either way ends it", () => {
    // beating 50: the first rank half the time, the second always; a cube ranks up 20% of the time
    const rolls: CubeRolls = {
      ranks: [
        [
          [0, 0.5],
          [100, 0.5],
        ],
        [
          [100, 0.5],
          [200, 0.5],
        ],
      ],
      rankUp: [0.2],
    };
    const c = cubeUntil(rolls, 0, 50);
    // ends: 0.2 × 1 + 0.8 × 0.5 = 0.6 a cube; never moves up without ending; stays 0.4
    expect(c.first).toBeCloseTo(0.6, 12);
    expect(c.steps[0]).toEqual({ stop: expect.closeTo(0.6, 12), up: 0, stay: expect.closeTo(0.4, 12) });
    expect(c.cubes).toBeCloseTo(1 / 0.6, 12);
    // ends on (0.2 × 150 + 0.8 × 0.5 × 100) / 0.6 = 116.67
    expect(c.final).toBeCloseTo(70 / 0.6, 9);
    // 1 − 0.4ⁿ: 60% after 1 cube, 84% after 2
    expect(cubesForChance(c, [0.6, 0.84, 0.85])).toEqual([1, 2, 3]);
  });

  it("every roll above the score: the first cube ends it", () => {
    expect(cubeUntil({ ranks: [[[50, 0.5], [100, 0.5]]], rankUp: [] }, 0, 0)).toMatchObject({ cubes: 1, final: 75, first: 1 });
  });

  it("never, when no roll beats it", () => {
    expect(cubeUntil(legendary, 0, 200).cubes).toBe(Infinity);
    expect(cubeUntil(twoRanks, 0, 100).cubes).toBe(Infinity);
  });
  it("agrees with cubing simulated one cube at a time", () => {
    // four made-up ranks with their rank-up chances, simulated 20,000 times
    const rolls: CubeRolls = {
      ranks: [
        [
          [0, 0.7],
          [50, 0.3],
        ],
        [
          [0, 0.5],
          [80, 0.4],
          [150, 0.1],
        ],
        [
          [40, 0.6],
          [160, 0.3],
          [260, 0.1],
        ],
        [
          [100, 0.5],
          [220, 0.35],
          [400, 0.15],
        ],
      ],
      rankUp: [0.3, 0.15, 0.08],
    };
    let seed = 7;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const draw = (dist: [number, number][]) => {
      let x = random();
      for (const [s, p] of dist) if ((x -= p) < 0) return s;
      return dist.at(-1)![0];
    };
    const runs = 20000;
    let cubes = 0;
    let squares = 0;
    let finals = 0;
    for (let k = 0; k < runs; k++) {
      let rank = 0;
      let n = 0;
      let s = 0;
      do {
        n += 1;
        if (rank < 3 && random() < rolls.rankUp[rank]!) rank += 1;
        s = draw(rolls.ranks[rank]!);
      } while (s <= 150);
      cubes += n;
      squares += n * n;
      finals += s;
    }
    const mean = cubes / runs;
    const spread = Math.sqrt((squares / runs - mean * mean) / runs);
    const exact = cubeUntil(rolls, 0, 150);
    expect(Math.abs(exact.cubes - mean)).toBeLessThan(4 * spread);
    expect(exact.final).toBeCloseTo(finals / runs, -1);
  });
});

describe("cubesForChance: the cubes for an X% chance of ending", () => {
  it("one rank: 1 − 0.8ⁿ ≥ X, so 2, 4, 6 and 21 cubes for 25, 50, 70 and 99%", () => {
    expect(cubesForChance(cubeUntil(legendary, 0, 100), [0.25, 0.5, 0.7, 0.99])).toEqual([2, 4, 6, 21]);
  });
  it("built up cube by cube over the ranks (10%, then 23%, then 35.9% by the 3rd cube)", () => {
    expect(cubesForChance(cubeUntil(twoRanks, 0, 0), [0.1, 0.2, 0.25, 0.359])).toEqual([1, 2, 3, 3]);
  });
  it("an exact count stays exact: half a cube's rolls beat 0, so 1, 2 and 3 cubes give 50, 75 and 87.5%", () => {
    expect(cubesForChance(cubeUntil(legendary, 0, 0), [0.5, 0.75, 0.875])).toEqual([1, 2, 3]);
  });

  it("a high chance from a low rank: worked cube by cube once the lower rank has drained", () => {
    // the chance it hasn't ended after n cubes, straight from the rules: at the first rank (×0.8 a
    // cube), or moved up without ending (0.1 of those, then ×0.5 a cube)
    const notYet = (n: number) => {
      let first = 1;
      let second = 0;
      for (let k = 0; k < n; k++) [first, second] = [first * 0.8, first * 0.1 + second * 0.5];
      return first + second;
    };
    const want = [0.9, 0.99, 0.999].map((x) => {
      let n = 1;
      while (1 - notYet(n) < x - 1e-12) n += 1;
      return n;
    });
    expect(cubesForChance(cubeUntil(twoRanks, 0, 0), [0.9, 0.99, 0.999])).toEqual(want);
    expect(want).toEqual([12, 22, 33]);
  });

  it("never: null", () => {
    expect(cubesForChance(cubeUntil(legendary, 0, 200), [0.5])).toEqual([null]);
  });
});

describe("cubeMetrics", () => {
  it("chance, cubes and meso to a better roll, the average gain, and meso per 1% final damage", () => {
    // 1 in 5 beats 100, ending on 200 (+1 point); 5 cubes × 10m = 50m for +1 × 1 / 100 = 0.01% FD: 5B per 1%
    const m = cubeMetrics(legendary, 0, 100, 10e6, 1);
    expect(m).toMatchObject({ better: 0.2, rankUp: 0, cubesToBetter: expect.closeTo(5, 12), mesoToBetter: expect.closeTo(50e6, 5), gainIfBetter: expect.closeTo(1, 12), fdIfBetter: expect.closeTo(0.01, 12), mesoPerFd: expect.closeTo(5e9, 2) });
    expect(m.cubesForChance).toEqual([0.25, 0.5, 0.7, 0.99].map((chance, i) => ({ chance, cubes: [2, 4, 6, 21][i] })));
  });
  it("below the top rank: its rank-up chance", () => {
    expect(cubeMetrics(twoRanks, 0, 0, 10e6, 1).rankUp).toBe(0.2);
  });
  it("nothing to gain: no meso figures", () => {
    expect(cubeMetrics(legendary, 0, 200, 10e6, 1)).toMatchObject({ better: 0, cubesToBetter: null, mesoToBetter: null, gainIfBetter: null, fdIfBetter: null, mesoPerFd: null });
    // a final damage value of 0 makes it endless per 1%
    expect(cubeMetrics(legendary, 0, 100, 10e6, 0).mesoPerFd).toBeNull();
  });
});

describe("oneCube and cubesToReach", () => {
  it("one cube's result includes its rank-up share of the next rank's roll", () => {
    expect(oneCube(twoRanks, 0)).toEqual([
      [0, 0.9],
      [100, 0.1],
    ]);
    expect(oneCube(legendary, 0)).toEqual(legendary.ranks[0]);
  });
  it("cubes to reach at least a score (in points), rolls being whole hundredths", () => {
    expect(cubesToReach(twoRanks, 0, 1)).toBeCloseTo(6, 12);
    expect(cubesToReach(twoRanks, 0, 0.995)).toBeCloseTo(6, 12);
    expect(cubesToReach(legendary, 0, 2)).toBeCloseTo(5, 12);
    expect(cubesToReach(legendary, 0, 2.01)).toBeNull();
  });
});
