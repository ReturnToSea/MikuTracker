import { describe, expect, it } from "vitest";
import { boomDropTo, tapCost } from "../gameFigures/starForceCosts";
import { choices, jumps, nextStar, percentile, random, type Row, rows, simulate, type SfOptions, stopStar, type Tap, taps } from "./starForce";

// Numbers worked out by hand (written next to each), and checked against tadeucci's own engine
// (rates.js / simulator.js / optimizer.js planMetrics, run on the same picks: 2026-10-27) and masonym's
// (utils.js evaluateStrategy, for the +1 star event), not by running the same code.
const NONE: SfOptions = { events: [], mvp: "none" };
const opt = (events: SfOptions["events"], mvp: SfOptions["mvp"] = "none"): SfOptions => ({ events, mvp });
const sum = (list: Tap[], from: number, to: number, key: "avgCost" | "avgBooms") => list.slice(from, to).reduce((a, t) => a + t[key], 0);

describe("tapCost", () => {
  it("0–9★: 100 × round(level³ × (star + 1) ÷ 2,500 + 10), the level rounded down to tens", () => {
    // Lv. 150: 3,375,000 ÷ 2,500 = 1,350, + 10 → 136,000; 9★: × 10 = 13,500 + 10 → 1,351,000; Lv. 159 counts as 150
    expect([tapCost(0, 150), tapCost(9, 150), tapCost(0, 159)]).toEqual([136_000, 1_351_000, 136_000]);
  });

  it("10★ up: level³ × (star + 1)^2.7 ÷ the star's divisor; the same as tadeucci's for 8 levels × 30 stars", () => {
    // Lv. 200, 15★: 8,000,000 × 16^2.7 (= 2^10.8 = 1,782.887) ÷ 20,000 + 10 = 713,164.8 → 71,316,500
    expect(tapCost(15, 200)).toBe(71_316_500);
    // 17★ divides by 15,000 (20,000 ÷ 4/3): Lv. 200 → 8e6 × 18^2.7 ÷ 15,000 + 10
    expect(tapCost(17, 200)).toBe(100 * Math.round((8e6 * 18 ** 2.7) / 15000 + 10));
    expect([tapCost(18, 200), tapCost(19, 200), tapCost(21, 200), tapCost(22, 200)]).toEqual([18, 19, 21, 22].map((s) => 100 * Math.round((8e6 * (s + 1) ** 2.7) / { 18: 7000, 19: 4500, 21: 12500, 22: 20000 }[s]! + 10)));
    // tadeucci's baseCost, run 2026-10-27 (it matched ours for 8 levels × 30 stars)
    expect([tapCost(16, 160), tapCost(22, 250), tapCost(10, 140)]).toEqual([43_008_300, 371_070_400, 4_448_200]);
  });

  it("where a boom leaves the item: 12★ (15–19), 15★ (20), 17★ (21–22), 19★ (23–25), 20★ (26–29)", () => {
    expect([15, 19, 20, 21, 22, 23, 25, 26, 29].map(boomDropTo)).toEqual([12, 12, 15, 17, 17, 19, 19, 20, 20]);
  });
});

describe("choices", () => {
  it("18★: Modes 1–4 at 1 / 2 / 3.5 / 6.5× the cost, the rates as the game shows them", () => {
    const c = choices(18, 200, NONE);
    const base = tapCost(18, 200);
    expect(c.map((x) => [x.pick, x.cost, x.success, x.boom])).toEqual([["Mode 1", base, 0.1575, 0.0674], ["Mode 2", base * 2, 0.126, 0.0437], ["Mode 3", Math.round(base * 3.5), 0.105, 0.0179], ["Mode 4", Math.round(base * 6.5), 0.084, 0]]);
  });

  it("15–17★: Modes 1–3 and Safeguard (3× the cost, no booms); other stars nothing to choose", () => {
    expect(choices(16, 200, NONE).map((x) => x.pick)).toEqual(["Mode 1", "Mode 2", "Mode 3", "Safeguard"]);
    expect(choices(16, 200, NONE).at(-1)).toEqual({ pick: "Safeguard", cost: tapCost(16, 200) * 3, success: 0.315, boom: 0 });
    expect(choices(14, 200, NONE)).toEqual([{ pick: "—", cost: tapCost(14, 200), success: 0.315, boom: 0 }]);
    expect(choices(22, 200, NONE)).toEqual([{ pick: "—", cost: tapCost(22, 200), success: 0.1575, boom: 0.1685 }]);
  });

  it("30% off multiplies every tap, but not Safeguard's extra (base × 0.7 + 2 base)", () => {
    const base = tapCost(16, 200);
    const c = choices(16, 200, opt(["thirtyOff"]));
    expect(c[0]!.cost).toBe(Math.round(base * 0.7));
    expect(c[1]!.cost).toBe(Math.round(base * 1.5 * 0.7));
    expect(c.at(-1)!.cost).toBe(Math.round(base * 2.7));
  });

  it("MVP on taps from 16★ or below, multiplied with 30% off; none from 17★", () => {
    const at16 = tapCost(16, 200);
    // tadeucci's in-game check: Lv. 200 16→17★, Shining Star Force and Silver: base × 0.70 × 0.97
    expect(choices(16, 200, opt(["thirtyOff"], "silver"))[0]!.cost).toBe(Math.round(at16 * 0.7 * 0.97));
    expect(choices(16, 200, opt([], "diamond"))[0]!.cost).toBe(Math.round(at16 * 0.9));
    expect(choices(16, 200, opt([], "gold")).at(-1)!.cost).toBe(Math.round(at16 * (0.95 + 2)));
    expect(choices(17, 200, opt([], "diamond"))[0]!.cost).toBe(tapCost(17, 200));
  });

  it("30% fewer booms on taps from 21★ or below (21→22★ included: the owner), not from 22★", () => {
    expect(choices(21, 200, opt(["fewerBooms"]))[0]!.boom).toBeCloseTo(0.126375 * 0.7, 12);
    expect(choices(21, 200, opt(["fewerBooms"]))[3]!.boom).toBe(0);
    expect(choices(22, 200, opt(["fewerBooms"]))[0]!.boom).toBe(0.1685);
  });

  it("5/10/15: those taps can't fail (with the discounts); the others are as usual", () => {
    expect(choices(15, 200, opt(["fiveTenFifteen"], "gold"))).toEqual([{ pick: "—", cost: Math.round(tapCost(15, 200) * 0.95), success: 1, boom: 0 }]);
    expect(choices(5, 200, opt(["fiveTenFifteen", "thirtyOff"]))).toEqual([{ pick: "—", cost: Math.round(tapCost(5, 200) * 0.7), success: 1, boom: 0 }]);
    expect(choices(16, 200, opt(["fiveTenFifteen"]))[0]!.success).toBe(0.315);
  });

  it("+1: a success at 10★ or below adds 2 stars, within the item's limit", () => {
    const plus = opt(["plusOne"]);
    expect([nextStar(9, 30, plus), nextStar(10, 30, plus), nextStar(11, 30, plus), nextStar(9, 10, plus), nextStar(9, 30, NONE)]).toEqual([11, 12, 12, 10, 10]);
  });
});

describe("taps: the average cost and booms to clear each star", () => {
  it("a star that can't boom: its tap cost ÷ its success chance", () => {
    const t = taps(200, 30, NONE, 0, null);
    expect(t[12]!.avgCost).toBeCloseTo(tapCost(12, 200) / 0.42, 6);
    expect(t[12]!.avgBooms).toBe(0);
  });

  it("15★: (cost + boom × climbing 12→15) ÷ success, worked out step by step", () => {
    const t = taps(200, 30, NONE, 0, null);
    const climb = t[12]!.avgCost + t[13]!.avgCost + t[14]!.avgCost;
    expect(t[15]!.avgCost).toBeCloseTo((tapCost(15, 200) + 0.02055 * climb) / 0.315, 4);
    expect(t[15]!.avgBooms).toBeCloseTo(0.02055 / 0.315, 12);
  });

  it("the same totals as tadeucci's engine for the same picks", () => {
    const at = (lv: number, o: SfOptions) => taps(lv, 30, o, 0, null);
    expect(sum(at(200, NONE), 17, 22, "avgCost")).toBeCloseTo(31_296_211_406, -1);
    expect(sum(at(200, NONE), 17, 22, "avgBooms")).toBeCloseTo(7.246026, 5);
    expect(sum(at(200, opt(["thirtyOff", "fewerBooms"], "silver")), 12, 22, "avgCost")).toBeCloseTo(16_103_087_678, -1);
    expect(sum(at(250, opt(["thirtyOff"], "diamond")), 15, 25, "avgBooms")).toBeCloseTo(116.553278, 4);
    expect(sum(at(160, opt(["fiveTenFifteen"], "gold")), 0, 22, "avgCost")).toBeCloseTo(15_864_642_426, -1);
  });

  it("a boom price adds the price × the average booms (300m: 3.219377 booms → +965.8m)", () => {
    const free = taps(150, 30, NONE, 0, null);
    const priced = taps(150, 30, NONE, 300e6, null);
    // tadeucci's engine with the same picks (Mode 3 at 20★ once booms cost something) and no boom
    // price: 7,679,474,626 meso and 3.219377 booms; the price adds 300m × 3.219377
    expect(sum(priced, 12, 21, "avgBooms")).toBeCloseTo(3.219377, 5);
    expect(sum(priced, 12, 21, "avgCost")).toBeCloseTo(7_679_474_626 + 300e6 * 3.219377, -3);
    expect(priced[20]!.pick).toBe("Mode 3");
    expect(free[20]!.pick).toBe("Mode 1");
  });

  it("the cheapest choice per star: with no boom price Mode 1; a big one makes Mode 4 / Safeguard worth it", () => {
    expect(taps(200, 30, NONE, 0, null).slice(15, 22).map((t) => t.pick)).toEqual(["Mode 1", "Mode 1", "Mode 1", "Mode 1", "Mode 1", "Mode 1", "Mode 1"]);
    const dear = taps(200, 30, NONE, 1e12, null);
    expect(dear.slice(15, 22).map((t) => t.boom)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("the boxes: 1 1 4 4 (Mode 1 to 20★, then Mode 4) and 4 4 4 4 (Safeguard, then Mode 4)", () => {
    // with no boom price the cheapest would be Mode 1 everywhere: the box forces Mode 4 on 20→22★
    expect(taps(200, 30, NONE, 0, "1144").slice(15, 22).map((t) => t.pick)).toEqual(["Mode 1", "Mode 1", "Mode 1", "Mode 1", "Mode 1", "Mode 4", "Mode 4"]);
    // and with a huge one, Mode 1 still on 15→20★ (no Safeguard)
    expect(taps(200, 30, NONE, 1e12, "1144").slice(15, 20).map((t) => t.pick)).toEqual(["Mode 1", "Mode 1", "Mode 1", "Mode 1", "Mode 1"]);
    const safe = taps(200, 30, NONE, 0, "4444");
    expect(safe.slice(15, 22).map((t) => t.pick)).toEqual(["Safeguard", "Safeguard", "Safeguard", "Mode 4", "Mode 4", "Mode 4", "Mode 4"]);
    expect(sum(safe, 15, 22, "avgBooms")).toBe(0);
    // from 22★ there's nothing to choose
    expect(safe[22]!.pick).toBe("—");
    // 5/10/15 leaves no Safeguard to pick at 15★: the guaranteed tap stands
    expect(taps(200, 30, opt(["fiveTenFifteen"]), 0, "4444")[15]!.success).toBe(1);
  });
});

describe("rows", () => {
  it("along the run's path: one star at a time, or two at 10★ and below with +1 (as masonym's solver)", () => {
    const plus = opt(["plusOne"]);
    const t = taps(160, 30, plus, 0, null);
    const r = rows(t, 3, 30, plus, () => 1);
    expect(r.slice(0, 6).map((x) => `${x.from}→${x.to}`)).toEqual(["3→5", "5→7", "7→9", "9→11", "11→12", "12→13"]);
    // masonym's evaluateStrategy: Lv. 160 3→12★ with +1 = 39,056,790; 0→15★ = 470,067,229
    expect(r.filter((x) => x.to <= 12).reduce((a, x) => a + x.tap.avgCost, 0)).toBeCloseTo(39_056_790, -1);
    expect(rows(t, 0, 30, plus, () => 1).filter((x) => x.to <= 15).reduce((a, x) => a + x.tap.avgCost, 0)).toBeCloseTo(470_067_229, -1);
  });

  it("each row's final damage from the function given; none past the limit", () => {
    const r = rows(taps(200, 22, NONE, 0, null), 20, 22, NONE, (from, to) => from * 10 + to);
    expect(r.map((x) => [x.from, x.to, x.fd])).toEqual([[20, 21, 221], [21, 22, 232]]);
    expect(rows(taps(200, 22, NONE, 0, null), 22, 22, NONE, () => 1)).toEqual([]);
  });
});

describe("jumps and stopStar", () => {
  // made-up rows: 10 meso for 1%, then 40 for 1%, then 10 for 1%
  const row = (from: number, cost: number, fd: number): Row => ({ from, to: from + 1, fd, tap: { star: from, pick: "—", cost, success: 1, boom: 0, avgCost: cost, avgBooms: 0 } });
  const R = [row(17, 10, 1), row(18, 40, 1), row(19, 10, 1)];

  it("from where it stands, the cheapest per 1% to any further star; then again from there", () => {
    // from 17: 10/1, 50/2, 60/3 → 17→18 at 10; from 18: 40/1, 50/2 → 18→20 at 25
    expect(jumps(R)).toEqual([{ from: 17, to: 18, cost: 10, fd: 1, perFd: 10 }, { from: 18, to: 20, cost: 50, fd: 2, perFd: 25 }]);
  });

  it("a tie keeps the nearer star: 10 for 1%, then 10 for 1% more (20 for 2%, the same) → stop at the first", () => {
    expect(jumps([row(5, 10, 1), row(6, 10, 1)]).map((j) => [j.from, j.to])).toEqual([[5, 6], [6, 7]]);
  });

  it("a row with no final damage: no meso per 1% (one star at a time)", () => {
    expect(jumps([row(5, 10, 0), row(6, 10, 0)]).map((j) => [j.from, j.to, j.perFd])).toEqual([[5, 6, null], [6, 7, null]]);
    // a free first star doesn't stop a later one from counting
    expect(jumps([row(5, 10, 0), row(6, 10, 1)])[0]).toEqual({ from: 5, to: 7, cost: 20, fd: 1, perFd: 20 });
  });

  it("the star to stop at: jumps taken while each is within the budget", () => {
    const j = jumps(R);
    expect([stopStar(j, 17, 9), stopStar(j, 17, 10), stopStar(j, 17, 24), stopStar(j, 17, 25), stopStar([], 17, 100)]).toEqual([17, 18, 18, 20, 17]);
    expect(stopStar(jumps([row(5, 10, 0)]), 5, 1e15)).toBe(5);
  });
});

describe("simulate", () => {
  // tapping every run out, for comparison (a separate, plainer simulation)
  function tapByTap(t: Tap[], from: number, to: number, boomCost: number, runs: number) {
    const rnd = random(999);
    const costs: number[] = [];
    const booms: number[] = [];
    for (let i = 0; i < runs; i++) {
      let s = from;
      let c = 0;
      let b = 0;
      while (s < to) {
        c += t[s]!.cost;
        const u = rnd();
        if (u < t[s]!.success) s += 1;
        else if (u < t[s]!.success + t[s]!.boom) {
          b += 1;
          c += boomCost;
          s = boomDropTo(s);
        }
      }
      costs.push(c);
      booms.push(b);
    }
    return { costs: costs.sort((a, b) => a - b), booms };
  }

  it("the same medians, percentiles, booms and boom chance as tapping each run out (40,000 runs each)", () => {
    for (const [lv, from, to, boomCost] of [[200, 17, 22, 0], [150, 12, 21, 300e6]] as const) {
      const t = taps(lv, 30, NONE, boomCost, null);
      const s = simulate(t, rows(t, from, 30, NONE, () => 1), to, boomCost, 40000, 7);
      const ref = tapByTap(t, from, to, boomCost, 40000);
      const sorted = Float64Array.from(s.costs).sort();
      for (const q of [0.5, 0.75, 0.9]) expect(percentile(sorted, q) / percentile(ref.costs, q)).toBeCloseTo(1, 1);
      const avgB = (b: ArrayLike<number>) => Array.from(b).reduce((a, x) => a + x, 0) / b.length;
      expect(avgB(s.booms) / avgB(ref.booms)).toBeCloseTo(1, 1);
      const any = (b: ArrayLike<number>) => Array.from(b).filter((x) => x > 0).length / b.length;
      expect(any(s.booms) - any(ref.booms)).toBeLessThan(0.02);
      // and the averages land on the exact ones
      expect(Array.from(s.costs).reduce((a, x) => a + x, 0) / 40000 / sum(t, from, to, "avgCost")).toBeCloseTo(1, 1);
    }
  });

  it("the same seed gives the same runs; a path with nothing to boom never booms", () => {
    const t = taps(200, 30, NONE, 0, null);
    const r = rows(t, 10, 30, NONE, () => 1);
    expect(Array.from(simulate(t, r, 15, 0, 500, 3).costs)).toEqual(Array.from(simulate(t, r, 15, 0, 500, 3).costs));
    expect(Array.from(simulate(t, r, 15, 0, 500, 3).booms).every((b) => b === 0)).toBe(true);
    // 10★ to 11★: one tap each time it succeeds, so every run costs a whole number of taps
    expect(Array.from(simulate(t, r, 11, 0, 200, 1).costs).every((c) => c % tapCost(10, 200) === 0)).toBe(true);
  });

  it("from 22★, a climb back can boom again lower down (22 → 17 → 12) without failing", () => {
    const t = taps(200, 30, NONE, 0, null);
    const s = simulate(t, rows(t, 22, 30, NONE, () => 1), 23, 0, 2000, 5);
    expect(Array.from(s.booms).some((b) => b > 1)).toBe(true);
    expect(Array.from(s.costs).every((c) => Number.isFinite(c) && c > 0)).toBe(true);
  });

  it("the +1 path: two stars a success at 10★ and below", () => {
    const plus = opt(["plusOne"]);
    const t = taps(160, 30, plus, 0, null);
    const s = simulate(t, rows(t, 0, 30, plus, () => 1), 12, 0, 20000, 2);
    const avg = Array.from(s.costs).reduce((a, x) => a + x, 0) / 20000;
    const exact = rows(t, 0, 30, plus, () => 1).filter((x) => x.to <= 12).reduce((a, x) => a + x.tap.avgCost, 0);
    expect(avg / exact).toBeCloseTo(1, 1);
  });

  it("nothing to do (the target is where it stands): every run costs 0", () => {
    const t = taps(200, 30, NONE, 0, null);
    expect(Array.from(simulate(t, rows(t, 20, 30, NONE, () => 1), 20, 0, 10, 1).costs)).toEqual(new Array(10).fill(0));
  });
});

describe("percentile and random", () => {
  it("the value that share of a sorted list stays at or under", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect([percentile(xs, 0.5), percentile(xs, 0.75), percentile(xs, 0.9), percentile(xs, 0.99), percentile(xs, 0), percentile(xs, 1)]).toEqual([6, 8, 10, 10, 1, 10]);
  });

  it("random: between 0 and 1, the same for a seed, different for another", () => {
    const a = random(1);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(xs.slice(0, 3)).toEqual(Array.from({ length: 3 }, random(1)));
    expect(random(2)()).not.toBe(xs[0]);
    // roughly even: about half below 0.5
    expect(xs.filter((x) => x < 0.5).length).toBeGreaterThan(450);
    expect(xs.filter((x) => x < 0.5).length).toBeLessThan(550);
  });
});
