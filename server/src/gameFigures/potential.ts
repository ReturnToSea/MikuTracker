import { readFileSync } from "node:fs";
import path from "node:path";
import type { POTENTIAL_RANKS } from "@miku/shared";

// Potential lines: potential-lines.json, built by hand from Nexon Korea's official tables with
// scripts/potential-fetch.mjs and scripts/potential-data.mjs (sources and dates there). Korea's lines
// and chances are GMS's (owner, 2026-10-24); GMS's one known difference is applied below. Two cubes:
// Korea's black cube is GMS's Bright Cube, its red cube GMS's Glowing Cube (v2.3.0).

type Rank = (typeof POTENTIAL_RANKS)[number];
export type CubeTable = "black" | "red";
type Parts = Record<string, Record<string, Partial<Record<Rank, number>>>>; // part → Nexon level → rank → table number
interface PotentialFile {
  lines: string[]; // every line once; the tables refer to them by number
  tables: [number, number][][][]; // each distinct table once: the 3 lines' options, [line number, chance in 1/10,000 %]
  cubes: Record<CubeTable, Parts>;
}

let loaded: PotentialFile | undefined;
export function potentialFile(): PotentialFile {
  loaded ??= JSON.parse(readFileSync(path.join(import.meta.dirname, "potential-lines.json"), "utf8")) as PotentialFile;
  return loaded;
}

// Nexon's level range for a GMS item level: a range for every 10 levels up to 119 (each tenth level on
// its own), then 120 and up. (Korea's Lv. 201+ tables aren't GMS's: a Genesis weapon rolls 40% boss and
// 12% crit rate, which Korea gives below Lv. 201; the owner, from a video of one being cubed.)
export function nexonLevel(level: number): number {
  // Stryker disable next-line EqualityOperator: Lv. 120 is a tenth level too, which gives 120 either way
  if (level >= 120) return 120;
  if (level < 10) return 0;
  return level % 10 === 0 ? level : Math.floor(level / 10) * 10 + 1;
}

// GMS's step for items from Lv. 151: +1% on main stat, all stats, attack, magic attack and damage %
// lines only (the wiki's level table: 13% stat lines from Lv. 151; a Genesis weapon's 13% ATT and
// damage beside 12% crit rate and 40% boss and IED). HP, MP and DEF % stay (a Nexon forum report of
// 12% HP on Lv. 151+ items, which Nexon reproduced), as do crit rate, boss, IED, cooldown and flat stats.
const GMS_STEP = /^(STR|DEX|INT|LUK|All Stats|ATT|Magic ATT|Damage) \+(\d+)%$/;
export const STEP_LEVEL = 151;

// The lines each of the 3 potential lines can roll with a cube's table, per rank, for a kind of item
// and level, with each line's chance (%). Empty when Nexon has no table for the kind.
type Options = Partial<Record<Rank, { line: string; chance: number }[][]>>;
// Each table worked out once and reused (the same item kind and level come up on every page and request).
const built = new Map<string, Options>();
export function potentialOptions(part: string, level: number, cube: CubeTable = "black"): Options {
  const key = `${part}|${level}|${cube}`;
  // Stryker disable next-line ConditionalExpression: building it again gives the same table
  if (!built.has(key)) built.set(key, buildOptions(part, level, cube));
  return built.get(key)!;
}
function buildOptions(part: string, level: number, cube: CubeTable): Options {
  const { lines, tables, cubes } = potentialFile();
  const parts = cubes[cube];
  // Nexon has no table where Korea has no item of that kind and level (no hats at Lv. 81–89): the
  // nearest level range it does have, below first, then above.
  // (JavaScript lists number-like keys in ascending order)
  const levels = Object.keys(parts[part] ?? {}).map(Number);
  const want = nexonLevel(level);
  // Stryker disable next-line EqualityOperator: `want` isn't among `levels` here, so < and <= agree
  const near = levels.includes(want) ? want : (levels.filter((l) => l < want).at(-1) ?? levels[0]);
  const ranks = near === undefined ? {} : parts[part]![String(near)]!;
  const step = level >= STEP_LEVEL;
  const shown = (line: string) => (step ? line.replace(GMS_STEP, (_, stat: string, v: string) => `${stat} +${Number(v) + 1}%`) : line);
  return Object.fromEntries(Object.entries(ranks).map(([rank, table]) => [rank, tables[table]!.map((p) => p.map(([i, c]) => ({ line: shown(lines[i]!), chance: c / 10000 })))]));
}

// A saved line the item can no longer roll (v2.3.0 corrected the Lv. 151+ values: Boss +45% isn't
// GMS's) becomes the nearest line it can: the same kind of line ("Boss Damage +#%"), with the closest
// numbers; null when no line of that kind is left.
export function nearestLine(line: string, options: string[]): string | null {
  // Stryker disable next-line StringLiteral: any mark for the numbers gives the same shapes
  const shape = (l: string) => l.replace(/\d+/g, "#");
  const numbers = (l: string) => (l.match(/\d+/g) ?? []).map(Number);
  const want = numbers(line);
  let best: string | null = null;
  let gap = Infinity;
  for (const o of options) {
    if (shape(o) !== shape(line)) continue;
    const d = numbers(o).reduce((sum, n, i) => sum + Math.abs(n - want[i]!), 0);
    // (a line still on the list is 0 away; a tie, exactly between two values, keeps the first listed)
    // Stryker disable next-line EqualityOperator: on a tie either line is as near
    if (d < gap) {
      best = o;
      gap = d;
    }
  }
  return best;
}
