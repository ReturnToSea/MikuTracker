import { flameLinePoints, iedLinePoints, STAT_PCT_DEFAULTS, type StatValuesInput } from "@miku/shared";
import type { JobStats, MainStatName } from "../gameFigures/jobStats";
import { CHANCES } from "./flames";

// Potential lines and what cubes do to them (the Potential page, v2.3.0). Pure: an item's line tables,
// the character's job and stat values, and the cube's rank-up chances and price come in; the numbers
// go out. Scores are in main stat, counted in hundredths like flame scores (each line rounded on its
// own); final damage comes from them the same way.

// 1% of a stat, in main stat: the character's own value, or until it's typed the job's default (a main
// stat 12.97, a third of that for each of Xenon's three, a secondary stat 1.68, Demon Avenger's HP as a
// main stat); 0 for a stat the job doesn't use.
const PCT_FIELD = { STR: "strPct", DEX: "dexPct", INT: "intPct", LUK: "lukPct", HP: "hpPct" } as const;
export type PctStat = keyof typeof PCT_FIELD;
export function pctDefault(job: JobStats, stat: PctStat): number {
  if (stat === "HP") return job.hpMain ? STAT_PCT_DEFAULTS.main : 0;
  if (job.main.some((m) => m === stat)) return STAT_PCT_DEFAULTS.main / job.main.length;
  return job.secondary.some((m) => m === stat) ? STAT_PCT_DEFAULTS.secondary : 0;
}
export function pctWorth(job: JobStats, values: StatValuesInput, stat: PctStat): number {
  const used = pctDefault(job, stat) > 0;
  return used ? (values[PCT_FIELD[stat]] ?? pctDefault(job, stat)) : 0;
}

// The stat value boxes a character needs (the gear tab's): each stat it uses, its main stats first, with
// the default shown until a value is typed; ATT or Magic ATT; a secondary stat ratio and all stats unless
// the job has no secondary stat or uses HP.
export interface StatBoxes {
  pct: { stat: PctStat; field: (typeof PCT_FIELD)[PctStat]; main: boolean; default: number }[];
  magic: boolean;
  secondary: boolean;
  allStat: boolean;
}
export function statBoxes(job: JobStats): StatBoxes {
  const stats: PctStat[] = job.hpMain ? ["HP"] : [...job.main, ...job.secondary];
  return {
    pct: stats.map((stat) => ({ stat, field: PCT_FIELD[stat], main: stat === "HP" || job.main.some((m) => m === stat), default: pctDefault(job, stat) })),
    magic: job.magic === true,
    secondary: job.secondary.length > 0,
    allStat: !job.hpMain,
  };
}

// What one potential line is worth to a character, in hundredths of a point of main stat. Lines that
// add no damage (crit rate, HP for most, DEF, drop and meso rate, recovery…) are worth 0.
export function linePoints(line: string, job: JobStats, values: StatValuesInput): number {
  const flat = (s: string) => (job.main.some((m) => m === s) ? 1 : job.secondary.some((m) => m === s) ? values.secRatio : 0);
  let m: RegExpMatchArray | null;
  if ((m = /^(STR|DEX|INT|LUK) \+(\d+)(%?)$/.exec(line))) return flameLinePoints(m[3] ? pctWorth(job, values, m[1] as MainStatName) : flat(m[1]!), Number(m[2]));
  if ((m = /^All Stats \+(\d+)(%?)$/.exec(line))) {
    // all stat % raises every stat but HP: the 1% All Stat value (Xenon's too, as on the Flames page)
    const worth = m[2] ? (job.hpMain ? 0 : values.allStat) : (["STR", "DEX", "INT", "LUK"] as MainStatName[]).reduce((sum, s) => sum + flat(s), 0);
    return flameLinePoints(worth, Number(m[1]));
  }
  // Demon Avenger's main stat is HP
  if ((m = /^Max HP \+(\d+)(%?)$/.exec(line))) return job.hpMain ? flameLinePoints(m[2] ? pctWorth(job, values, "HP") : 1, Number(m[1])) : 0;
  if ((m = /^(ATT|Magic ATT) \+(\d+)(%?)$/.exec(line))) return (m[1] === "Magic ATT") === (job.magic === true) ? flameLinePoints(m[3] ? values.attPct : values.att, Number(m[2])) : 0;
  if ((m = /^(?:Boss Damage|Damage) \+(\d+)%$/.exec(line))) return flameLinePoints(values.bossDmg, Number(m[1]));
  // (one line on its own; an item's IED lines combine: linesPoints)
  if ((m = /^Ignore Enemy DEF \+(\d+)%$/.exec(line))) return flameLinePoints(iedWorth(values), Number(m[1]));
  if ((m = /^Critical Damage \+(\d+)%$/.exec(line))) return flameLinePoints(values.critDmg, Number(m[1]));
  // (one line on its own; an item's cooldown lines add up first: linesPoints; any other line is 0 s, worth 0)
  return cooldownPoints(values, cooldownSeconds(line));
}

// Skill cooldown (v2.4.1) isn't worth the same each second: the final damage typed for each total from
// 2 to 6 s; a total with none typed takes the nearest typed one below (more is never worth less, and
// nothing is made up); 1 s, or none typed, is worth nothing. As score: ÷ (final damage per point).
export function cooldownSeconds(line: string): number {
  const m = /^Skill Cooldown -(\d+) sec$/.exec(line);
  return m ? Number(m[1]) : 0;
}
export function cooldownFd(values: StatValuesInput, sec: number): number {
  const typed = [values.cd2, values.cd3, values.cd4, values.cd5, values.cd6];
  // (2 s is typed[0]; past 6 s, 6 s's)
  for (let i = Math.min(sec, 6) - 2; i >= 0; i--) if (typed[i] !== null) return typed[i]!;
  return 0;
}
export const cooldownPoints = (values: StatValuesInput, sec: number): number => (values.fdPer100 > 0 ? flameLinePoints((cooldownFd(values, sec) * 100) / values.fdPer100, 1) : 0);
// (an empty line, "null", is no cooldown line either)
export const linesCooldown = (lines: (string | null)[]): number => lines.reduce((sum, l) => sum + cooldownSeconds(String(l)), 0);

// A roll that doesn't keep the hat's minimum cooldown (v2.4.1) doesn't qualify: a score below every real
// one (scores are never negative), so nothing counts it as better and any roll that qualifies beats it.
export const SHORT = -1;
// How a roll's cooldown counts: the score its total seconds add, and the seconds it must keep (0: none).
export interface CooldownRule {
  points: (sec: number) => number;
  min: number;
}
export const NO_COOLDOWN: CooldownRule = { points: () => 0, min: 0 };

// Ignore defense, as in game: an item's IED lines multiply, so 40%, 40% and 30% are 1 − 0.6 × 0.6 × 0.7 =
// 74.8% (the owner, 2026-10-28), worth the character's 1% IED value (at the bosses' defense picked).
export const iedWorth = (values: StatValuesInput): number => (values.bossDef === 380 ? values.ied380 : values.ied300);
export function iedPercent(line: string): number {
  const m = /^Ignore Enemy DEF \+(\d+)%$/.exec(line);
  return m ? Number(m[1]) : 0;
}
// Some lines' score, in hundredths: each line on its own (rounded to the hundredth, like flame lines),
// except the IED lines, which combine first, and the cooldown lines, whose seconds add up first.
export function linesPoints(lines: (string | null)[], job: JobStats, values: StatValuesInput): number {
  let sum = 0;
  let left = 1;
  for (const line of lines) {
    // Stryker disable next-line ConditionalExpression: an empty line read as a line is worth 0 too
    if (line === null) continue;
    const ied = iedPercent(line);
    if (ied > 0) left *= 1 - ied / 100;
    else if (cooldownSeconds(line) === 0) sum += linePoints(line, job, values);
  }
  return sum + iedLinePoints(iedWorth(values), left) + cooldownPoints(values, linesCooldown(lines));
}

// Nexon Korea: an item rolls at most 1 Decent skill line and 1 invincibility-time line, and 2 of the
// "ignore damage" and "invincible chance" lines; once a kind is full, the later lines leave it out, the
// others' chances rescaled (shown chance ÷ (100% − the left-out chances)). Boss, IED and drop rate can
// fill all 3 lines (brendonmay's calculator follows the same rules).
const LIMITS: [RegExp, number][] = [
  [/^Enables <Decent /, 1],
  [/^Invincibility after being hit /, 1],
  [/ chance to ignore \d+% damage when hit$/, 2],
  [/ chance to become invincible for /, 2],
];
const limitOf = (line: string) => LIMITS.findIndex(([re]) => re.test(line));

export interface LineOption {
  line: string;
  chance: number; // %
}

// One cube's 3 lines at a rank: every score it can give (in hundredths, lowest first) with its chance,
// worked out exactly over every roll. IED lines combine (as linesPoints) at `ied` main stat per 1%, and
// cooldown lines' seconds add up, then count by the rule (a roll under its minimum: SHORT); the other
// lines add their points. Lines Korea's page lists that aren't translated are left out of
// the table (none is a damage line): what's missing from 100% counts as a line worth 0. Korea's chances
// are rounded to 4 decimals, so a line's can add up to a hair over 100%: then they're shared out of
// their own total.
export function rollDistribution(table: LineOption[][], points: (line: string) => number, ied = 0, cd: CooldownRule = NO_COOLDOWN): [score: number, chance: number][] {
  // each line's options grouped by score and limited kind (-1: none)
  const slots = table.map((options) => {
    const groups = new Map<string, { score: number; kind: number; ied: number; sec: number; chance: number }>();
    const listed = options.reduce((sum, o) => sum + o.chance, 0);
    const whole = Math.max(100, listed);
    for (const o of options) {
      const share = iedPercent(o.line);
      const sec = cooldownSeconds(o.line);
      const score = share > 0 || sec > 0 ? 0 : points(o.line);
      const kind = limitOf(o.line);
      const key = `${score}|${kind}|${share}|${sec}`;
      const g = groups.get(key);
      if (g) g.chance += o.chance / whole;
      else groups.set(key, { score, kind, ied: share, sec, chance: o.chance / whole });
    }
    const out = [...groups.values()];
    // (a share too small to matter is rounding, not a line)
    const rest = (100 - listed) / 100;
    // Stryker disable next-line EqualityOperator: the rest is never exactly 1e-9
    if (rest > 1e-9) out.push({ score: 0, kind: -1, ied: 0, sec: 0, chance: rest });
    return out;
  });
  const out = new Map<number, number>();
  // (defense: the share of the enemy's defense the IED lines so far leave)
  // (sec: the cooldown lines' seconds so far)
  const walk = (i: number, score: number, chance: number, counts: number[], defense: number, sec: number) => {
    if (i === slots.length) {
      const total = sec < cd.min ? SHORT : score + iedLinePoints(ied, defense) + cd.points(sec);
      out.set(total, (out.get(total) ?? 0) + chance);
      return;
    }
    const full = (kind: number) => kind >= 0 && counts[kind]! >= LIMITS[kind]![1];
    const left = slots[i]!.reduce((sum, g) => (full(g.kind) ? sum - g.chance : sum), 1);
    for (const g of slots[i]!) {
      if (full(g.kind)) continue;
      walk(i + 1, score + g.score, (chance * g.chance) / left, counts.map((c, k) => (k === g.kind ? c + 1 : c)), defense * (1 - g.ied / 100), sec + g.sec);
    }
  };
  walk(0, 0, 1, LIMITS.map(() => 0), 1, 0);
  return [...out].sort((a, b) => a[0] - b[0]);
}

// The chance of a score above x and the sum of score × chance over those, for any x: from each place in
// the list onward.
interface Tails {
  scores: number[];
  chance: Float64Array;
  weighted: Float64Array;
}
function tails(dist: [number, number][]): Tails {
  const chance = new Float64Array(dist.length + 1);
  const weighted = new Float64Array(dist.length + 1);
  for (let i = dist.length - 1; i >= 0; i--) {
    chance[i] = chance[i + 1]! + dist[i]![1];
    weighted[i] = weighted[i + 1]! + dist[i]![1] * dist[i]![0];
  }
  return { scores: dist.map((d) => d[0]), chance, weighted };
}
function above(t: Tails, x: number) {
  let lo = 0;
  let hi = t.scores.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t.scores[mid]! > x) hi = mid;
    else lo = mid + 1;
  }
  return { chance: t.chance[lo]!, weighted: t.weighted[lo]! };
}

// An item's cube, ready to work with: each rank's roll (Rare, Epic, Unique, Legendary) and the chance a
// cube ranks the item up from each of the first three.
export interface CubeRolls {
  ranks: [number, number][][];
  rankUp: readonly number[];
}

// Cubing from a rank until a roll scores above x (in hundredths), rank-ups on the way: each cube first
// ranks the item up with its chance (then rolls the new rank's lines), else rolls this rank's lines.
// Worked out exactly, from Legendary down: the cubes it takes on average, the score it ends on on
// average, and each rank's chances (for how the chance builds up cube by cube).
export interface Cubing {
  cubes: number; // Infinity: no roll can beat x
  final: number; // in hundredths (NaN when it never ends)
  first: number; // the chance the next cube beats x
  steps: { stop: number; up: number; stay: number }[]; // per rank from `from`: the chance a cube ends it, moves it up a rank without ending it, or leaves it there
  from: number;
}
export function cubeUntil(rolls: CubeRolls, from: number, x: number): Cubing {
  const steps: Cubing["steps"] = [];
  let next: { beat: { chance: number; weighted: number }; cubes: number; final: number } | null = null;
  for (let r = rolls.ranks.length - 1; r >= from; r--) {
    const beat = above(tails(rolls.ranks[r]!), x);
    const higher: number = next ? next.beat.chance : 0;
    const u: number = next ? Math.min(1, rolls.rankUp[r] ?? 0) : 0;
    const stop = u * higher + (1 - u) * beat.chance;
    const up = u * (1 - higher);
    const stay = (1 - u) * (1 - beat.chance);
    // E = 1 + up·E(next) + stay·E, so E = (1 + up·E(next)) / (1 − stay); the same for the final score
    const ends = 1 - stay;
    // (when nothing ends it, ends is 0: Infinity cubes and a NaN final score)
    const cubes: number = (1 + (up > 0 ? up * next!.cubes : 0)) / ends;
    const final: number = (u * (next ? next.beat.weighted : 0) + (1 - u) * beat.weighted + (up > 0 ? up * next!.final : 0)) / ends;
    steps.push({ stop, up, stay });
    next = { beat, cubes, final };
  }
  // (worked out from the top rank down; listed from `from` up)
  steps.reverse();
  return { cubes: next!.cubes, final: next!.final, first: steps[0]!.stop, steps, from };
}

// How many cubes give a chance of at least each x of ending (null: never): the chance builds up cube by
// cube over the ranks; once only Legendary is left it's a fixed chance a cube, worked out directly.
export function cubesForChance(c: Cubing, xs: readonly number[]): (number | null)[] {
  if (!Number.isFinite(c.cubes)) return xs.map(() => null);
  const out: (number | null)[] = xs.map(() => null);
  let at: number[] = c.steps.map((_, i) => (i === 0 ? 1 : 0));
  let done = 0;
  const top = c.steps.length - 1;
  // Stryker disable next-line EqualityOperator: a safety bound; the lower ranks drain long before it (rank-ups are 2.5% and up)
  for (let n = 1; n <= 100_000; n++) {
    const next = at.map(() => 0);
    at.forEach((p, i) => {
      const s = c.steps[i]!;
      done += p * s.stop;
      if (i < top) next[i + 1]! += p * s.up;
      next[i]! += p * s.stay;
    });
    at = next;
    xs.forEach((x, i) => {
      // Stryker disable next-line EqualityOperator: done is never exactly x − 1e-12
      if (out[i] === null && done >= x - 1e-12) out[i] = n;
    });
    const below = at.slice(0, top).reduce((a, b) => a + b, 0);
    // Stryker disable next-line EqualityOperator: below is never exactly 1e-13
    if (below < 1e-13) {
      // the rest is all at the top rank: each cube ends it with the same chance
      const p = c.steps[top]!.stop;
      const left = at[top]!;
      return out.map((o, i) => o ?? n + Math.max(1, Math.ceil(Math.log((1 - xs[i]!) / left) / Math.log1p(-p) - 1e-9)));
    }
  }
  return out;
}

// Everything the page says about one cube on one item. Meso figures are null where they'd be endless.
export interface CubeMetrics {
  better: number; // the chance the next cube beats the current lines
  rankUp: number; // the chance a cube ranks the item up (0 at Legendary)
  cubesToBetter: number | null; // on average, rank-ups included
  mesoToBetter: number | null;
  gainIfBetter: number | null; // score added when it ends, on average
  fdIfBetter: number | null; // the final damage that adds, %
  mesoPerFd: number | null; // meso per 1% final damage, cubing until a better roll
  cubesForChance: { chance: number; cubes: number | null }[];
}
// (`current` is what a roll must beat: SHORT when the item doesn't keep its minimum cooldown; `real` is
// its lines' score, what a better roll's gain is counted from)
export function cubeMetrics(rolls: CubeRolls, from: number, current: number, price: number, fdPer100: number, real = current): CubeMetrics {
  const c = cubeUntil(rolls, from, current);
  const ends = Number.isFinite(c.cubes);
  const gain = ends ? (c.final - real) / 100 : null;
  const fd = ((gain ?? 0) * fdPer100) / 100;
  const counts = cubesForChance(c, CHANCES);
  return {
    better: c.first,
    // (the top rank has no rank-up chance)
    rankUp: Math.min(1, rolls.rankUp[from] ?? 0),
    cubesToBetter: ends ? c.cubes : null,
    mesoToBetter: ends ? c.cubes * price : null,
    gainIfBetter: gain,
    fdIfBetter: gain === null ? null : fd,
    mesoPerFd: ends && fd > 0 ? (c.cubes * price) / fd : null,
    cubesForChance: CHANCES.map((chance, i) => ({ chance, cubes: counts[i]! })),
  };
}

// What one cube can give from a rank: its rank-up chance's share rolls the next rank's lines.
export function oneCube(rolls: CubeRolls, from: number): [score: number, chance: number][] {
  const u = Math.min(1, rolls.rankUp[from] ?? 0);
  const out = new Map<number, number>();
  for (const [score, chance] of rolls.ranks[from]!) out.set(score, (out.get(score) ?? 0) + chance * (1 - u));
  if (u > 0) for (const [score, chance] of rolls.ranks[from + 1]!) out.set(score, (out.get(score) ?? 0) + chance * u);
  return [...out].sort((a, b) => a[0] - b[0]);
}

// Cubing from a rank until the score is at least `score` (in points): the cubes on average (null: never).
export function cubesToReach(rolls: CubeRolls, from: number, score: number): number | null {
  // rolls score whole hundredths: at least 12.34 is above 12.33
  const c = cubeUntil(rolls, from, Math.ceil(score * 100 - 1e-9) - 1);
  return Number.isFinite(c.cubes) ? c.cubes : null;
}

// A roll's scores for the graph and the stop score, where a roll that doesn't qualify counts as nothing
// (0: never above a score), its share given separately.
export function counted(dist: [number, number][]): { dist: [number, number][]; short: number } {
  const short = dist.filter(([s]) => s === SHORT).reduce((sum, [, p]) => sum + p, 0);
  const rest = dist.filter(([s]) => s !== SHORT);
  if (short === 0) return { dist: rest, short };
  const zero = rest.find(([s]) => s === 0);
  return { dist: zero ? rest.map(([s, p]): [number, number] => (s === 0 ? [0, p + short] : [s, p])) : [[0, short], ...rest], short };
}
