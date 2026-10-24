import { readFileSync } from "node:fs";
import path from "node:path";
import type { POTENTIAL_RANKS } from "@miku/shared";

// Potential lines: potential-lines.json, built by hand from Nexon Korea's official tables with
// scripts/potential-fetch.mjs and scripts/potential-data.mjs (sources and dates there). Korea's lines
// and chances are GMS's (owner, 2026-10-24); GMS's one known difference is applied below.

type Rank = (typeof POTENTIAL_RANKS)[number];
interface PotentialFile {
  lines: string[]; // every line once; the tables refer to them by number
  tables: [number, number][][][]; // each distinct table once: the 3 lines' options, [line number, chance in 1/10,000 %]
  parts: Record<string, Record<string, Partial<Record<Rank, number>>>>; // part → Nexon level → rank → table number
}

let loaded: PotentialFile | undefined;
export function potentialFile(): PotentialFile {
  loaded ??= JSON.parse(readFileSync(path.join(import.meta.dirname, "potential-lines.json"), "utf8")) as PotentialFile;
  return loaded;
}

// Nexon's level range for a GMS item level. Nexon Korea has a range for every 10 levels up to 119
// (each tenth level on its own), then 120–200 and 201–250. GMS gives items from Lv. 151 the values
// Korea gives from Lv. 201 (a GMS bug report on Nexon's forum and the wiki's level table both say from
// Lv. 151; brendonmay's cubing calculator raises from Lv. 160).
export function nexonLevel(level: number): number {
  if (level >= 151) return 201;
  // Stryker disable next-line EqualityOperator: Lv. 120 is a tenth level too, which gives 120 either way
  if (level >= 120) return 120;
  if (level < 10) return 0;
  return level % 10 === 0 ? level : Math.floor(level / 10) * 10 + 1;
}

// The lines GMS's Lv. 151+ step raises by 1%: main stats, all stats, attack, magic attack, crit rate,
// damage and Max HP % (not boss damage, ignore defense, cooldown or flat stats).
const GMS_STEP = /^(STR|DEX|INT|LUK|All Stats|ATT|Magic ATT|Critical Rate|Damage|Max HP) \+(\d+)%$/;

// The lines each of the 3 potential lines can roll, per rank, for a kind of item and level, with
// each line's chance (%). null when Nexon has no table (e.g. no Rare emblems at that level).
export function potentialOptions(part: string, level: number): Partial<Record<Rank, { line: string; chance: number }[][]>> {
  const { lines, tables, parts } = potentialFile();
  // Nexon has no table where Korea has no item of that kind and level (no hats at Lv. 81–89): the
  // nearest level range it does have, below first, then above.
  // (JavaScript lists number-like keys in ascending order)
  const levels = Object.keys(parts[part] ?? {}).map(Number);
  const want = nexonLevel(level);
  // Stryker disable next-line EqualityOperator: `want` isn't among `levels` here, so < and <= agree
  const near = levels.includes(want) ? want : (levels.filter((l) => l < want).at(-1) ?? levels[0]);
  const ranks = near === undefined ? {} : parts[part]![String(near)]!;
  // GMS's step for items from Lv. 151 where Korea has no Lv. 201+ table for that kind (belts, earrings,
  // emblems, overalls, secondaries, hearts…): Korea's lower table with +1% on the lines the step
  // raises: exactly the lines Korea's own tables raise by 1% from Lv. 120–200 to 201+ (weapons, hats).
  const step = want === 201 && near !== 201;
  const shown = (line: string) => (step ? line.replace(GMS_STEP, (_, stat: string, v: string) => `${stat} +${Number(v) + 1}%`) : line);
  return Object.fromEntries(Object.entries(ranks).map(([rank, table]) => [rank, tables[table]!.map((p) => p.map(([i, c]) => ({ line: shown(lines[i]!), chance: c / 10000 })))]));
}
