import { boomDropTo, MODES, MVP_DISCOUNT, MVP_UP_TO, type MvpTier, PLUS_ONE_UP_TO, SAFEGUARD_EXTRA, SAFEGUARD_STARS, type SfEvent, STAR_RATES, tapCost } from "../gameFigures/starForceCosts";

// What Star Force costs from here, worked out exactly where it can be and simulated where it can't
// (the Star Force page, v2.2.0). Pure: the item's level, stars and settings come in, the numbers go
// out. The exact average cost to clear a star is tadeucci's (and masonym's) closed form: from star s a
// tap costs c and succeeds with chance p, booms with chance b (dropping to d and climbing back), so
// clearing it costs (c + b × (R + boom cost)) ÷ p on average, R being the average climb from d to s.

export interface SfOptions {
  events: readonly SfEvent[];
  mvp: MvpTier;
}
// An item's fixed modes (its checkboxes): "1144" = Mode 1 up to 20★, then Mode 4 for 20→22★ (no
// Safeguard); "4444" = Safeguard on 15→18★, Mode 4 for 18→22★. Null: the cheapest per star.
export type Preset = "1144" | "4444" | null;
const PRESETS: Readonly<Record<"1144" | "4444", Readonly<Record<number, string>>>> = {
  "1144": { 15: "Mode 1", 16: "Mode 1", 17: "Mode 1", 18: "Mode 1", 19: "Mode 1", 20: "Mode 4", 21: "Mode 4" },
  "4444": {
    15: "Safeguard",
    16: "Safeguard",
    17: "Safeguard",
    18: "Mode 4",
    19: "Mode 4",
    // with its climbs back Safeguarded and on Mode 4, Mode 4 is the cheapest at 20 and 21★ anyway (Lv. 150,
    // 200, 250), so no test can tell the box's pick from the automatic one there
    // Stryker disable next-line StringLiteral: see above
    20: "Mode 4",
    // Stryker disable next-line StringLiteral: see above
    21: "Mode 4",
  },
};

// One way to tap at a star: what to pick in game ("—": nothing to choose), what a tap costs, its chances.
export interface Choice {
  pick: string;
  cost: number;
  success: number;
  boom: number;
}

export function choices(star: number, level: number, o: SfOptions): Choice[] {
  const has = (e: SfEvent) => o.events.includes(e);
  const discount = (has("thirtyOff") ? 0.7 : 1) * (star <= MVP_UP_TO ? 1 - MVP_DISCOUNT[o.mvp] : 1);
  const base = tapCost(star, level);
  if (has("fiveTenFifteen") && (star === 5 || star === 10 || star === 15)) return [{ pick: "—", cost: Math.round(base * discount), success: 1, boom: 0 }];
  // (used on the modes' stars, 15–21★, all within the reduction's reach: up to 21★)
  const fewer = has("fewerBooms") ? 0.7 : 1;
  const modes = MODES[star];
  const out: Choice[] = modes
    ? modes.map(([mult, success, boom], i) => ({ pick: `Mode ${i + 1}`, cost: Math.round(base * mult * discount), success, boom: boom * fewer }))
    : // (no reduction needed here: every star it covers, up to 21★, has modes)
      [{ pick: "—", cost: Math.round(base * discount), success: STAR_RATES[star]![0], boom: STAR_RATES[star]![1] }];
  // Safeguard's extra isn't discounted (Nexon: "Mesos used to safeguard are not eligible")
  if (SAFEGUARD_STARS.includes(star)) out.push({ pick: "Safeguard", cost: Math.round(base * (discount + SAFEGUARD_EXTRA)), success: STAR_RATES[star]![0], boom: 0 });
  return out;
}

// The stars a success at `star` reaches: 2 at 10★ or below with the +1 event, within the item's limit.
export const nextStar = (star: number, max: number, o: SfOptions): number => Math.min(max, star + (o.events.includes("plusOne") && star <= PLUS_ONE_UP_TO ? 2 : 1));

// Each star's pick and what clearing it costs on average (cost and booms), from 0★ to the limit.
export interface Tap extends Choice {
  star: number;
  avgCost: number; // to clear it once, climbs back after booms included
  avgBooms: number;
}
export function taps(level: number, max: number, o: SfOptions, boomCost: number, preset: Preset): Tap[] {
  const out: Tap[] = [];
  // the average climb from a drop star up to `s` (the stars a boom drops to are all above 10★, where
  // each success adds one star)
  const climb = (from: number, to: number, key: "avgCost" | "avgBooms") => out.slice(from, to).reduce((a, t) => a + t[key], 0);
  for (let star = 0; star < max; star++) {
    const all = choices(star, level, o);
    const fixed = preset ? PRESETS[preset][star] : undefined;
    const list = fixed ? all.filter((c) => c.pick === fixed) : all;
    let best: Tap | null = null;
    for (const c of list.length ? list : all) {
      const d = boomDropTo(star);
      const avgCost = (c.cost + c.boom * (climb(d, star, "avgCost") + boomCost)) / c.success;
      const avgBooms = (c.boom * (1 + climb(d, star, "avgBooms"))) / c.success;
      // Stryker disable next-line EqualityOperator: two different picks never cost exactly the same on average
      if (!best || avgCost < best.avgCost) best = { ...c, star, avgCost, avgBooms };
    }
    out.push(best!);
  }
  return out;
}

// The rows from the item's star to its limit, along the path a run takes (9→11★ with the +1 event):
// each row's tap, and what reaching its star adds in final damage.
export interface Row {
  from: number;
  to: number;
  tap: Tap;
  fd: number; // % final damage the row's stars add
}
export function rows(tapList: Tap[], from: number, max: number, o: SfOptions, fdOfStars: (from: number, to: number) => number): Row[] {
  const out: Row[] = [];
  for (let s = from; s < max; ) {
    const to = nextStar(s, max, o);
    out.push({ from: s, to, tap: tapList[s]!, fd: fdOfStars(s, to) });
    s = to;
  }
  return out;
}

// The best jumps, one after another: from where the item stands, the row to stop at with the cheapest
// meso per 1% final damage for that jump alone (measured from where you'd stand, so earlier stars
// never pull it down), then again from there.
export interface Jump {
  from: number;
  to: number;
  cost: number;
  fd: number;
  perFd: number | null; // null: it adds no final damage
}
export function jumps(rowList: Row[]): Jump[] {
  const out: Jump[] = [];
  for (let i = 0; i < rowList.length; ) {
    let cost = 0;
    let fd = 0;
    let best: Jump | null = null;
    let end = i;
    for (let j = i; j < rowList.length; j++) {
      cost += rowList[j]!.tap.avgCost;
      fd += rowList[j]!.fd;
      const perFd = fd > 0 ? cost / fd : null;
      // (a tie keeps the nearer star)
      if (!best || (perFd !== null && (best.perFd === null || perFd < best.perFd))) {
        best = { from: rowList[i]!.from, to: rowList[j]!.to, cost, fd, perFd };
        end = j;
      }
    }
    out.push(best!);
    i = end + 1;
  }
  return out;
}

// Targets: from where the item stands, the best jumps taken while each costs at most the budget (meso
// per 1% final damage). The star it stops at.
export function stopStar(jumpList: Jump[], from: number, budget: number): number {
  let star = from;
  for (const j of jumpList) {
    if (j.perFd === null || j.perFd > budget) break;
    star = j.to;
  }
  return star;
}

// A seeded random number generator (mulberry32), so a page shows the same simulated numbers each time.
export function random(seed: number): () => number {
  let s = seed;
  return () => {
    // Stryker disable next-line ArithmeticOperator: any of these constants' variants is just as random and repeatable
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    // Stryker disable next-line ArithmeticOperator: the same
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Runs from the item's star to a target, star by star: for each star, `runs` samples of what clearing
// it costs (taps until it succeeds; a boom adds the boom cost and a climb back drawn from the samples
// of the stars below, each with its own luck, instead of re-tapping them). A run's total is one sample
// of each row added up. Checked against tapping every run out (same medians, percentiles and booms).
export function simulate(tapList: Tap[], rowList: Row[], target: number, boomCost: number, runs: number, seed: number): { costs: Float64Array; booms: Int32Array } {
  const rnd = random(seed);
  const path = rowList.filter((r) => r.to <= target);
  // the path's stars, and every star from 12★ (where a boom's climb back can start: a boom never drops
  // lower, and a climb back can itself boom: 22★ → 17★, then 17★ → 12★)
  const stars = new Set<number>(path.map((r) => r.from));
  for (let s = 12; s < target; s++) stars.add(s);
  const cost = new Map<number, Float64Array>();
  const booms = new Map<number, Int32Array>();
  for (const s of [...stars].sort((a, b) => a - b)) {
    const t = tapList[s]!;
    const d = boomDropTo(s);
    const cs = new Float64Array(runs);
    const bs = new Int32Array(runs);
    // Stryker disable next-line EqualityOperator: one more sample past the end is dropped (a fixed-size array)
    for (let j = 0; j < runs; j++) {
      let c = 0;
      let b = 0;
      for (;;) {
        c += t.cost;
        const u = rnd();
        // Stryker disable next-line EqualityOperator: u is never exactly a rate (a continuous draw)
        if (u < t.success) break;
        // Stryker disable next-line EqualityOperator: the same
        if (u < t.success + t.boom) {
          b += 1;
          c += boomCost;
          for (let k = d; k < s; k++) {
            const i = Math.floor(rnd() * runs);
            c += cost.get(k)![i]!;
            b += booms.get(k)![i]!;
          }
        }
      }
      cs[j] = c;
      bs[j] = b;
    }
    cost.set(s, cs);
    booms.set(s, bs);
  }
  const total = new Float64Array(runs);
  const totalBooms = new Int32Array(runs);
  for (const r of path) {
    // Stryker disable next-line EqualityOperator: one more past the end is dropped (a fixed-size array)
    for (let j = 0; j < runs; j++) {
      total[j]! += cost.get(r.from)![j]!;
      totalBooms[j]! += booms.get(r.from)![j]!;
    }
  }
  return { costs: total, booms: totalBooms };
}

// The share of runs at or below `q` (a sorted list): the value 100·q% of runs stay at or under.
export const percentile = (sorted: ArrayLike<number>, q: number): number => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
