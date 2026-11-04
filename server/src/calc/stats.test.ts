import { STAT_LINKS, STATS_DEFAULTS } from "@miku/shared";
import { describe, expect, it } from "vitest";
import reference from "../../test/fixtures/stats-mapledoro.json";
import { cooldownRefs, statLinks, statsJob } from "../gameFigures/stats";
import { cooldownBonus, finalDamage, generalRange, groups, heroicBonus, splineAt, splineReach, statsScore, tableBonus } from "./stats";

describe("statsScore against mapledoro's engine (the reference)", () => {
  it("every job, random sheets: the same damage, and the same score at 380% and 300%", () => {
    let worst = 0;
    for (const c of reference.cases) {
      const got = statsScore(statsJob(c.job)!, c.input as never, c.ctx, statLinks(), cooldownRefs());
      worst = Math.max(worst, Math.abs(got.damage / c.expected.damage - 1), Math.abs(got.damage300 / c.expected.damage300 - 1));
      expect([got.score380, got.score300], c.job).toEqual([c.expected.score380, c.expected.score300]);
    }
    expect(worst).toBeLessThan(1e-12);
  });
});

// The owner's screenshot of MapleScouter (a Mercedes, Lv. 286, Heroic, Liberated, Decent Combat Orders).
const MERCEDES = {
  ...STATS_DEFAULTS,
  stats: { ...STATS_DEFAULTS.stats, main: { base: 7812, per: 784, abs: 28770 }, sub: { base: 4388, per: 205, abs: 710 }, atk: { base: 4293, per: 129, abs: 0 }, dmg: 120 },
  liberation: true,
};
const SCREENSHOT = { level: 286, heroic: true };

describe("statsScore where the defense leaves nothing", () => {
  const job = statsJob("Adele")!;
  const ctx = { level: 286, heroic: true, cores: 1, coreAtt: 0, sacred: false };
  it("too little IED for the class (the defense factor at or below 0): no score, not 0 or a number from a negative damage", () => {
    // Adele keeps 2.47 of the defense at 0% IED: 1 − 2.47 < 0
    const s = statsScore(job, STATS_DEFAULTS, ctx, statLinks(), cooldownRefs());
    expect(s.damage).toBeLessThan(0);
    expect(s.score380).toBeNull();
  });
  it("exactly nothing left at 380% still gives 300%'s score (no division by 0)", () => {
    // IED so the class keeps exactly all of it: 1 − 1 / k
    const ied = (1 - 1 / job.defenseK) * 100;
    const s = statsScore(job, { ...STATS_DEFAULTS, stats: { ...STATS_DEFAULTS.stats, main: { base: 5000, per: 300, abs: 0 }, atk: { base: 3000, per: 100, abs: 0 }, ied } }, ctx, statLinks(), cooldownRefs());
    expect(Math.abs(s.damage)).toBeLessThan(1e-3);
    expect(s.score380).toBeNull();
    expect(Number.isFinite(s.damage300)).toBe(true);
    expect(s.score300).toBeGreaterThan(0);
  });
});

describe("finalDamage: the class's always-on × Liberation × Ruin Force Shield × the Heroic bonus", () => {
  const mercedes = statsJob("Mercedes")!;
  it("the screenshot's Mercedes: 1.500642 × 1.1 × 1.45 − 1 = 139.35% (MapleScouter's box)", () => {
    expect(finalDamage(mercedes, MERCEDES, SCREENSHOT)).toBeCloseTo((1.500642 * 1.1 * 1.45 - 1) * 100, 9);
    expect(finalDamage(mercedes, MERCEDES, SCREENSHOT).toFixed(2)).toBe("139.35");
  });
  it("by Combat Orders: none 48.824%, a Paladin's 51.3044% (the class's table)", () => {
    const fd = (combatOrders: "none" | "real") => finalDamage(mercedes, { ...STATS_DEFAULTS, combatOrders }, { level: 200, heroic: false });
    expect(fd("none")).toBeCloseTo(48.824, 9);
    expect(fd("real")).toBeCloseTo(51.3044, 9);
  });
  it("the Ruin Force Shield another × 1.1; not Heroic: no bonus", () => {
    expect(finalDamage(mercedes, { ...MERCEDES, ruinShield: true }, { level: 286, heroic: false })).toBeCloseTo((1.500642 * 1.1 * 1.1 - 1) * 100, 9);
  });
  it("the Heroic bonus by level: 15% under 100, 20% under 150, 25% under 200, 35% under 250, then 45%", () => {
    expect([1, 99, 100, 149, 150, 199, 200, 249, 250, 300].map(heroicBonus)).toEqual([15, 15, 20, 20, 25, 25, 35, 35, 45, 45]);
  });
});

describe("generalRange: the top of the game's damage range", () => {
  it("the screenshot's Mercedes: 272,801,300 (MapleScouter's General Range, to the point)", () => {
    // by hand: DEX 97,828, STR 14,093 (each base × (1 + %) rounded down, + not affected), ATT 9,830;
    // 1.3 × (4 × 97,828 + 14,093) × 9,830 / 100 = 51,806,690.47 → 51,806,690; × 2.2 × 2.393524 = 272,801,300.8
    expect(generalRange(statsJob("Mercedes")!, MERCEDES, "two", SCREENSHOT)).toBe(272_801_300);
  });
  it("MapleScouter's own answer for the same sheet not Heroic (the owner's capture): 220,299,311", () => {
    // its Final Damage there: 93.28782% (MapleScouter's, not Heroic, a different rule from the game's own);
    // our range with that Final Damage: the same to rounding
    const actual = Math.round((1.3 * (4 * 97_828 + 14_093) * 9_830) / 100);
    expect(Math.floor(actual * 2.2 * 1.9328782)).toBe(220_299_311);
  });
  it("the LUK thieves count both secondaries; Xenon 4 × its three; a stat % from familiars counts", () => {
    const sheet = { ...STATS_DEFAULTS, stats: { ...STATS_DEFAULTS.stats, main: { base: 1000, per: 100, abs: 0 }, sub: { base: 100, per: 0, abs: 0 }, third: { base: 50, per: 0, abs: 0 }, atk: { base: 1000, per: 0, abs: 0 } } };
    const flat = { level: 200, heroic: false };
    const job = { ...statsJob("Shadower")!, weapon: 1, finalDamage: [0, 0, 0] as [number, number, number] };
    // 4 × 2,000 + 100 + 50 = 8,150 × 1,000 / 100
    expect(generalRange(job, sheet, "luk3", flat)).toBe(81_500);
    expect(generalRange(job, sheet, "two", flat)).toBe(81_000);
    // Xenon: 4 × (2,000 + 100 + 50)
    expect(generalRange(job, sheet, "xenon", flat)).toBe(86_000);
    // familiars' main stat +10%: 1,000 × 2.1 = 2,100
    expect(generalRange(job, { ...sheet, famPct: { main: 10, sub: 0, third: 0 } }, "two", flat)).toBe(85_000);
  });
  it("Demon Avenger: its pure HP (545 + 90 a level) / 3.5 + 0.8 × the rest / 3.5 + STR", () => {
    const job = { ...statsJob("Demon Avenger")!, weapon: 1, finalDamage: [0, 0, 0] as [number, number, number] };
    const sheet = { ...STATS_DEFAULTS, stats: { ...STATS_DEFAULTS.stats, main: { base: 100_000, per: 0, abs: 0 }, sub: { base: 1000, per: 0, abs: 0 }, atk: { base: 1000, per: 0, abs: 0 } } };
    // Lv. 200: pure 18,545 → 5,298; the rest 81,455 / 3.5 → 23,272 × 0.8 = 18,617.6; + 1,000 = 24,915.6 × 10
    expect(generalRange(job, sheet, "hp", { level: 200, heroic: false })).toBe(Math.floor(Math.round(24_915.6 * 10)));
  });
  it("Hero, Paladin and Dawn Warrior: the one- or two-handed multiplier", () => {
    const job = { ...statsJob("Hero")!, finalDamage: [0, 0, 0] as [number, number, number] };
    const sheet = { ...STATS_DEFAULTS, stats: { ...STATS_DEFAULTS.stats, main: { base: 1000, per: 0, abs: 0 }, atk: { base: 1000, per: 0, abs: 0 } } };
    const flat = { level: 200, heroic: false };
    // 1.34 / 1.44 × 4,000 × 1,000 / 100
    expect(generalRange(job, { ...sheet, oneHanded: true }, "two", flat)).toBe(53_600);
    expect(generalRange(job, sheet, "two", flat)).toBe(57_600);
  });
});

describe("the curve: splineAt and splineReach (made-up points, worked out by hand)", () => {
  // points (0, 0), (10, 100), (20, 300); slopes 10, 10, 30
  const S = { x: [0, 10, 20], y: [0, 100, 300], m: [10, 10, 30] };
  it("before the first point and past the last: straight on, with the end's slope (a flat or falling last slope: barely rising)", () => {
    expect(splineAt(S, -5)).toBe(-50);
    // (a curve not starting at 0: from (5, 40), slope 2, at 3: 40 − 2 × 2)
    expect(splineAt({ x: [5, 15], y: [40, 60], m: [2, 2] }, 3)).toBe(36);
    expect(splineAt(S, 25)).toBe(450);
    expect(splineAt({ ...S, m: [10, 10, -1] }, 25)).toBeCloseTo(300 + 5e-9, 12);
  });
  it("within a segment: the cubic Hermite through its two points with their slopes; at a point, its value", () => {
    // at 5 (halfway): 0.5 × 0 + 0.125 × 10 × 10 + 0.5 × 100 − 0.125 × 10 × 10 = 50
    expect(splineAt(S, 5)).toBeCloseTo(50, 12);
    // at 15: 0.5 × 100 + 0.125 × 10 × 10 + 0.5 × 300 − 0.125 × 10 × 30 = 175
    expect(splineAt(S, 15)).toBeCloseTo(175, 12);
    expect(splineAt(S, 10)).toBeCloseTo(100, 12);
    expect(splineAt(S, 0)).toBe(0);
    expect(splineAt(S, 20)).toBe(300);
  });
  it("splineReach: where the curve reaches a value (by halving)", () => {
    expect(splineReach(S, 50)).toBeCloseTo(5, 6);
    expect(splineReach(S, 175)).toBeCloseTo(15, 6);
    expect(splineReach(S, 450)).toBeCloseTo(25, 6);
  });
});

describe("skill cooldown's bonus: tableBonus and cooldownBonus (made-up tables)", () => {
  const rows = [
    { h0: 100, bonus: { "2": 0.1, "6": 0.6 } },
    { h0: 200, bonus: { "2": 0.3, "6": 0.9 } },
  ];
  it("tableBonus: a straight line between the rows around the score; held at the ends", () => {
    expect(tableBonus(rows, 2, 150)).toBeCloseTo(0.2, 12);
    expect(tableBonus(rows, 2, 50)).toBe(0.1);
    expect(tableBonus(rows, 2, 250)).toBe(0.3);
    expect(tableBonus(rows, 6, 175)).toBeCloseTo(0.825, 12);
  });
  // two measured classes: x's bonuses over norm2 2, y's over 1; averaged: (b / 2 + b' / 1) / 2
  const refs = {
    x: { rows: [{ h0: 0, bonus: { "1": 0.1, "2": 0.2, "3": 0.3, "4": 0.4, "5": 0.5, "6": 0.6 } }], norm2: 2 },
    y: { rows: [{ h0: 0, bonus: { "1": 0.2, "2": 0.4, "3": 0.6, "4": 0.8, "5": 1, "6": 1.2 } }], norm2: 1 },
  };
  const shared = (s: number) => (refs.x.rows[0]!.bonus[String(s) as "1"] / 2 + refs.y.rows[0]!.bonus[String(s) as "1"]) / 2;
  const job = (cooldownScale?: Record<string, number>) => ({ ...statsJob("Mercedes")!, class: "made_up", cooldownScale });
  it("a class without its own table: the measured ones averaged, × its own scale at those seconds (between: a straight line)", () => {
    const j = job({ "2": 0.5, "4": 1 });
    expect(cooldownBonus(j, refs, 2, 0)).toBeCloseTo(0.5 * shared(2), 12);
    expect(cooldownBonus(j, refs, 3, 0)).toBeCloseTo(0.75 * shared(3), 12);
    expect(cooldownBonus(j, refs, 4, 0)).toBeCloseTo(1 * shared(4), 12);
    // below its first measured seconds: the first's; past its last: the last's
    expect(cooldownBonus(j, refs, 1, 0)).toBeCloseTo(0.5 * shared(1), 12);
    expect(cooldownBonus(j, refs, 5, 0)).toBeCloseTo(1 * shared(5), 12);
  });
  it("no scale measured: × 1; past 6 s: 6 s's, in proportion", () => {
    expect(cooldownBonus(job(), refs, 3, 0)).toBeCloseTo(shared(3), 12);
    expect(cooldownBonus(job({}), refs, 3, 0)).toBeCloseTo(shared(3), 12);
    expect(cooldownBonus(job(), refs, 9, 0)).toBeCloseTo((9 / 6) * shared(6), 12);
  });
  it("a class with its own table: that table, nothing averaged", () => {
    expect(cooldownBonus({ ...job({ "2": 0.5 }), class: "y" }, refs, 3, 0)).toBe(0.6);
  });
});

describe("statsScore and groups: the rest", () => {
  const sheet = { ...STATS_DEFAULTS, stats: { ...STATS_DEFAULTS.stats, main: { base: 5000, per: 300, abs: 0 }, atk: { base: 3000, per: 100, abs: 0 }, ied: 90 } };
  const ctx = { level: 286, heroic: true, cores: 1, coreAtt: 0, sacred: false };
  const mercedes = statsJob("Mercedes")!;
  it("a class without a curve: no score (at 380% without its 380% curve; both without the curve's scale)", () => {
    const { spline380: _drop, ...noCurve } = mercedes;
    void _drop;
    const s = statsScore(noCurve as typeof mercedes, sheet, ctx, statLinks(), cooldownRefs());
    expect(s.score380).toBeNull();
    expect(s.score300).not.toBeNull();
    expect(statsScore({ ...mercedes, splineScale: null }, sheet, ctx, statLinks(), cooldownRefs())).toMatchObject({ score380: null, score300: null });
  });
  it("event All Stats count as the buffs' All Stats do (7 of them: the Candied Apple's)", () => {
    const candy = groups(mercedes, { ...sheet, buffs: { ...sheet.buffs, candiedApple: true } }, ctx, statLinks()).g.stat;
    const event = groups(mercedes, { ...sheet, eventStats: { ...sheet.eventStats, allStat: 7 } }, ctx, statLinks()).g.stat;
    expect(event).toBeCloseTo(candy, 9);
    expect(event).toBeGreaterThan(groups(mercedes, sheet, ctx, statLinks()).g.stat);
  });
  it("below Lv. 260 everything 3% less; at 260, not", () => {
    const other = (level: number) => groups(mercedes, sheet, { ...ctx, level }, statLinks()).g.other;
    expect(other(259) / other(260)).toBeCloseTo(0.97, 12);
  });
  it("every link the page offers is in the figures, at every level it can be", () => {
    for (const [link, max] of Object.entries(STAT_LINKS)) {
      if (link === "magician") continue;
      for (let L = 0; L <= max; L++) expect(statLinks()[link]?.[String(L)], `${link} ${L}`).toBeTypeOf("number");
    }
  });
});
