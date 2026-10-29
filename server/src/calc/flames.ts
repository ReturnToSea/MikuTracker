import { flameLinePoints, type StatValuesInput } from "@miku/shared";
import { BLACK_FLAME_TIERS, FLAME_LINES, type FlameStat } from "../gameFigures/flames";
import type { JobStats } from "../gameFigures/jobStats";
import type { FlameRow } from "./gearDetails";

// The flame score and what a Black Flame does to it (the Flames page, v2.1.0). Pure: an item's flame
// grid, the character's stat values and the price come in, the numbers go out. The method is
// mafhcow's flame calculator's: each flame stat is worth so much main stat; one flame's score is
// worked out exactly over every roll (lines, stats, tiers); a Black Flame keeps the better of the old
// and new flames, so a worse roll costs nothing but the flame.

// What one point of each flame stat is worth to a character, in main stat.
export type FlameWeights = Record<FlameStat, number>;

export function flameWeights(job: JobStats, values: StatValuesInput, weapon: boolean): FlameWeights {
  const single = (s: string) => (job.main.some((m) => m === s) ? 1 : job.secondary.some((m) => m === s) ? values.secRatio : 0);
  // a two-stat line counts each half (Xenon's STR+DEX: both main stats)
  const pair = (a: string, b: string) => single(a) + single(b);
  const damage = values.bossDmg * (job.doubleWeaponDamage && weapon ? 2 : 1);
  return {
    STR: single("STR"),
    DEX: single("DEX"),
    INT: single("INT"),
    LUK: single("LUK"),
    "STR+DEX": pair("STR", "DEX"),
    "STR+INT": pair("STR", "INT"),
    "STR+LUK": pair("STR", "LUK"),
    "DEX+INT": pair("DEX", "INT"),
    "DEX+LUK": pair("DEX", "LUK"),
    "INT+LUK": pair("INT", "LUK"),
    "Max HP": job.hpMain ? 1 : 0,
    "Max MP": 0,
    "Req. level": 0,
    Defense: 0,
    ATT: job.magic ? 0 : values.att,
    "M. ATT": job.magic ? values.att : 0,
    "Boss damage %": damage,
    "Damage %": damage,
    // all stat % raises STR, DEX, INT and LUK, not HP
    "All Stats %": job.hpMain ? 0 : values.allStat,
    Speed: 0,
    Jump: 0,
  };
}

// Scores are counted in hundredths of a point, each line rounded on its own (flameLinePoints, shared
// with the page), so a saved score and the rolls it's compared with are added up the same way.
const lineScore = (weights: FlameWeights, row: FlameRow, tier: number): number => flameLinePoints(weights[row.stat], row.values[tier - 1] ?? null);

// The score of some flames (stat → tier), in hundredths.
export function flameScore(grid: FlameRow[], weights: FlameWeights, flames: Record<string, number>): number {
  let total = 0;
  for (const [stat, tier] of Object.entries(flames)) {
    const row = grid.find((r) => r.stat === stat);
    if (row) total += lineScore(weights, row, tier);
  }
  return total;
}

// The best score the item can have: its 4 best lines at its top tier, in hundredths.
export function bestFlameScore(grid: FlameRow[], weights: FlameWeights): number {
  const top = (row: FlameRow) => row.values.findLastIndex((v) => v !== null) + 1;
  const lines = grid.map((row) => lineScore(weights, row, top(row))).sort((a, b) => b - a);
  return lines.slice(0, 4).reduce((a, b) => a + b, 0);
}

const choose = (n: number, k: number): number => {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
};

// One Black Flame's score: every score it can give (in hundredths, lowest first) with its chance.
// Every set of lines is equally likely, so it's worked out stat by stat: for each count of lines picked
// so far, the chance of each total, then each count is divided by the number of ways to pick it.
export function flameDistribution(grid: FlameRow[], weights: FlameWeights, boss: boolean): [score: number, chance: number][] {
  const shift = boss ? 2 : 0;
  const lines = boss ? ([[4, 1]] as const) : FLAME_LINES;
  let byCount: Map<number, number>[] = [new Map([[0, 1]]), new Map(), new Map(), new Map(), new Map()];
  for (const row of grid) {
    const next = byCount.map((m) => new Map(m)); // this stat not picked
    for (let k = 0; k < 4; k++) {
      for (const [score, chance] of byCount[k]!) {
        for (const [tier, p] of BLACK_FLAME_TIERS) {
          const s = score + lineScore(weights, row, tier + shift);
          next[k + 1]!.set(s, (next[k + 1]!.get(s) ?? 0) + chance * p);
        }
      }
    }
    byCount = next;
  }
  const out = new Map<number, number>();
  for (const [k, p] of lines) {
    const ways = choose(grid.length, k);
    for (const [score, chance] of byCount[k]!) out.set(score, (out.get(score) ?? 0) + (chance / ways) * p);
  }
  return [...out].sort((a, b) => a[0] - b[0]);
}

// What one flame does from a score (in hundredths): the chance it's better, the chance it's worse, and
// the score it adds on average (worse rolls add nothing: the old flames are kept).
export function flameOdds(dist: [number, number][], current: number) {
  let better = 0;
  let worse = 0;
  let gain = 0;
  for (const [score, chance] of dist) {
    if (score > current) {
      better += chance;
      gain += chance * (score - current);
    } else if (score < current) worse += chance;
  }
  return { better, worse, gain: gain / 100 };
}

// How many flames give a chance of at least `x` of a better result, when each has chance `p` (null:
// never). log1p keeps a tiny chance exact (1 − p would round to 1); the tiny subtraction keeps a whole
// answer whole; a sure flame, p = 1, comes out as 1.
export function flamesForChance(x: number, p: number): number | null {
  if (p <= 0) return null;
  return Math.max(1, Math.ceil(Math.log1p(-x) / Math.log1p(-p) - 1e-9));
}

export const CHANCES = [0.25, 0.5, 0.7, 0.99] as const;

// Everything the page says about one item's flames. Meso figures are null where they'd be endless (no
// better roll exists, or a value of 0 makes final damage free).
export interface FlameMetrics {
  better: number; // chance a flame beats the current flames
  beats: number; // share of rolls the current flames beat
  gain: number; // score added per flame, on average
  gainIfBetter: number | null; // score added when a flame is better, on average
  fdIfBetter: number | null; // the final damage that adds, %
  flamesToBetter: number | null;
  mesoToBetter: number | null;
  mesoPerFd: number | null; // meso per 1% final damage, for the next flame on average
  flamesForChance: { chance: number; flames: number | null }[];
}

export function flameMetrics(dist: [number, number][], current: number, price: number, fdPer100: number): FlameMetrics {
  const { better, worse, gain } = flameOdds(dist, current);
  const fdPerFlame = (gain * fdPer100) / 100;
  return {
    better,
    beats: worse,
    gain,
    gainIfBetter: better > 0 ? gain / better : null,
    fdIfBetter: better > 0 ? (gain / better) * (fdPer100 / 100) : null,
    flamesToBetter: better > 0 ? 1 / better : null,
    mesoToBetter: better > 0 ? price / better : null,
    mesoPerFd: fdPerFlame > 0 ? price / fdPerFlame : null,
    flamesForChance: CHANCES.map((chance) => ({ chance, flames: flamesForChance(chance, better) })),
  };
}

// The score a flame adds on average from any score t (in points): Σ chance × (score − t) over the
// scores above t. For each score in the list, the chance of rolling above it and that chance × score.
function above(dist: [number, number][]) {
  const chance: number[] = new Array<number>(dist.length + 1).fill(0);
  const weighted: number[] = new Array<number>(dist.length + 1).fill(0);
  for (let i = dist.length - 1; i >= 0; i--) {
    chance[i] = chance[i + 1]! + dist[i]![1];
    weighted[i] = weighted[i + 1]! + (dist[i]![1] * dist[i]![0]) / 100;
  }
  return { chance, weighted };
}

// The graph's curves, from 0 to the score 99.9% of rolls stay at or below: at each score, what one
// flame adds on average and the meso per point that costs (null where it adds nothing).
export function flameCurves(dist: [number, number][], price: number, points = 150): { score: number; gain: number; mesoPerScore: number | null }[] {
  let seen = 0;
  let top = 0;
  for (const [score, chance] of dist) {
    seen += chance;
    top = score / 100;
    if (seen >= 0.999) break;
  }
  const out = [];
  for (let i = 0; i <= points; i++) {
    const score = (top * i) / points;
    const gain = flameOdds(dist, Math.round(score * 100)).gain;
    out.push({ score, gain, mesoPerScore: gain > 0 ? price / gain : null });
  }
  return out;
}

// The score to stop flaming at for a budget (meso per 1% final damage, in points): where one more
// flame starts costing more than that. The score a flame adds falls as the flames get better, in
// straight pieces between the possible scores, so the point is found exactly. Null: no budget or
// final damage value to go by.
export function stopScore(dist: [number, number][], price: number, fdPer100: number, budget: number): number | null {
  if (budget <= 0 || fdPer100 <= 0 || dist.length === 0) return null;
  // the average added score at which one flame costs exactly the budget
  const enough = (price * 100) / (fdPer100 * budget);
  const { chance, weighted } = above(dist);
  // from t up to the next possible score, a flame adds weighted − t × chance (over the scores above t).
  // (A possible score of 0 makes a first piece of no width: what it gives is where the next one starts.)
  let from = 0;
  for (let i = 0; i < dist.length; i++) {
    const next = dist[i]![0] / 100;
    const t = (weighted[i]! - enough) / chance[i]!;
    // Stryker disable next-line EqualityOperator: at t = next both pieces give next (the added score is continuous)
    if (t < next) return Math.max(t, from);
    from = next;
  }
  return from;
}

// The chance one flame gives at least a score (in points). Rolls score whole hundredths, so the score is
// rounded up to one (12.344 needs 12.35; the tiny subtraction keeps 12.34 itself 12.34).
export function chanceAtLeast(dist: [number, number][], score: number): number {
  const target = Math.ceil(score * 100 - 1e-9);
  return dist.reduce((sum, [s, p]) => (s >= target ? sum + p : sum), 0);
}
