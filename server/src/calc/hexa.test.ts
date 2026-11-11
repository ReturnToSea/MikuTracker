import { beforeAll, describe, expect, it } from "vitest";
import { HEXA_STATS } from "@miku/shared";
import { attOf, BOOST, type CostTable, type FiguredHexaJob, hexaJob, type HexaStep, MASTERY, STAT_AMOUNTS, STAT_PRIMARY_CHANCE, STAT_RANK_COST } from "../gameFigures/hexa";
import { forgetHexa, jobOrder, orderFor } from "../services/hexa";
import hoyoungCapture from "../../test/fixtures/maplescouter-hoyoung.json";
import renCapture from "../../test/fixtures/maplescouter-ren.json";
import { addCost, bestStats, buildOrder, coreAttAt, daysFor, fdTogether, joinRuns, levelCost, NO_COST, placeStats, priority, statExpected, statFd, statOutcomes, statSpent } from "./hexa";

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
const REN_NODES = hexaJob("Ren")!.nodes;
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
  it("a HEXA Stat step: the row the callback gives (none: left out), with its final damage, never merged", () => {
    const rows = priority(steps, { a: 0, b: 0 }, { a: 30, b: 30 }, tables, (n, to) => ({ from: 3, to, cost: { erda: 5, frags: 99 + n }, fd: 2.5 + n }));
    expect(rows.map((r) => [r.node, r.from, r.to, r.cost.frags, r.fd, r.partial])).toEqual([
      ["a", 0, 2, 20, expect.closeTo(3.02, 12), false],
      ["b", 0, 4, 40, 4, false],
      ["stat1", 3, 20, 100, 3.5, false],
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
});

// A job's order built from its figures, the HEXA page's own way (services/hexa.ts), afresh (nothing kept
// from before: mutation testing's planted bugs then run).
beforeAll(forgetHexa);
const built = (job: string) => orderFor(hexaJob(job) as FiguredHexaJob);
// Each node's level after `frags` fragments spent along an order (its node steps only).
function levelsAfter(steps: readonly ({ node: string; from: number; to: number } | { stat: number })[], frags: number): Record<string, number> {
  const at: Record<string, number> = { origin: 1 };
  let spent = 0;
  for (const s of steps) {
    if ("stat" in s) continue;
    spent += levelCost(table(s.node), s.from, s.to).frags;
    if (spent > frags) break;
    at[s.node] = s.to;
  }
  return at;
}

describe("buildOrder: each time the jump with the most damage per fragment", () => {
  it("by hand: two nodes, a's level 1 worth +10% for 100, b's +4% for 30 (more per fragment): b first, then a", () => {
    const t = (first: number): CostTable => ({ erda: Array(30).fill(1), frags: [first, ...Array(29).fill(10_000)] });
    const gain: Record<string, number> = { a: 0.1, b: 0.04 };
    // damage: 1 plus each node's gain once it's at level 1 or more (past 1: nothing more)
    const order = buildOrder(
      [
        { key: "a", costs: t(100), free: 0 },
        { key: "b", costs: t(30), free: 0 },
      ],
      (lv) => 1 + (lv.a! >= 1 ? gain.a! : 0) + (lv.b! >= 1 ? gain.b! : 0),
    );
    // b: ln 1.04 / 30 = 0.00131 a fragment beats a's ln 1.1 / 100 = 0.00095; then a: 1.14 / 1.04 − 1 = +9.6%
    expect(order.slice(0, 2).map((s) => [s.node, s.from, s.to])).toEqual([["b", 0, 1], ["a", 0, 1]]);
    expect(order[0]!.fd).toBeCloseTo(4, 12);
    expect(order[1]!.fd).toBeCloseTo((1.14 / 1.04 - 1) * 100, 12);
    // then every level to 30, one at a time (nothing more to gain: the first, shortest jump wins ties)
    expect(order).toHaveLength(60);
    expect(order.slice(2, 4).map((s) => [s.node, s.from, s.to, s.fd])).toEqual([["a", 1, 2, 0], ["a", 2, 3, 0]]);
  });
  it("a jump of several levels when the levels between add little (a's level 2 holds the gain)", () => {
    const t: CostTable = { erda: Array(30).fill(1), frags: Array(30).fill(10) };
    const order = buildOrder([{ key: "a", costs: t, free: 0 }, { key: "b", costs: t, free: 0 }], (lv) => 1 + (lv.a! >= 2 ? 0.2 : 0) + lv.b! * 0.001);
    expect(order[0]).toMatchObject({ node: "a", from: 0, to: 2 });
    expect(order[0]!.fd).toBeCloseTo(20, 12);
  });
  it("starts from each node's free level (Origin 1)", () => {
    const t: CostTable = { erda: Array(30).fill(1), frags: Array(30).fill(10) };
    const order = buildOrder([{ key: "o", costs: t, free: 1 }], (lv) => 1 + lv.o! * 0.01);
    expect(order[0]).toMatchObject({ node: "o", from: 1, to: 2 });
    expect(order.at(-1)).toMatchObject({ to: 30 });
  });

  // How far an order is from a captured one: each node's level every 500 fragments, the gap on average per
  // node, and the most at any one point, all nodes together (a jump of several levels just either side of
  // a point counts its whole jump there).
  function gap(ours: readonly HexaStep[], theirs: readonly HexaStep[]): { average: number; most: number } {
    let [total, count, most] = [0, 0, 0];
    for (let f = 500; f <= 42_000; f += 500) {
      const [a, b] = [levelsAfter(ours, f), levelsAfter(theirs, f)];
      const here = Object.keys({ ...a, ...b }).reduce((sum, n) => sum + Math.abs((a[n] ?? 0) - (b[n] ?? 0)), 0);
      total += here;
      count += Object.keys({ ...a, ...b }).length;
      most = Math.max(most, here);
    }
    return { average: total / count, most };
  }
  it("Ren's built order is MapleScouter's (GMS Heroic, 2026-10-01): within a tenth of a level a node on average (0.07)", () => {
    const ours = built("Ren") as HexaStep[];
    const theirs = renCapture.steps as HexaStep[];
    const g = gap(ours, theirs);
    expect(g.average).toBeLessThan(0.1);
    expect(g.most).toBeLessThanOrEqual(16);
    // its first steps exactly, with MapleScouter's gains to 0.01
    expect(ours.slice(0, 4).map((s) => ("node" in s ? [s.node, s.from, s.to] : []))).toEqual([["mastery3", 0, 1], ["mastery1", 0, 1], ["mastery2", 0, 1], ["hecate", 0, 1]]);
    ours.slice(0, 4).forEach((s, i) => expect((s as { fd: number }).fd).toBeCloseTo((theirs[i] as { fd: number }).fd, 2));
  });
  it("Hoyoung's too (its figures barely measured, most levels filled in): within a tenth of a level a node on average (0.08)", () => {
    const g = gap(built("Hoyoung") as HexaStep[], hoyoungCapture.steps as HexaStep[]);
    expect(g.average).toBeLessThan(0.1);
    expect(g.most).toBeLessThanOrEqual(16);
  });
  it("a job's nodes: MapleScouter's icon names (none for Mo Xuan: MapleScouter has none)", () => {
    expect(hexaJob("Night Walker")!.nodes.map((n) => n.icon)).toEqual(["NightWalker_1", "NightWalker_10", "NightWalker_2", "NightWalker_7", "NightWalker_8", "NightWalker_9", "NightWalker_3", "NightWalker_4", "NightWalker_5", "NightWalker_6", "General_1_0", "General_2", "NightWalker_11"]);
    expect(hexaJob("Mo Xuan")!.nodes.filter((n) => n.icon !== null).map((n) => n.key)).toEqual(["janus", "hecate"]);
  });
  it("a job's figures are kept once built, until forgotten (the tests' fresh start)", () => {
    const first = hexaJob("Ren");
    const order = jobOrder("Ren");
    expect(hexaJob("Ren")).toBe(first);
    forgetHexa();
    expect(hexaJob("Ren")).not.toBe(first);
    expect(hexaJob("Ren")).toEqual(first);
    // and its order, built again
    expect(jobOrder("Ren")).not.toBe(order);
    // (two orders built: slow on a busy machine, as the order tests below)
  }, 60_000);
  it("a job's flat-ATT node, from MapleScouter's figures: Kanna's 3rd Common node, Zero's 4th Mastery; none for Ren", () => {
    expect(hexaJob("Kanna")!.att).toEqual({ node: "common3", points: [[1, 30.6], [15, 39], [30, 48]] });
    expect(hexaJob("Zero")!.att).toEqual({ node: "mastery4", points: [[1, 15], [15, 36], [30, 60]] });
    expect(hexaJob("Ren")!.att).toBeNull();
    expect(hexaJob("Night Walker")!.att).toBeNull();
  });
  it("a flat-ATT table naming a core no node is (a figures refresh): none, not a crash", () => {
    expect(attOf({ core: "generalCore9", points: [[1, 2], [30, 9]] })).toBeNull();
    expect(attOf(null)).toBeNull();
    expect(attOf({ core: "masteryCore4", points: [[1, 2], [30, 9]] })).toEqual({ node: "mastery4", points: [[1, 2], [30, 9]] });
  });
  it("an ATT node's order: with ATT worth more, the node comes earlier and every step together gains more; worth nothing, the figures' order", () => {
    const kanna = hexaJob("Kanna") as FiguredHexaJob;
    const firstAt = (steps: ReturnType<typeof orderFor>) => steps.findIndex((s) => s.node === "common3");
    const together = (steps: ReturnType<typeof orderFor>) => steps.reduce((m, s) => m * (1 + s.fd / 100), 1);
    const [none, some, lots] = [orderFor(kanna, 0), orderFor(kanna, 0.05), orderFor(kanna, 0.2)];
    expect(firstAt(lots)).toBeLessThan(firstAt(some));
    expect(firstAt(some)).toBeLessThan(firstAt(none));
    // every step together: the figures' whole gain × what 48 ATT adds (at 0.2% a 1 ATT: × 1.096)
    expect(together(lots) / together(none)).toBeCloseTo(1 + (48 * 0.2) / 100, 6);
    // a job without one: the same order at any ATT worth
    expect(orderFor(hexaJob("Ren") as FiguredHexaJob, 0.2)).toEqual(orderFor(hexaJob("Ren") as FiguredHexaJob, 0));
    // (several orders built: slow under mutation testing's instrumented code)
  }, 60_000);
  it("the page's order for an ATT job: kept per 1 ATT's worth; for another job, one per job whatever the worth", () => {
    expect(jobOrder("Kanna", 0.05)).toBe(jobOrder("Kanna", 0.05));
    expect(jobOrder("Kanna", 0.05)).not.toEqual(jobOrder("Kanna", 0.2));
    expect(jobOrder("Kanna", 0.2)).toEqual(orderFor(hexaJob("Kanna") as FiguredHexaJob, 0.2));
    expect(jobOrder("Ren", 0.05)).toBe(jobOrder("Ren", 0.2));
    // to 4 decimals: the same order kept for the same value typed slightly differently; built with that value
    expect(jobOrder("Kanna", 0.05000001)).toBe(jobOrder("Kanna", 0.05));
    expect(jobOrder("Kanna", 0.12344)).toEqual(orderFor(hexaJob("Kanna") as FiguredHexaJob, 0.1234));
    // a job with a fixed order instead of figures (Lethe) has none worked out
    expect(jobOrder("Lethe")).toBeNull();
    expect(jobOrder("Kanna", 0.12346)).not.toBe(jobOrder("Kanna", 0.12344));
    // (several orders built: slow under mutation testing's instrumented code)
  }, 60_000);
  it("the page's order: built once per job and kept; none for a job it doesn't work out", () => {
    expect(jobOrder("Ren")).toBe(jobOrder("Ren"));
    expect(jobOrder("Ren")).toEqual(built("Ren"));
    expect([jobOrder("Sia Astelle"), jobOrder("Jett")]).toEqual([null, null]);
  });
  it("Ren's order: every node but Sol Janus reaches 30, each step starting where the last ended (Origin from 1)", () => {
    const end: Record<string, number> = {};
    for (const s of built("Ren")) {
      expect(s.from).toBe(end[s.node] ?? (s.node === "origin" ? 1 : 0));
      end[s.node] = s.to;
    }
    expect(Object.keys(end).sort()).toEqual(["ascent", "boost1", "boost2", "boost3", "boost4", "common3", "hecate", "mastery1", "mastery2", "mastery3", "mastery4", "origin"]);
    expect(Object.values(end).every((l) => l === 30)).toBe(true);
  });
});

describe("placeStats: HEXA Stat nodes put in by their damage per fragment", () => {
  const T: CostTable = { erda: Array(30).fill(1), frags: Array(30).fill(100) };
  const steps = [
    { node: "a", from: 0, to: 1, fd: 10 }, // ln 1.1 / 100 = 0.000953 a fragment
    { node: "b", from: 0, to: 1, fd: 2 }, //  0.000198
    { node: "a", from: 1, to: 2, fd: 1 }, //  0.0000995
  ];
  const frags = () => 100;
  it("each before the first step worth less, in order, never before the node before it", () => {
    // I: +6% for 500 (0.000117 a fragment): after a and b, before a 1 → 2; II: +50% for 200 (0.00203): it
    // would go first, but not before I
    const out = placeStats(steps, frags, [
      { stat: 1, frags: 500, fd: 6 },
      { stat: 2, frags: 200, fd: 50 },
    ]);
    expect(out.map((s) => ("stat" in s ? `stat${s.stat}` : `${s.node}${s.to}`))).toEqual(["a1", "b1", "stat1", "stat2", "a2"]);
    expect(out.find((s) => "stat" in s)).toEqual({ stat: 1, to: 20 });
  });
  it("one worth exactly as much as a step goes after it", () => {
    // ln 1.02 / 100 a fragment, the same as b's
    expect(placeStats(steps, frags, [{ stat: 1, frags: 100, fd: 2 }]).map((s) => ("stat" in s ? "stat" : s.node))).toEqual(["a", "b", "stat", "a"]);
  });
  it("one worth less than every step goes last; one worth more than all, first", () => {
    expect(placeStats(steps, frags, [{ stat: 1, frags: 1000, fd: 0.1 }]).map((s) => ("stat" in s ? "stat" : s.node))).toEqual(["a", "b", "a", "stat"]);
    expect(placeStats(steps, frags, [{ stat: 1, frags: 10, fd: 50 }]).map((s) => ("stat" in s ? "stat" : s.node))).toEqual(["stat", "a", "b", "a"]);
  });
});

describe("HEXA Stat's damage: statOutcomes, statFd, bestStats", () => {
  it("statOutcomes by hand: one rank-up from main line 0: main 35%, each additional 32.5%; at 10 / one additional at 10: the rest", () => {
    const one = statOutcomes(0, 0, 0, 1, STAT_PRIMARY_CHANCE);
    expect(one.map((o) => [o.p, o.a, o.b, o.chance])).toEqual([
      [1, 0, 0, 0.35],
      [0, 1, 0, 0.325],
      [0, 0, 1, 0.325],
    ]);
    // main line at 10 (never chosen), one additional at 10: the other takes it
    expect(statOutcomes(10, 10, 0, 21, STAT_PRIMARY_CHANCE).map((o) => [o.p, o.a, o.b, o.chance])).toEqual([[10, 10, 1, 1]]);
    // already there: as it is
    expect(statOutcomes(6, 7, 7, 20, STAT_PRIMARY_CHANCE)).toEqual([{ p: 6, a: 7, b: 7, chance: 1 }]);
  });
  it("statOutcomes: the chances add up to 1, every end at rank 20, and agree with rank-ups simulated one at a time (200,000 runs, main line's average level)", () => {
    const ends = statOutcomes(0, 0, 0, 20, STAT_PRIMARY_CHANCE);
    expect(ends.reduce((s, o) => s + o.chance, 0)).toBeCloseTo(1, 12);
    expect(ends.every((o) => o.p + o.a + o.b === 20 && o.p <= 10 && o.a <= 10 && o.b <= 10)).toBe(true);
    const rand = generator(5);
    let mainTotal = 0;
    let aTen = 0;
    for (let i = 0; i < 200_000; i++) {
      let [p, a, b] = [0, 0, 0];
      while (p + a + b < 20) {
        const q = STAT_PRIMARY_CHANCE[p]!;
        const r = rand();
        if (r < q) p++;
        else if (a >= 10) b++;
        else if (b >= 10) a++;
        else if (r < q + (1 - q) / 2) a++;
        else b++;
      }
      mainTotal += p;
      if (a === 10) aTen++;
    }
    const exp = ends.reduce((s, o) => s + o.chance * o.p, 0);
    expect(Math.abs(mainTotal / 200_000 - exp)).toBeLessThan(0.01);
    expect(Math.abs(aTen / 200_000 - ends.filter((o) => o.a === 10).reduce((s, o) => s + o.chance, 0))).toBeLessThan(0.003);
  });
  it("statFd by hand: ATT main 10 (100) × 0.04 + main stat additional 5 (500) × 0.003 + crit additional 5 (1.75) × 0.4: 6.2; a line without a stat: nothing", () => {
    const worth = { mainStat: 0.003, att: 0.04, bossDmg: 0.12, ied: 0.15, dmg: 0.12, critDmg: 0.4 };
    expect(statFd([{ stat: "att", level: 10 }, { stat: "mainStat", level: 5 }, { stat: "critDmg", level: 5 }], STAT_AMOUNTS, worth)).toBeCloseTo(4 + 1.5 + 0.7, 12);
    // the same stat as an additional line gives the additional table (ATT 10: 50)
    expect(statFd([{ stat: null, level: 10 }, { stat: "att", level: 10 }, { stat: null, level: 0 }], STAT_AMOUNTS, worth)).toBeCloseTo(2, 12);
  });
  it("bestStats by hand: the stat worth most on the main line, the next two on the others; picked lines stay; a taken main line is skipped", () => {
    const worth = { mainStat: 0, att: 1, bossDmg: 0.5, ied: 0.1, dmg: 0.01, critDmg: 0.2 };
    const none = [{ stat: null, level: 0 }, { stat: null, level: 0 }, { stat: null, level: 0 }];
    // by what a line gives at 10 × its worth: ATT 100, boss 10, IED 2, crit 1.4, damage 0.15, main stat 0
    // ATT (worth most) main; boss and IED the additional ones
    const best = bestStats(none, [], STAT_AMOUNTS, worth, HEXA_STATS);
    expect(best.stats).toEqual(["att", "bossDmg", "ied"]);
    expect(best.assumed).toBe(true);
    // ATT taken by another node's main line: boss main, ATT an additional line
    const taken = bestStats(none, ["att"], STAT_AMOUNTS, worth, HEXA_STATS);
    expect(taken.stats[0]).toBe("bossDmg");
    expect(taken.stats.slice(1)).toContain("att");
    // all picked: as picked, not assumed
    const picked = [{ stat: "dmg" as const, level: 0 }, { stat: "ied" as const, level: 0 }, { stat: "mainStat" as const, level: 0 }];
    expect(bestStats(picked, ["dmg"], STAT_AMOUNTS, worth, HEXA_STATS)).toEqual({ stats: ["dmg", "ied", "mainStat"], assumed: false });
    // a line picked, the others filled around it: crit damage on the main line, ATT and boss (worth most) on the others
    expect(bestStats([{ stat: "critDmg", level: 2 }, { stat: null, level: 1 }, { stat: null, level: 0 }], [], STAT_AMOUNTS, worth, HEXA_STATS)).toEqual({ stats: ["critDmg", "att", "bossDmg"], assumed: true });
    // its main line picked but an additional line's stat worth most: kept where picked
    expect(bestStats([{ stat: null, level: 0 }, { stat: "att", level: 0 }, { stat: null, level: 0 }], [], STAT_AMOUNTS, worth, HEXA_STATS).stats).toEqual(["bossDmg", "att", "ied"]);
  });
});

describe("coreAttAt: a node's flat ATT at a level", () => {
  // Kanna's: 30.6 at 1, 39 at 15, 48 at 30 (MapleScouter's)
  const KANNA = [[1, 30.6], [15, 39], [30, 48]] as const;
  it("nothing at level 0; the measured levels as measured; straight lines between them (worked out by hand)", () => {
    expect(coreAttAt(KANNA, 0)).toBe(0);
    expect(coreAttAt(KANNA, 1)).toBe(30.6);
    expect(coreAttAt(KANNA, 15)).toBe(39);
    expect(coreAttAt(KANNA, 30)).toBe(48);
    // 8: halfway from 1 to 15: 30.6 + 8.4 / 2 = 34.8; 22: 7/15 of the way from 15 to 30: 39 + 9 × 7/15 = 43.2
    expect(coreAttAt(KANNA, 8)).toBeCloseTo(34.8, 12);
    expect(coreAttAt(KANNA, 22)).toBeCloseTo(43.2, 12);
    // 2: 1/14 of the way: 30.6 + 0.6
    expect(coreAttAt(KANNA, 2)).toBeCloseTo(31.2, 12);
  });
  it("points that start past level 1 rise from nothing at 0; past the last point, the last (a figures refresh can't crash it)", () => {
    // from 5 at 10: level 4 is 4/10 of the way from 0; level 30 past the last (20): 8
    expect(coreAttAt([[10, 5], [20, 8]], 4)).toBeCloseTo(2, 12);
    expect(coreAttAt([[10, 5], [20, 8]], 30)).toBe(8);
    expect(coreAttAt([[10, 5], [20, 8]], 20)).toBe(8);
  });
  it("two points only (1 and 30)", () => {
    // Adele's: 10 at 1, 77 at 30: level 16 is 15/29 of the way: 10 + 67 × 15/29
    expect(coreAttAt([[1, 10], [30, 77]], 16)).toBeCloseTo(10 + (67 * 15) / 29, 12);
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
