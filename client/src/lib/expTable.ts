import type { ExpTableRow } from "../api/types";

// The level ranges the EXP table tab can show.
export const EXP_RANGES = [
  { id: "1-199", label: "1–199", from: 1, to: 199 },
  { id: "200-299", label: "200–299", from: 200, to: 299 },
  { id: "all", label: "All", from: 1, to: 299 },
] as const;
export type ExpRangeId = (typeof EXP_RANGES)[number]["id"];
export const DEFAULT_RANGE: ExpRangeId = "200-299";

export const rangeOf = (id: ExpRangeId) => EXP_RANGES.find((r) => r.id === id)!;

// The narrower range a level is in (for jumping to a level outside the range shown).
export const rangeFor = (level: number): ExpRangeId => (level < 200 ? "1-199" : "200-299");

export const rowsIn = (rows: ExpTableRow[], id: ExpRangeId) => {
  const { from, to } = rangeOf(id);
  return rows.filter((r) => r.level >= from && r.level <= to);
};

// A typed level to jump to, or null if it isn't one of 1–299.
export function jumpLevel(text: string): number | null {
  const level = Number(text);
  return /^\d+$/.test(text.trim()) && level >= 1 && level <= 299 ? level : null;
}
