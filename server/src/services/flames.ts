import { bestFlameScore, chanceAtLeast, type FlameMetrics, flameCurves, flameDistribution, flameMetrics, flameScore, type FlameWeights, flameWeights, stopScore } from "../calc/flames";
import { type FlameRow, flameGrid } from "../calc/gearDetails";
import { HttpError } from "../http";
import { type CharacterGear, characterGear, type EquippedItem } from "./gear";

// The Flames page (v2.1.0): a character's equipped items that can have flames, each with its saved
// flames' score and what a Black Flame would do, cheapest to upgrade first.

export interface FlameItem {
  slot: string;
  name: string;
  icon: string | null; // listed items only
  level: number;
  boss: boolean;
  starMin: number; // the stars it comes with (saving flames on an item with no details yet starts there)
  grid: FlameRow[];
  weights: FlameWeights; // what each stat is worth (for scoring unsaved clicks on the Equipment page)
  flames: Record<string, number>; // the saved flames (stat → tier)
  score: number; // in points
  best: number;
  metrics: FlameMetrics;
  // where to stop for the budget asked for, and the flames to get there (null: no budget)
  stop: { score: number; reached: boolean; flames: number; meso: number } | null;
}

export interface FlamesBoard {
  known: boolean; // false: a job the list doesn't know yet (no score without its main stat)
  price: number; // meso per Black Flame
  budget: number; // meso per 1% final damage the stop scores are for
  items: FlameItem[]; // cheapest meso per 1% final damage first (no cost: last)
}

interface Flameable {
  slot: string;
  name: string;
  icon: string | null;
  level: number;
  boss: boolean;
  starMin: number;
  weapon: boolean;
  grid: FlameRow[];
  flames: Record<string, number>;
}

// The character's items that can have flames: listed ones whose list entry says so, and typed ones
// whose kind, level and boss tick have been given.
function flameable(equipped: EquippedItem[]): Flameable[] {
  return equipped
    .filter((e) => e.di.flames)
    .map(({ slot, name, icon, di, details }) => ({ slot, name, icon, level: di.level, boss: di.flames === "boss", starMin: Math.min(di.starMin, di.starMax), weapon: di.slot === "weapon", grid: flameGrid(di), flames: details?.flames ?? {} }));
}

// Where to stop, and the flames to get there: each flame has the chance of rolling at least the stop
// score (never 0: the stop score is at most the top score, which can be rolled).
function toStop(dist: [number, number][], stop: number, score: number, price: number) {
  const chance = chanceAtLeast(dist, stop);
  return { score: stop, reached: score / 100 >= stop, flames: 1 / chance, meso: price / chance };
}

export const flamesBoard = async (ownerId: string, characterId: number, budget: number): Promise<FlamesBoard> => flamesFrom(await characterGear(ownerId, characterId), budget);
// (from a character's gear already read: the Upgrades page reads it once for every page)
export function flamesFrom({ job, values, settings, equipped }: CharacterGear, budget: number): FlamesBoard {
  const price = settings.blackFlamePrice;
  if (!job) return { known: false, price, budget, items: [] };
  const items = flameable(equipped).map((it): FlameItem => {
    const weights = flameWeights(job, values, it.weapon);
    const dist = flameDistribution(it.grid, weights, it.boss);
    const score = flameScore(it.grid, weights, it.flames);
    const stop = stopScore(dist, price, values.fdPer100, budget);
    return {
      slot: it.slot,
      name: it.name,
      icon: it.icon,
      level: it.level,
      boss: it.boss,
      starMin: it.starMin,
      grid: it.grid,
      weights,
      flames: it.flames,
      score: score / 100,
      best: bestFlameScore(it.grid, weights) / 100,
      metrics: flameMetrics(dist, score, price, values.fdPer100),
      stop: stop === null ? null : toStop(dist, stop, score, price),
    };
  });
  // Stryker disable next-line ArrayCallback: see the sort's test (cheapest first, endless last)
  items.sort((a, b) => (a.metrics.mesoPerFd ?? Infinity) - (b.metrics.mesoPerFd ?? Infinity));
  return { known: true, price, budget, items };
}

// One item's graph: every score a flame can give with its chance, and the two curves.
export interface FlameGraph {
  distribution: [score: number, chance: number][]; // in points
  curves: ReturnType<typeof flameCurves>;
}

export async function flameGraph(ownerId: string, characterId: number, slot: string): Promise<FlameGraph> {
  const { job, values, settings, equipped } = await characterGear(ownerId, characterId);
  if (!job) throw new HttpError(404, "No flame score for this job yet");
  const it = flameable(equipped).find((i) => i.slot === slot);
  if (!it) throw new HttpError(404, "That slot has no item that can have flames");
  const price = settings.blackFlamePrice;
  const dist = flameDistribution(it.grid, flameWeights(job, values, it.weapon), it.boss);
  return { distribution: dist.map(([s, p]) => [s / 100, p]), curves: flameCurves(dist, price) };
}
