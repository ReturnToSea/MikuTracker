import { CUBE_EVENTS, type GearDetailsInput, iedLinePoints, type POTENTIAL_RANKS, type StatValuesInput } from "@miku/shared";
import type { PotentialItem } from "../api/types";
import { formatChance, formatScore } from "./flames";

// The Potential page's display rules (v2.3.0), as plain functions.

type Rank = (typeof POTENTIAL_RANKS)[number];
export type Potential = NonNullable<GearDetailsInput["potential"]>;
export type CubeEvent = (typeof CUBE_EVENTS)[number];

export const CUBE_EVENT_LABELS: [CubeEvent, string][] = [
  ["miracle", "Double Miracle Time"],
  ["sale", "Cube sale (25% off)"],
];
// The events for a request, in a fixed order (so the same events always ask the same question).
export const cubeEventsParam = (on: ReadonlySet<CubeEvent>): string => CUBE_EVENTS.filter((k) => on.has(k)).join(",");

// A cube's price in millions, its half million kept (a sale's Bright Cube is 16.5m, not "17m").
export const cubePrice = (meso: number): string => `${(Math.round(meso / 1e5) / 10).toLocaleString("en-US")}m`;

// A chance per cube as "1 in X" (the owner: easier to read than a tiny percent); one decimal below 10.
export function oneIn(p: number): string {
  if (p <= 0) return "never";
  if (p >= 1) return "every cube";
  const n = 1 / p;
  return `1 in ${n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString("en-US")}`;
}

// A chance with its small values kept: two significant figures below 10% (0.054%, not "<0.1%").
// Stryker disable next-line EqualityOperator: at exactly 10% both ways read "10%"
export const fineChance = (p: number): string => (p > 0 && p < 0.1 ? `${(p * 100).toPrecision(2)}%` : formatChance(p));

// The lines' score as the editor's lines change, added up as the server does: each line's points (from
// the server), except ignore defense lines, which multiply as in game (40% and 40%: 1 − 0.6 × 0.6 = 64%)
// and are worth `ied` a percent together.
// (cooldown: a hat's points at each total from 0 to 6 s; its cooldown lines' seconds add up first, as on
// the server)
export function liveScore(points: Record<string, number>, lines: (string | null)[], ied: number, cooldown: readonly number[] | null = null): number {
  // in hundredths, as the server adds them (each line's points are whole hundredths)
  let sum = 0;
  let defense = 1;
  let sec = 0;
  for (const l of lines) {
    const m = /^Ignore Enemy DEF \+(\d+)%$/.exec(String(l));
    const cd = /^Skill Cooldown -(\d+) sec$/.exec(String(l));
    if (m) defense *= 1 - Number(m[1]) / 100;
    else if (cd && cooldown) sec += Number(cd[1]);
    // (an empty line is worth nothing, as is one the server didn't send)
    else sum += Math.round((points[String(l)] ?? 0) * 100);
  }
  const cdPoints = cooldown ? Math.round(cooldown[Math.min(sec, cooldown.length - 1)]! * 100) : 0;
  return (sum + iedLinePoints(ied, defense) + cdPoints) / 100;
}

// A skill cooldown box left empty counts as the nearest filled box below it (the server's rule): which
// one that is, or null (nothing below: it counts as nothing).
export function cooldownBelow(v: StatValuesInput, sec: number): { sec: number; value: number } | null {
  for (let s = sec - 1; s >= 2; s--) {
    const value = v[`cd${s}` as `cd${2 | 3 | 4 | 5 | 6}`];
    if (value !== null) return { sec: s, value };
  }
  return null;
}

// Changing the rank keeps only the lines that rank can also have, in the same place.
export function withRank(item: Pick<PotentialItem, "options">, potential: Potential | null, rank: Rank | null): Potential | null {
  if (rank === null) return null;
  const options = item.options[rank];
  const old = potential?.lines ?? [null, null, null];
  return { rank, lines: old.map((l, i) => (options?.[i]!.includes(l!) ? l : null)) };
}

// Whether the editor's lines differ from the saved ones.
export const changed = (item: Pick<PotentialItem, "rank" | "lines">, draft: Potential | null): boolean => (draft?.rank ?? null) !== item.rank || (draft !== null && draft.lines.some((l, i) => l !== item.lines[i]));

// What saving new lines sends: the item's other details as saved (a typed item's description included),
// or blank ones starting at the stars it comes with.
export function withPotential(saved: GearDetailsInput | undefined, starMin: number, potential: Potential | null): GearDetailsInput {
  return { ...(saved ?? { stars: starMin, flames: {}, hammers: 0 }), potential };
}

// A hat's skill cooldown, as the Potential page says it (null: not a hat): its seconds, and the minimum it
// must keep (v2.4.1): under it, any roll that keeps it is better; at it, only rolls that keep it count.
export function cooldownText(c: { sec: number; min: number } | null): string | null {
  if (c === null) return null;
  const has = `cooldown ${c.sec} s`;
  if (c.min === 0) return has;
  return c.sec < c.min ? `${has}, under the ${c.min} s it must keep: any roll that keeps ${c.min} s is better` : `${has}, must keep ${c.min} s: only rolls that keep it count`;
}
// A gain as a signed score: +12.3, or −5 when a roll that's needed scores less than the lines now.
export const signedScore = (n: number): string => (n < 0 ? `−${formatScore(-n)}` : `+${formatScore(n)}`);
// What a picked line adds, beside it in the editor: its points; a hat's cooldown line its seconds, which
// add up with the others' before they count (two −1 s lines are 2 s), so its points alone would mislead.
export function lineText(item: Pick<PotentialItem, "points" | "cooldown">, line: string | null): string {
  if (line === null) return "";
  const cd = /^Skill Cooldown -(\d+) sec$/.exec(line);
  if (cd && item.cooldown) return `${cd[1]} s, adds up`;
  return `+${formatScore(item.points[line] ?? 0)}`;
}
