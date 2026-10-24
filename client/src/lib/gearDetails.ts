import type { GearDetailsInput } from "@miku/shared";
import type { DetailOptions, GearItemView } from "../api/types";

// The gear details editor's rules, as plain functions: drafts, flame picks, potential lines and the
// item summary (base + stars + flames + hammers).

export const blankDetails = (): GearDetailsInput => ({ stars: 0, flames: {}, potential: null, hammers: 0 });

// A saved item's details as a draft to edit (stars start at the item's minimum: 22 on Genesis weapons).
export function draftOf(saved: GearDetailsInput | undefined, options: DetailOptions | undefined): GearDetailsInput {
  const d = saved ? structuredClone(saved) : blankDetails();
  if (options) d.stars = Math.max(d.stars, options.stars.min);
  return d;
}

// Whether a draft differs from what's saved (key order doesn't matter).
export function isDirty(draft: GearDetailsInput, saved: GearDetailsInput | undefined, options: DetailOptions | undefined): boolean {
  const base = draftOf(saved, options);
  const norm = (d: GearDetailsInput) => JSON.stringify({ ...d, flames: Object.fromEntries(Object.entries(d.flames).sort(([a], [b]) => a.localeCompare(b))) });
  return norm(draft) !== norm(base);
}

// Clicking a flame cell: picks that tier for the stat, or un-picks it if it was picked. A 5th stat
// can't be added (an item has at most 4 flames); changing a picked stat's tier is always fine.
export function toggleFlame(flames: Record<string, number>, stat: string, tier: number): Record<string, number> {
  const { [stat]: current, ...rest } = flames;
  if (current === tier) return rest;
  if (current === undefined && Object.keys(flames).length >= 4) return flames;
  return { ...rest, [stat]: tier };
}

// Clicking a star: sets that many stars; clicking the current top star takes one off. Kept within the
// item's range.
export function clickStar(current: number, star: number, min: number, max: number): number {
  const next = star === current ? star - 1 : star;
  return Math.min(max, Math.max(min, next));
}

// Changing the potential rank keeps only the lines that rank can also have.
export function withRank(potential: GearDetailsInput["potential"], rank: NonNullable<GearDetailsInput["potential"]>["rank"], options: DetailOptions): GearDetailsInput["potential"] {
  const lines = options.potential?.[rank];
  if (!lines) return null;
  const old = potential?.lines ?? [null, null, null];
  return { rank, lines: old.map((l, i) => (lines[i]!.some((o) => o.line === l) ? l : null)) };
}

// The lines one of the 3 potential lines can be, for the picked rank (each once, in Nexon's order).
export function lineChoices(options: DetailOptions, rank: string, position: number): string[] {
  return [...new Set((options.potential?.[rank]?.[position] ?? []).map((o) => o.line))];
}

// The item summary: each stat's base, stars, flames and hammers parts, and its total (only stats it
// has); plus the percentage lines and the potential lines.
export type SummaryStat = "STR" | "DEX" | "INT" | "LUK" | "Max HP" | "Max MP" | "ATT" | "Magic ATT";
export interface SummaryRow {
  stat: SummaryStat;
  base: number;
  stars: number;
  flames: number;
  hammers: number;
  total: number;
}
const KEYS: [SummaryStat, "str" | "dex" | "int" | "luk" | "hp" | "mp" | "att" | "matt"][] = [["STR", "str"], ["DEX", "dex"], ["INT", "int"], ["LUK", "luk"], ["Max HP", "hp"], ["Max MP", "mp"], ["ATT", "att"], ["Magic ATT", "matt"]];

export function summary(item: Pick<GearItemView, "stats" | "hammers"> | null, options: DetailOptions, d: GearDetailsInput): { rows: SummaryRow[]; extras: string[] } {
  const stars = options.stars.gains[Math.min(d.stars, options.stars.max)] ?? options.stars.gains[0]!;
  const flame = (stat: string, tier: number) => options.flames.find((r) => r.stat === stat)?.values[tier - 1] ?? 0;
  const fromFlames: Record<string, number> = {};
  const extras: string[] = [];
  for (const [stat, tier] of Object.entries(d.flames)) {
    const v = flame(stat, tier);
    if (stat.includes("+")) for (const s of stat.split("+")) fromFlames[s] = (fromFlames[s] ?? 0) + v;
    else if (stat === "M. ATT") fromFlames["Magic ATT"] = v;
    else if (KEYS.some(([k]) => k === stat)) fromFlames[stat] = v;
    else extras.push(stat === "Req. level" ? `Required level ${v}` : stat.endsWith("%") ? `${stat.replace(" %", "")} +${v}%` : `${stat} +${v}`);
  }
  const per = item?.hammers?.per ?? {};
  const hammer = (key: string, stat: SummaryStat) => d.hammers * ((stat === "STR" || stat === "DEX" || stat === "INT" || stat === "LUK" ? per.allStat : per[key as keyof typeof per]) ?? 0);
  const rows = KEYS.map(([stat, key]) => {
    const base = item?.stats?.[key] ?? 0;
    const row = { stat, base, stars: stars[key], flames: fromFlames[stat] ?? 0, hammers: hammer(key, stat), total: 0 };
    row.total = row.base + row.stars + row.flames + row.hammers;
    return row;
  }).filter((r) => r.total !== 0);
  const own = item?.stats ?? {};
  if (own.hpPct) extras.unshift(`Max HP +${own.hpPct}%`);
  if (own.boss) extras.unshift(`Boss Damage +${own.boss}%`);
  if (own.ied) extras.unshift(`Ignore Enemy DEF +${own.ied}%`);
  return { rows, extras };
}

// A draft fitted to an item's options (a typed item's level or boss tick changed): stars within its
// range, only the flames and potential lines it can still have.
export function fitDraft(d: GearDetailsInput, o: DetailOptions): GearDetailsInput {
  const flames = Object.fromEntries(Object.entries(d.flames).filter(([stat, tier]) => (o.flames.find((r) => r.stat === stat)?.values[tier - 1] ?? null) !== null));
  const potential = d.potential && withRank(d.potential, d.potential.rank, o);
  return { ...d, stars: Math.min(o.stars.max, Math.max(o.stars.min, d.stars)), flames, potential, hammers: Math.min(d.hammers, o.hammers?.count ?? 0) };
}
