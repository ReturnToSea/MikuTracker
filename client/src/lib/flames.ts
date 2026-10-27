import { flameLinePoints, type GearDetailsInput } from "@miku/shared";
import type { FlameItem } from "../api/types";

// The Flames page's display rules, as plain functions: how meso, chances and scores are written, an
// unsaved flame pick's score, what's saved, and which point of the graph a pointer is on.

// The budget the Targets view starts with: 10B meso per 1% final damage.
export const DEFAULT_BUDGET = 10_000_000_000;
export const BUDGET_PRESETS = [2.5, 5, 10, 20, 40]; // in billions

// Meso the way players write it: 500k, 81m, 3.09B, 12.3B, 1,234B; "—" for endless. The unit goes by
// the rounded number, so 999,999 is "1m", not "1000k".
export function formatMeso(meso: number | null): string {
  const m = meso ?? NaN;
  if (!Number.isFinite(m)) return "—";
  if (m >= 999.95e9) return `${Math.round(m / 1e9).toLocaleString("en-US")}B`;
  if (m >= 9.995e9) return `${(m / 1e9).toFixed(1)}B`;
  if (m >= 999.5e6) return `${(m / 1e9).toFixed(2)}B`;
  if (m >= 999.5e3) return `${Math.round(m / 1e6)}m`;
  if (m >= 999.5) return `${Math.round(m / 1e3)}k`;
  return String(Math.round(m));
}

// A chance as a percentage: whole above 10%, one decimal below, and never a misleading 0% or 100%.
export function formatChance(p: number): string {
  if (p <= 0) return "0%";
  if (p >= 1) return "100%";
  if (p >= 0.995) return ">99%";
  if (p < 0.001) return "<0.1%";
  return p < 0.1 ? `${(p * 100).toFixed(1)}%` : `${Math.round(p * 100)}%`;
}

// A score to one decimal (159.75 → "159.8", 1169 → "1,169").
export const formatScore = (n: number): string => (Math.round(n * 10) / 10).toLocaleString("en-US");

// The score of flames that aren't saved yet (the Equipment page's editor), added up the way the server
// does (flameLinePoints: each line rounded to hundredths).
export function liveScore(item: Pick<FlameItem, "grid" | "weights">, flames: Record<string, number>): number {
  let total = 0;
  for (const [stat, tier] of Object.entries(flames)) {
    const row = item.grid.find((r) => r.stat === stat);
    if (row) total += flameLinePoints(item.weights[row.stat], row.values[tier - 1] ?? null);
  }
  return total / 100;
}

// How close a score is to its best, for its colour: 75% and up, 50% and up, below.
export function scoreBand(score: number, best: number): "hi" | "mid" | "lo" {
  const share = best > 0 ? score / best : 1;
  return share >= 0.75 ? "hi" : share >= 0.5 ? "mid" : "lo";
}

// What saving new flames sends: the item's other details as saved (a typed item's description
// included), or blank ones starting at the stars it comes with.
export function withFlames(saved: GearDetailsInput | undefined, starMin: number, flames: Record<string, number>): GearDetailsInput {
  return { ...(saved ?? { stars: starMin, potential: null, hammers: 0 }), flames };
}

// A budget box (billions per 1% final damage): meso, or null if it isn't a budget (above 0, at most
// 1,000,000B: what the server takes).
export const MAX_BUDGET = 1e15;
export function budgetFrom(text: string): number | null {
  // (an empty or blank box reads as 0, nonsense as not a number: neither is above 0)
  const meso = Math.round(Number(text) * 1e9);
  return meso > 0 && meso <= MAX_BUDGET ? meso : null;
}

// The Black Flame price box (in millions): a whole number of meso, or null if it isn't a price.
export function priceFromMillions(text: string): number | null {
  const n = Number(text);
  if (text.trim() === "" || !Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1_000_000);
}

// The graph point a pointer at `x` is on: on the distribution, the tallest point within `reach` of
// it (the spikes are easy to hit); on a curve, the nearest. Points are [x, y], x ascending; −1: none.
export function pointAt(points: [number, number | null][], x: number, reach: number, tallest: boolean): number {
  let best = -1;
  for (let i = 0; i < points.length; i++) {
    const [px, py] = points[i]!;
    if (py === null) continue;
    if (tallest) {
      if (Math.abs(px - x) <= reach && (best < 0 || py > points[best]![1]!)) best = i;
    } else if (best < 0 || Math.abs(px - x) < Math.abs(points[best]![0] - x)) best = i;
  }
  return best;
}

// For each point of the distribution, the chance of at least its score (added up from the top once).
export function atLeast(distribution: [number, number][]): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = distribution.length - 1; i >= 0; i--) {
    sum += distribution[i]![1];
    out[i] = sum;
  }
  return out;
}
