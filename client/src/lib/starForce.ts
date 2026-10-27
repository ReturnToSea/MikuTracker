import type { GearDetailsInput } from "@miku/shared";
import type { StarForceDetail, StarForceRow } from "../api/types";

// The Star Force page's display rules, as plain functions: how a rate is written, what's saved, and how
// the table and graphs are laid out.

export const SF_EVENT_LABELS = [
  ["thirtyOff", "30% off"],
  ["fewerBooms", "30% fewer booms"],
  ["fiveTenFifteen", "5/10/15"],
  ["plusOne", "+1 star (to 10★)"],
] as const;
export type SfEventKey = (typeof SF_EVENT_LABELS)[number][0];

// A rate as the game shows it: every decimal it has (15.75%, 2.055%, 12.6375%), never rounded to look
// different; "—" for none.
export function formatRate(p: number): string {
  if (p <= 0) return "—";
  return `${+(p * 100).toFixed(4)}%`;
}

// The events for a request, in a fixed order (so the same events always ask the same question).
export const eventsParam = (on: ReadonlySet<SfEventKey>): string => SF_EVENT_LABELS.map(([k]) => k).filter((k) => on.has(k)).join(",");

// What saving sends: the item's other details as saved, with new stars, or a new boom cost and boxes
// (nothing saved yet: blank details at the stars it comes with).
const base = (saved: GearDetailsInput | undefined, starMin: number): GearDetailsInput => saved ?? { stars: starMin, flames: {}, potential: null, hammers: 0 };
export function withStars(saved: GearDetailsInput | undefined, starMin: number, stars: number): GearDetailsInput {
  return { ...base(saved, starMin), stars };
}
export function withBoomSettings(saved: GearDetailsInput | undefined, starMin: number, boomCost: number, safety: "1144" | "4444" | null): GearDetailsInput {
  const { boomCost: _b, safety: _s, ...rest } = base(saved, starMin);
  return { ...rest, ...(boomCost > 0 ? { boomCost } : {}), ...(safety ? { safety } : {}) };
}

// The boom cost box (plain meso): a whole number up to 1,000,000,000,000,000 (what the server takes), or
// null if it isn't one.
export function boomCostFrom(text: string): number | null {
  const n = Number(text.replaceAll(",", ""));
  if (text.trim() === "" || !Number.isFinite(n) || n < 0 || n > 1e15) return null;
  return Math.round(n);
}

// The best-jump column: for each row, how many rows its jump spans if one starts there (0: it's inside
// a jump that started above).
export function jumpSpans(rows: StarForceRow[], jumps: StarForceDetail["jumps"]): number[] {
  return rows.map((r) => {
    const j = jumps.find((x) => x.from === r.from);
    return j ? rows.filter((x) => x.from >= j.from && x.to <= j.to).length : 0;
  });
}

// The cost graph's points: each range's middle and its share of runs.
export const costPoints = (g: StarForceDetail["graphs"]["cost"]): [number, number][] => g.bins.map((share, i) => [(i + 0.5) * g.width, share]);
