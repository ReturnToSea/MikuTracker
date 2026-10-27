import type { StatValuesInput } from "@miku/shared";
import { flameWeights } from "../calc/flames";
import { type DetailItem, starGains, starRange } from "../calc/gearDetails";
import { type Jump, jumps, percentile, type Row, rows, type SfOptions, simulate, stopStar, taps } from "../calc/starForce";
import type { JobStats } from "../gameFigures/jobStats";
import type { SfEvent } from "../gameFigures/starForceCosts";
import { HttpError } from "../http";
import { characterValues, type EquippedItem, equippedItems } from "./gear";
import { getSettings } from "./settings";

// The Star Force page (v2.2.0): a character's items that can still take stars, each with what its next
// stars cost and add, cheapest per 1% final damage first; and one item in detail.

export interface StarForceItem {
  slot: string;
  name: string;
  icon: string | null;
  level: number;
  star: number; // its saved stars
  min: number;
  max: number;
  boomCost: number;
  safety: "1144" | "4444" | null;
  next: { pick: string; success: number; boom: number }; // the next tap
  best: Jump; // the best jump from where it stands (the item row)
  stop: { star: number; cost: number; fd: number }; // where Targets stops for the budget, and what getting there costs and adds
}

export interface StarForceBoard {
  known: boolean; // false: a job the list doesn't know yet (no final damage without its main stat)
  mvp: string;
  events: SfEvent[];
  budget: number;
  items: StarForceItem[]; // cheapest meso per 1% final damage first (nothing to gain: last)
}

interface Listed {
  e: EquippedItem;
  star: number;
  min: number;
  max: number;
  boomCost: number;
  safety: "1144" | "4444" | null;
}

// The items that can still take stars: not fixed at their stars (Genesis, Destiny Stage 1), not at their
// limit. Their stars as saved (an item with nothing saved: the stars it comes with).
async function starrable(characterId: number): Promise<Listed[]> {
  const out: Listed[] = [];
  for (const e of await equippedItems(characterId)) {
    const [min, max] = starRange(e.di);
    const star = Math.min(max, Math.max(min, e.details?.stars ?? min));
    // (an item fixed at its stars, min = max, is at its limit too)
    if (star < max) out.push({ e, star, min, max, boomCost: e.details?.boomCost ?? 0, safety: e.details?.safety ?? null });
  }
  return out;
}

// The final damage (%) the stars from `from` to `to` add: their stats scored as flame lines are (the
// character's stat values and job), then × the final damage per 100 score. (Weapons are scored like
// anything else: the weapon weights only differ in boss and damage %, which stars never add.)
function fdOfStars(di: DetailItem, job: JobStats, values: StatValuesInput) {
  // Stryker disable next-line BooleanLiteral: as above, the weapon weights would score stars the same
  const w = flameWeights(job, values, false);
  return (from: number, to: number) => {
    const a = starGains(di, from);
    const b = starGains(di, to);
    const score = (b.str - a.str) * w.STR + (b.dex - a.dex) * w.DEX + (b.int - a.int) * w.INT + (b.luk - a.luk) * w.LUK + (b.hp - a.hp) * w["Max HP"] + (b.att - a.att) * w.ATT + (b.matt - a.matt) * w["M. ATT"];
    return (score * values.fdPer100) / 100;
  };
}

function worked(l: Listed, job: JobStats, values: StatValuesInput, o: SfOptions) {
  const t = taps(l.e.di.level, l.max, o, l.boomCost, l.safety);
  const r = rows(t, l.star, l.max, o, fdOfStars(l.e.di, job, values));
  return { t, r, j: jumps(r) };
}

const totals = (r: Row[], to: number) => r.filter((x) => x.to <= to).reduce((a, x) => ({ cost: a.cost + x.tap.avgCost, fd: a.fd + x.fd, booms: a.booms + x.tap.avgBooms }), { cost: 0, fd: 0, booms: 0 });

export async function starForceBoard(ownerId: string, characterId: number, events: SfEvent[], budget: number): Promise<StarForceBoard> {
  const { job, values } = await characterValues(ownerId, characterId);
  const { mvp } = await getSettings(ownerId);
  if (!job) return { known: false, mvp, events, budget, items: [] };
  const o: SfOptions = { events, mvp };
  const items = (await starrable(characterId)).map((l): StarForceItem => {
    const { t, r, j } = worked(l, job, values, o);
    const stop = stopStar(j, l.star, budget);
    const { cost, fd } = totals(r, stop);
    const next = t[l.star]!;
    return { slot: l.e.slot, name: l.e.name, icon: l.e.icon, level: l.e.di.level, star: l.star, min: l.min, max: l.max, boomCost: l.boomCost, safety: l.safety, next: { pick: next.pick, success: next.success, boom: next.boom }, best: j[0]!, stop: { star: stop, cost, fd } };
  });
  items.sort((a, b) => (a.best.perFd ?? Infinity) - (b.best.perFd ?? Infinity));
  return { known: true, mvp, events, budget, items };
}

// One item in detail, for a target star.
export interface StarForceRow {
  from: number;
  to: number;
  pick: string;
  success: number;
  boom: number;
  tapCost: number;
  avgCost: number;
  fd: number;
  perFd: number | null; // this row alone
  costFrom: number; // running totals from the item's star
  fdFrom: number;
}
export interface StarForceDetail {
  target: number; // the target asked for, moved onto a star a run can stop at (9→11★ with +1)
  rows: StarForceRow[];
  jumps: Jump[];
  summary: {
    median: number;
    average: number; // exact
    unlucky: [p75: number, p90: number, p99: number];
    fd: number;
    perFd: number | null;
    medianBooms: number;
    averageBooms: number; // exact
    anyBoom: number; // the share of runs with at least one boom
    canBoom: boolean; // false: no star on the way can boom
  };
  graphs: {
    cost: { width: number; bins: number[]; marks: { median: number; p75: number; p90: number; p99: number } }; // the share of runs per cost range (to where 99.5% end)
    // the share of runs per boom count (width 1), or per range of counts when there are more than 100
    // (width > 1: a run to 30★ can boom hundreds of thousands of times); up to where 99.5% end, more: the
    // last one is "or more"
    booms: { width: number; counts: number[]; more: boolean };
    perStar: { to: number; avgCost: number }[]; // each row's average cost, up to the target
  };
}

const RUNS = 20000;

export async function starForceDetail(ownerId: string, characterId: number, slot: string, events: SfEvent[], wanted: number): Promise<StarForceDetail> {
  const { job, values } = await characterValues(ownerId, characterId);
  if (!job) throw new HttpError(404, "No final damage for this job yet");
  const l = (await starrable(characterId)).find((x) => x.e.slot === slot);
  if (!l) throw new HttpError(404, "That slot has no item that can take more stars");
  const { mvp } = await getSettings(ownerId);
  const { t, r, j } = worked(l, job, values, { events, mvp });
  // the first star a run reaches at or past the one asked for
  const target = r.find((x) => x.to >= wanted)?.to ?? l.max;
  let costFrom = 0;
  let fdFrom = 0;
  const rowViews = r.map((x): StarForceRow => {
    costFrom += x.tap.avgCost;
    fdFrom += x.fd;
    // Stryker disable next-line ConditionalExpression,EqualityOperator: dividing by 0 gives Infinity, which the answer's JSON writes as null too
    return { from: x.from, to: x.to, pick: x.tap.pick, success: x.tap.success, boom: x.tap.boom, tapCost: x.tap.cost, avgCost: x.tap.avgCost, fd: x.fd, perFd: x.fd > 0 ? x.tap.avgCost / x.fd : null, costFrom, fdFrom };
  });
  const sim = simulate(t, r, target, l.boomCost, RUNS, 1);
  const costs = Float64Array.from(sim.costs).sort();
  const booms = Int32Array.from(sim.booms).sort();
  const total = totals(r, target);
  const p = (q: number) => percentile(costs, q);
  // the graphs: costs in 60 ranges up to where 99.5% of runs end; every boom count up to there
  const width = p(0.995) / 60 || 1;
  const bins = new Array<number>(61).fill(0);
  for (const c of costs) bins[Math.min(60, Math.floor(c / width))]! += 1 / RUNS;
  const most = percentile(booms, 0.995);
  const boomWidth = Math.max(1, Math.ceil(most / 100));
  const counts = new Array<number>(Math.floor(most / boomWidth) + 1).fill(0);
  for (const b of booms) counts[Math.floor(Math.min(most, b) / boomWidth)]! += 1 / RUNS;
  return {
    target,
    rows: rowViews,
    jumps: j,
    summary: {
      median: p(0.5),
      average: total.cost,
      unlucky: [p(0.75), p(0.9), p(0.99)],
      fd: total.fd,
      // Stryker disable next-line ConditionalExpression,EqualityOperator: as above (0 ÷ 0 is NaN, also null in JSON)
      perFd: total.fd > 0 ? total.cost / total.fd : null,
      medianBooms: percentile(booms, 0.5),
      averageBooms: total.booms,
      anyBoom: booms.filter((b) => b > 0).length / RUNS,
      canBoom: r.some((x) => x.to <= target && x.tap.boom > 0),
    },
    graphs: {
      cost: { width, bins, marks: { median: p(0.5), p75: p(0.75), p90: p(0.9), p99: p(0.99) } },
      booms: { width: boomWidth, counts, more: booms[booms.length - 1]! > most },
      perStar: r.filter((x) => x.to <= target).map((x) => ({ to: x.to, avgCost: x.tap.avgCost })),
    },
  };
}
