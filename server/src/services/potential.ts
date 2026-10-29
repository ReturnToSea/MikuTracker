import { CUBE_EVENTS, POTENTIAL_RANKS, type StatValuesInput } from "@miku/shared";
import { flameCurves, stopScore } from "../calc/flames";
import { type CooldownRule, cooldownPoints, counted, type CubeMetrics, type CubeRolls, cubeMetrics, cubesToReach, iedWorth, linePoints, linesCooldown, linesPoints, NO_COOLDOWN, oneCube, rollDistribution, SHORT } from "../calc/potential";
import { type Cube, CUBE_PRICE, CUBE_TABLE, CUBES, MIRACLE, RANK_UP, SALE } from "../gameFigures/cubes";
import type { JobStats } from "../gameFigures/jobStats";
import { potentialOptions } from "../gameFigures/potential";
import { HttpError } from "../http";
import { type CharacterGear, characterGear, type EquippedItem } from "./gear";

// The Potential page (v2.3.0): a character's equipped items that can have potential, each with its
// saved lines' score and what Glowing and Bright Cubes would do, cheapest to upgrade first.

type Rank = (typeof POTENTIAL_RANKS)[number];
type CubeEvent = (typeof CUBE_EVENTS)[number];

export interface PotentialItem {
  slot: string;
  name: string;
  icon: string | null; // listed items only
  level: number;
  starMin: number; // the stars it comes with (saving lines on an item with no details yet starts there)
  rank: Rank | null; // null: no potential saved (counted as Rare with no lines)
  lines: (string | null)[]; // the saved lines
  options: Partial<Record<Rank, string[][]>>; // what each line can be at each rank, best first (for editing)
  points: Record<string, number>; // what each of those lines adds to the score on its own, in points
  ied: number; // main stat per 1% of the item's combined ignore defense (its IED lines multiply)
  score: number; // in points
  best: number; // the best Legendary lines' score
  cubes: Record<Cube, CubeMetrics & { price: number }>;
  // a hat's skill cooldown (v2.4.1; null: not a hat): its lines' seconds, the seconds it must keep (0:
  // none), and what each total from 0 to 6 s adds, in points (the page adds them up as it's edited)
  cooldown: { sec: number; min: number; points: number[] } | null;
  // the cube with the lower meso per 1% final damage (null: neither can improve it); a hat under its
  // minimum: a roll that keeps it is needed even if it adds nothing, so then the cheaper way to one
  cheaper: Cube | null;
  // where to stop for the budget asked for, and the cheaper cube's way there (null: no budget)
  stop: { score: number; reached: boolean; cube: Cube; cubes: number; meso: number } | null;
}

export interface PotentialBoard {
  known: boolean; // false: a job the list doesn't know yet (no score without its main stat)
  budget: number;
  prices: Record<Cube, number>; // a cube's price with the events on
  items: PotentialItem[]; // cheapest meso per 1% final damage first (no cost: last)
}

const price = (cube: Cube, events: CubeEvent[]) => CUBE_PRICE[cube] * (events.includes("sale") ? SALE : 1);

interface Cubeable {
  slot: string;
  name: string;
  icon: string | null;
  level: number;
  starMin: number;
  part: string;
  rank: Rank | null;
  lines: (string | null)[];
}

// The character's items that can have potential: listed ones whose list entry has a potential kind,
// and typed ones of a kind that has it (with their level given).
function cubeable(equipped: EquippedItem[]): Cubeable[] {
  return equipped.flatMap(({ slot, name, icon, di, potential, details }) =>
    potential === null ? [] : [{ slot, name, icon, level: di.level, starMin: Math.min(di.starMin, di.starMax), part: potential, rank: details?.potential?.rank ?? null, lines: details?.potential?.lines ?? [null, null, null] }],
  );
}

// An item's rolls with a cube: each rank's lines, scored for the character, and the rank-up chances.
function rollsOf(it: Cubeable, cube: Cube, job: JobStats, values: StatValuesInput, events: CubeEvent[]): CubeRolls {
  const tables = potentialOptions(it.part, it.level, CUBE_TABLE[cube]);
  const points = (line: string) => linePoints(line, job, values);
  // (every level range Nexon has lists all four ranks: gameFigures/potential.test.ts)
  return { ranks: POTENTIAL_RANKS.map((r) => rollDistribution(tables[r]!, points, iedWorth(values), cooldownRule(it, values))), rankUp: RANK_UP[cube].map((u) => u * (events.includes("miracle") ? MIRACLE : 1)) };
}

// How a hat's cooldown lines count: by the character's table, with its minimum (only hats roll cooldown
// lines; another item's minimum would rule out every roll).
const isHat = (it: Cubeable) => it.part === "hat";
const cooldownRule = (it: Cubeable, values: StatValuesInput): CooldownRule => (isHat(it) ? { points: (sec) => cooldownPoints(values, sec), min: values.cdMin } : NO_COOLDOWN);
// What a roll must beat: its lines' score, or SHORT when a hat doesn't keep its minimum.
const toBeat = (it: Cubeable, values: StatValuesInput, score: number) => (isHat(it) && linesCooldown(it.lines) < values.cdMin ? SHORT : score);

const fromRank = (it: Cubeable) => (it.rank === null ? 0 : POTENTIAL_RANKS.indexOf(it.rank));

export const potentialBoard = async (ownerId: string, characterId: number, events: CubeEvent[], budget: number): Promise<PotentialBoard> => potentialFrom(await characterGear(ownerId, characterId), events, budget);
// (from a character's gear already read: the Upgrades page reads it once for every page)
export function potentialFrom({ job, values, equipped }: CharacterGear, events: CubeEvent[], budget: number): PotentialBoard {
  const prices = { glowing: price("glowing", events), bright: price("bright", events) };
  if (!job) return { known: false, budget, prices, items: [] };
  const points = (line: string) => linePoints(line, job, values);
  const items = cubeable(equipped).map((it): PotentialItem => {
    const score = linesPoints(it.lines, job, values);
    const beat = toBeat(it, values, score);
    const from = fromRank(it);
    const rolls = { glowing: rollsOf(it, "glowing", job, values, events), bright: rollsOf(it, "bright", job, values, events) };
    const cubes = Object.fromEntries(CUBES.map((c) => [c, { ...cubeMetrics(rolls[c], from, beat, prices[c], values.fdPer100, score), price: prices[c] }])) as PotentialItem["cubes"];
    const costs = CUBES.filter((c) => cubes[c].mesoPerFd !== null);
    // the cheaper per 1% final damage; else, a hat under its minimum whose qualifying rolls add nothing: the
    // cheaper way to one (always there: Legendary hats roll up to 6 s with either cube); else none
    const cheaper =
      costs.length > 0
        ? // Stryker disable next-line EqualityOperator: two cubes' costs never tie to the last digit (on a tie, either is as cheap)
          costs.reduce((a, b) => (cubes[b].mesoPerFd! < cubes[a].mesoPerFd! ? b : a))
        : beat === SHORT
          ? // Stryker disable next-line EqualityOperator: two cubes' costs never tie to the last digit (on a tie, either is as cheap)
            CUBES.reduce((a, b) => (cubes[b].mesoToBetter! < cubes[a].mesoToBetter! ? b : a))
          : null;
    // the score to stop at: past it, cubing on at Legendary costs more than the budget per 1% final
    // damage with either cube (each cube's own stop score, the higher one)
    const stops = CUBES.map((c) => stopScore(counted(rolls[c].ranks[3]!).dist, prices[c], values.fdPer100, budget)).filter((s): s is number => s !== null);
    let stop: PotentialItem["stop"] = null;
    if (stops.length > 0) {
      const at = Math.max(...stops);
      // the cheaper way there (a cube that can't get there: never)
      // Stryker disable next-line EqualityOperator: two cubes' costs never tie to the last digit (on a tie, either is as cheap)
      const way = CUBES.map((c) => ({ cube: c, cubes: cubesToReach(rolls[c], from, at) ?? Infinity })).reduce((a, b) => (b.cubes * prices[b.cube] < a.cubes * prices[a.cube] ? b : a));
      // Stryker disable next-line EqualityOperator: a score exactly at the stop score is as good as past it either way
      // (a hat under its minimum cooldown hasn't reached anything)
      stop = { score: at, reached: beat !== SHORT && score / 100 >= at, cube: way.cube, cubes: way.cubes, meso: way.cubes * prices[way.cube] };
    }
    const options = Object.fromEntries(
      Object.entries(potentialOptions(it.part, it.level)).map(([rank, slots]) => [rank, slots!.map((s) => [...new Set(s.map((o) => o.line))].sort((a, b) => points(b) - points(a)))]),
    ) as PotentialItem["options"];
    const shown = new Set(Object.values(options).flatMap((slots) => slots!.flat()));
    return {
      slot: it.slot,
      name: it.name,
      icon: it.icon,
      level: it.level,
      starMin: it.starMin,
      rank: it.rank,
      lines: it.lines,
      options,
      points: Object.fromEntries([...shown].map((l) => [l, points(l) / 100])),
      ied: iedWorth(values),
      score: score / 100,
      // the best Legendary lines (both cubes roll the same lines)
      best: rolls.bright.ranks[3]!.at(-1)![0] / 100,
      cooldown: isHat(it) ? { sec: linesCooldown(it.lines), min: values.cdMin, points: [0, 1, 2, 3, 4, 5, 6].map((s) => cooldownPoints(values, s) / 100) } : null,
      cubes,
      cheaper,
      stop,
    };
  });
  // Stryker disable next-line ArrayCallback: see the sort's test (cheapest first, endless last)
  // (a hat's cube needed for its minimum cooldown that adds nothing has none: last too)
  items.sort((a, b) => ((a.cheaper && a.cubes[a.cheaper].mesoPerFd) ?? Infinity) - ((b.cheaper && b.cubes[b.cheaper].mesoPerFd) ?? Infinity));
  return { known: true, budget, prices, items };
}

// One item's graph, for each cube: every score one cube can give with its chance (rank-ups included),
// and the curves (at Legendary). With a target score: what reaching it costs with each cube.
export interface PotentialGraph {
  // short: the chance one cube's roll doesn't keep a hat's minimum cooldown (not among the scores)
  cubes: Record<Cube, { distribution: [score: number, chance: number][]; short: number; curves: ReturnType<typeof flameCurves> }>;
  target: { score: number; cubes: Record<Cube, { cubes: number; meso: number } | null> } | null;
}

export async function potentialGraph(ownerId: string, characterId: number, slot: string, events: CubeEvent[], target: number | undefined): Promise<PotentialGraph> {
  const { job, values, equipped } = await characterGear(ownerId, characterId);
  if (!job) throw new HttpError(404, "No potential score for this job yet");
  const it = cubeable(equipped).find((i) => i.slot === slot);
  if (!it) throw new HttpError(404, "That slot has no item that can have potential");
  const from = fromRank(it);
  const rolls = { glowing: rollsOf(it, "glowing", job, values, events), bright: rollsOf(it, "bright", job, values, events) };
  const reach = (c: Cube, score: number) => {
    const n = cubesToReach(rolls[c], from, score);
    return n === null ? null : { cubes: n, meso: n * price(c, events) };
  };
  return {
    cubes: Object.fromEntries(
      CUBES.map((c) => {
        // (a hat's rolls under its minimum aren't scores: left out, their share given)
        const one = oneCube(rolls[c], from);
        return [c, { distribution: one.filter(([s]) => s !== SHORT).map(([s, p]) => [s / 100, p]), short: counted(one).short, curves: flameCurves(counted(rolls[c].ranks[3]!).dist, price(c, events)) }];
      }),
    ) as PotentialGraph["cubes"],
    target: target === undefined ? null : { score: target, cubes: { glowing: reach("glowing", target), bright: reach("bright", target) } },
  };
}
