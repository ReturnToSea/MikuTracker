import { describe, expect, it } from "vitest";
import { BOOST, type CostTable, type HexaStep, MASTERY, REN_NODES, REN_ORDER, STAT_PRIMARY_CHANCE, STAT_RANK_COST } from "../gameFigures/hexa";
import { addCost, daysFor, fdTogether, joinRuns, levelCost, NO_COST, priority, statExpected, statSpent } from "./hexa";

// (mulberry32, a small generator good enough for these simulations; a plain multiply-and-add one was 0.9% off)
function generator(start: number): () => number {
  let seed = start;
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const table = (key: string): CostTable => REN_NODES.find((n) => n.key === key)!.costs;

describe("levelCost", () => {
  it("a skill node: 5 Sol Erda and 100 fragments for level 1, 150 and 4,500 for all 30 (the wiki's table)", () => {
    expect(levelCost(table("ascent"), 0, 1)).toEqual({ erda: 5, frags: 100 });
    expect(levelCost(table("ascent"), 0, 30)).toEqual({ erda: 150, frags: 4500 });
    // level 10's step: 10 Sol Erda and 200 fragments
    expect(levelCost(table("ascent"), 9, 10)).toEqual({ erda: 10, frags: 200 });
    expect([levelCost(table("ascent"), 5, 5), levelCost(table("ascent"), 6, 5)]).toEqual([NO_COST, NO_COST]);
  });
  it("Mastery is half and Boost three quarters of a skill node, each rounded up (83 / 2,252 and 123 / 3,383 in all)", () => {
    // level 1: 5 × 0.5 = 2.5 → 3, 100 × 0.5 = 50; 5 × 0.75 = 3.75 → 4, 75
    expect([MASTERY.erda[0], MASTERY.frags[0], BOOST.erda[0], BOOST.frags[0]]).toEqual([3, 50, 4, 75]);
    expect(levelCost(MASTERY, 0, 30)).toEqual({ erda: 83, frags: 2252 });
    expect(levelCost(BOOST, 0, 30)).toEqual({ erda: 123, frags: 3383 });
  });
  it("the common nodes: Sol Janus and Sol Hecate 208 / 6,268; Ren's Lotus Flower 137 / 4,035 (InvenGlobal's total too)", () => {
    expect([levelCost(table("janus"), 0, 30), levelCost(table("hecate"), 0, 30), levelCost(table("common3"), 0, 30)]).toEqual([
      { erda: 208, frags: 6268 },
      { erda: 208, frags: 6268 },
      { erda: 137, frags: 4035 },
    ]);
    expect(levelCost(table("common3"), 0, 1)).toEqual({ erda: 4, frags: 90 });
  });
  it("addCost adds both", () => {
    expect(addCost({ erda: 1, frags: 2 }, { erda: 3, frags: 4 })).toEqual({ erda: 4, frags: 6 });
  });
});

describe("statExpected: a HEXA Stat node's expected fragments to a rank", () => {
  const E = (lines: [number, number, number], rank: number) => statExpected(lines[0], lines[0] + lines[1] + lines[2], rank, STAT_RANK_COST, STAT_PRIMARY_CHANCE);
  it("by hand: one rank-up at primary 0 is 10; two are 20 (both at 10 whatever is raised)", () => {
    expect([E([0, 0, 0], 1), E([0, 0, 0], 2), E([0, 0, 0], 0)]).toEqual([10, 20, 0]);
  });
  it("by hand: from primary 2, the first costs 10; 35% of the time the primary reaches 3 and the next costs 20, else 10: 23.5", () => {
    expect(E([2, 0, 0], 4)).toBeCloseTo(10 + 0.35 * 20 + 0.65 * 10, 12);
  });
  it("a primary at 9 costs 50 a rank-up; at 10 it can't be raised, still 50 (taken as 9's)", () => {
    expect(E([9, 0, 0], 10)).toBe(50);
    // from 9: 5% to 10, then 50 more either way
    expect(E([9, 0, 0], 11)).toBeCloseTo(100, 12);
    expect(E([10, 0, 0], 12)).toBe(100);
  });
  it("already there (or past it): nothing", () => {
    expect([E([5, 5, 5], 15), E([10, 10, 0], 20), E([5, 5, 5], 10)]).toEqual([0, 0, 0]);
  });
  it("which additional stat is raised doesn't change the cost: an additional stat at its max (10) costs the same", () => {
    expect(E([0, 10, 0], 12)).toBe(E([0, 5, 5], 12));
    expect(E([3, 10, 2], 20)).toBeCloseTo(E([3, 6, 6], 20), 12);
  });

  it("agrees with rank-ups simulated one at a time (the wiki's rules; 200,000 runs to rank 20)", () => {
    const rand = generator(7);
    let total = 0;
    const runs = 200_000;
    for (let i = 0; i < runs; i++) {
      let [p, a, b] = [0, 0, 0];
      while (p + a + b < 20) {
        total += STAT_RANK_COST[p]!;
        const q = p < 10 ? STAT_PRIMARY_CHANCE[p]! : 0;
        const r = rand();
        if (r < q) p++;
        else if (a >= 10) b++;
        else if (b >= 10) a++;
        else if (r < q + (1 - q) / 2) a++;
        else b++;
      }
    }
    expect(total / runs).toBeCloseTo(E([0, 0, 0], 20), 0);
    expect(Math.abs(total / runs / E([0, 0, 0], 20) - 1)).toBeLessThan(0.003);
  });
});

describe("statSpent: what a HEXA Stat node's rank-ups have cost, from its lines' levels", () => {
  const spent = (primary: number, additional: number) => statSpent(primary, additional, STAT_RANK_COST, STAT_PRIMARY_CHANCE);
  it("by hand: the main line alone to 6 is 10+10+10+20+20+20 = 90, exact; nothing at all, 0", () => {
    expect(spent(6, 0)).toEqual({ frags: 90, exact: true });
    expect(spent(0, 0)).toEqual({ frags: 0, exact: true });
  });
  it("by hand: the main line at 2 or below, every rank-up cost 10, exact (2 + 2: 40; 0 + 20: 200)", () => {
    expect(spent(2, 2)).toEqual({ frags: 40, exact: true });
    expect(spent(0, 20)).toEqual({ frags: 200, exact: true });
  });
  it("by hand: the main line at 3 and one additional rank-up: it came at main line 0, 1 or 2 (10, each 65% likely) or at 3 (20, 80%)", () => {
    // 30 for the main line; the additional one: (3 × 0.65 × 10 + 0.8 × 20) / (3 × 0.65 + 0.8) = 35.5 / 2.75
    const s = spent(3, 1);
    expect(s.frags).toBeCloseTo(30 + 35.5 / 2.75, 12);
    expect(s.exact).toBe(false);
  });
  it("by hand: the main line at 10 (it can't be raised: every rank-up there is an additional one, 50 each)", () => {
    // 0–9: 10×3 + 20×4 + 30 + 40 + 50 = 230; at least the cheapest order (all additional ones at main 0: 10 each)
    const s = spent(10, 1);
    expect(s.frags).toBeGreaterThan(230 + 10);
    expect(s.frags).toBeLessThan(230 + 50);
  });
  it("agrees with rank-ups simulated one at a time: each end state's average cost (300,000 runs to rank 20)", () => {
    const rand = generator(11);
    const seen = new Map<string, { runs: number; total: number }>();
    for (let i = 0; i < 300_000; i++) {
      let [p, a, b, total] = [0, 0, 0, 0];
      while (p + a + b < 20) {
        total += STAT_RANK_COST[p]!;
        const q = STAT_PRIMARY_CHANCE[p]!;
        const r = rand();
        if (r < q) p++;
        else if (a >= 10) b++;
        else if (b >= 10) a++;
        else if (r < q + (1 - q) / 2) a++;
        else b++;
      }
      const key = `${p}`;
      const s = seen.get(key) ?? { runs: 0, total: 0 };
      seen.set(key, { runs: s.runs + 1, total: s.total + total });
    }
    let checked = 0;
    for (const [p, { runs, total }] of seen) {
      if (runs < 10_000) continue;
      checked += 1;
      expect(Math.abs(total / runs / spent(+p, 20 - +p).frags - 1)).toBeLessThan(0.004);
    }
    // (the main line's usual end levels: 3 to 8)
    expect(checked).toBeGreaterThanOrEqual(4);
  });
});

describe("joinRuns: the order with the same node several steps in a row as one step", () => {
  it("to the last one's level, gains multiplied (+2% and +1%: +3.02%); different nodes and HEXA Stat steps stay apart", () => {
    const steps: HexaStep[] = [
      { node: "origin", from: 1, to: 2, fd: 2 },
      { node: "origin", from: 2, to: 4, fd: 1 },
      { node: "ascent", from: 0, to: 1, fd: 3 },
      { stat: 1, to: 20 },
      { stat: 2, to: 20 },
      { node: "ascent", from: 1, to: 2, fd: 1 },
    ];
    const joined = joinRuns(steps);
    expect(joined.map((s) => ("node" in s ? [s.node, s.from, s.to] : [`stat${s.stat}`]))).toEqual([["origin", 1, 4], ["ascent", 0, 1], ["stat1"], ["stat2"], ["ascent", 1, 2]]);
    expect((joined[0] as { fd: number }).fd).toBeCloseTo(3.02, 12);
    expect(joinRuns([])).toEqual([]);
  });
});

describe("priority: the job's order, without what's done or past what's wanted", () => {
  const T: CostTable = { erda: Array(30).fill(1), frags: Array(30).fill(10) };
  const tables = { a: T, b: T };
  const steps: HexaStep[] = [
    { node: "a" as never, from: 0, to: 1, fd: 2 },
    { node: "a" as never, from: 1, to: 2, fd: 1 },
    { node: "b" as never, from: 0, to: 4, fd: 4 },
    { stat: 1, to: 20 },
    { node: "a" as never, from: 2, to: 3, fd: 1 },
  ];
  const noStat = () => null;
  it("the same node's steps in a row are one row; their gains multiply (1.02 × 1.01 = +3.02%)", () => {
    const rows = priority(steps, { a: 0, b: 0 }, { a: 30, b: 30 }, tables, noStat);
    expect(rows.map((r) => [r.node, r.from, r.to, r.cost, r.partial])).toEqual([
      ["a", 0, 2, { erda: 2, frags: 20 }, false],
      ["b", 0, 4, { erda: 4, frags: 40 }, false],
      ["a", 2, 3, { erda: 1, frags: 10 }, false],
    ]);
    expect(rows[0]!.fd).toBeCloseTo(3.02, 12);
  });
  it("what's done is left out; a step partly done counts the rest, its gain in proportion to its fragments", () => {
    const rows = priority(steps, { a: 1, b: 1 }, { a: 30, b: 30 }, tables, noStat);
    expect(rows.map((r) => [r.node, r.from, r.to, r.fd, r.partial])).toEqual([
      ["a", 1, 2, 1, false],
      // b's 0→4 step from 1: 3 of its 4 levels' fragments, so 3 of its 4%
      ["b", 1, 4, 3, true],
      ["a", 2, 3, 1, false],
    ]);
  });
  it("nothing past the level wanted: a step cut short counts its part; a node already there, nothing", () => {
    const rows = priority(steps, { a: 0, b: 0 }, { a: 1, b: 2 }, tables, noStat);
    expect(rows.map((r) => [r.node, r.from, r.to, r.fd, r.partial])).toEqual([
      ["a", 0, 1, 2, false],
      ["b", 0, 2, 2, true],
    ]);
    expect(priority(steps, { a: 3, b: 4 }, { a: 30, b: 30 }, tables, noStat)).toEqual([]);
  });
  it("a HEXA Stat step: the row the callback gives (none: left out), with no final damage, never merged", () => {
    const rows = priority(steps, { a: 0, b: 0 }, { a: 30, b: 30 }, tables, (n, to) => ({ from: 3, to, cost: { erda: 5, frags: 99 + n } }));
    expect(rows.map((r) => [r.node, r.from, r.to, r.cost.frags, r.fd, r.partial])).toEqual([
      ["a", 0, 2, 20, expect.closeTo(3.02, 12), false],
      ["b", 0, 4, 40, 4, false],
      ["stat1", 3, 20, 100, null, false],
      ["a", 2, 3, 10, 1, false],
    ]);
  });
  it("two different nodes one after the other stay two rows, even where one's level meets the other's", () => {
    // a ends at 2, b starts at 2
    const rows = priority(steps, { a: 0, b: 2 }, { a: 30, b: 30 }, tables, () => null);
    expect(rows.map((r) => [r.node, r.from, r.to])).toEqual([
      ["a", 0, 2],
      ["b", 2, 4],
      ["a", 2, 3],
    ]);
  });
  it("a merged row is partial when any of its steps is", () => {
    const two: HexaStep[] = [
      { node: "a" as never, from: 0, to: 2, fd: 2 },
      { node: "a" as never, from: 2, to: 3, fd: 1 },
    ];
    // the first cut short at the start (a is at 1 of its 0→2), the second whole
    expect(priority(two, { a: 1 }, { a: 30 }, { a: T }, () => null).map((r) => [r.from, r.to, r.partial])).toEqual([[1, 3, true]]);
    // both whole
    expect(priority(two, { a: 0 }, { a: 30 }, { a: T }, () => null).map((r) => [r.from, r.to, r.partial])).toEqual([[0, 3, false]]);
    // the first whole, the second cut short at the end
    const late: HexaStep[] = [
      { node: "a" as never, from: 0, to: 1, fd: 2 },
      { node: "a" as never, from: 1, to: 3, fd: 2 },
    ];
    expect(priority(late, { a: 0 }, { a: 2 }, { a: T }, () => null).map((r) => [r.from, r.to, r.partial])).toEqual([[0, 2, true]]);
  });
  it("Ren's order: every node but Sol Janus reaches 30, each step starting where the last ended (Origin from 1)", () => {
    const end: Record<string, number> = {};
    for (const s of REN_ORDER.steps) {
      if ("stat" in s) continue;
      expect(s.from).toBe(end[s.node] ?? (s.node === "origin" ? 1 : 0));
      end[s.node] = s.to;
    }
    expect(Object.keys(end).sort()).toEqual(["ascent", "boost1", "boost2", "boost3", "boost4", "common3", "hecate", "mastery1", "mastery2", "mastery3", "mastery4", "origin"]);
    expect(Object.values(end).every((l) => l === 30)).toBe(true);
    expect(REN_ORDER.steps.filter((s) => "stat" in s).map((s) => s.to)).toEqual([20, 20, 20]);
  });
});

describe("fdTogether and daysFor", () => {
  it("gains multiply: +10% and +10% are +21%", () => {
    expect(fdTogether([10, 10])).toBeCloseTo(21, 12);
    expect(fdTogether([])).toBe(0);
  });
  it("days: 100 fragments at 10 a day and 70 a week (20 a day) is 5 days; none needed, 0; nothing coming in, never", () => {
    expect(daysFor(100, 10, 70)).toBe(5);
    expect([daysFor(0, 0, 0), daysFor(-5, 0, 0), daysFor(100, 0, 0)]).toEqual([0, 0, null]);
    expect(daysFor(70, 0, 70)).toBe(7);
  });
});
