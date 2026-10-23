import { MAX_LEVEL } from "@miku/shared";
import type { LevelPoint } from "../api/types";
import { dayLabel, fullDate } from "./chart";

// The level line chart's numbers, as plain functions. Levels include progress through the level:
// 278 at 93% is 278.93.

export interface LevelScale {
  lo: number;
  hi: number;
  ticks: number[]; // where the dashed lines and labels go
}

// The scale for these levels: rounded out to quarter levels, with lines every quarter level when
// it spans one level or less, otherwise every level, or every few levels so there are at most 6
// steps. Null with none.
export function levelScale(levels: number[]): LevelScale | null {
  if (levels.length === 0) return null;
  // Never above the highest level (no "300 · 25%"), and never flat.
  const hi = Math.min(MAX_LEVEL, Math.ceil(Math.max(...levels) * 4) / 4);
  const lo = Math.min(hi - 0.25, Math.floor(Math.min(...levels) * 4) / 4);
  const span = hi - lo;
  const step = span <= 1 ? 0.25 : Math.ceil(span / 6);
  // In whole steps (quarters are exact in binary, so nothing drifts): from the first at or above
  // lo to the last at or below hi.
  const first = Math.ceil(lo / step);
  const last = Math.floor(hi / step);
  return { lo, hi, ticks: Array.from({ length: last - first + 1 }, (_, k) => (first + k) * step) };
}

// How high a level sits in the scale, from 0 to 1.
export const levelHeight = (level: number, scale: LevelScale) => (level - scale.lo) / (scale.hi - scale.lo);

// A scale label: "278", or "278 · 25%" between whole levels.
export const tickLabel = (t: number) => (Number.isInteger(t) ? String(t) : `${Math.floor(t)} · ${Math.round((t % 1) * 100)}%`);

// "Lv. 278 · 93.00%" ("Lv. 300" at the top). Rounded down, so a level that isn't done never
// shows as 100.00% (allowing for how 278.2 is stored, as 278.19999…, so it still shows 20.00%).
export const levelText = (level: number) =>
  level >= MAX_LEVEL ? `Lv. ${MAX_LEVEL}` : `Lv. ${Math.floor(level)} · ${(Math.floor((level % 1) * 10000 + 1e-6) / 100).toFixed(2)}%`;

const before = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) - days * 864e5).toISOString().slice(0, 10);

// What a day's tooltip says: its level, and any level-ups since the check before ("since the last
// check (Oct 19)" when that was more than a day earlier). A day without a check says so.
export function levelDetail(day: string, point: LevelPoint | undefined, today: string): string {
  const when = fullDate(day) + (day === today ? " (today)" : "");
  if (!point) return `${when}: no data (not checked that day)`;
  const reached = point.reached.length === 0 ? "" : ` · reached ${point.reached.join(", ")}${point.covers > 1 ? ` since the last check (${dayLabel(before(day, point.covers))})` : ""}`;
  return `${when}: ${levelText(point.level)}${reached}`;
}
