import { addUtcDays, startOfUtcDay } from "./utcDays";

// EXP gained per UTC day, from a character's snapshots (one per UTC day, holding that day's latest
// total EXP). A day's gain is its total minus the total of the snapshot before it, so level-ups
// need no special handling.
//
// Days without a snapshot weren't checked (the Mac was off): they show as "no data", and the EXP
// gained over them lands on the next day that has data, marked with how many days it covers.

export interface SnapshotPoint {
  day: string; // "YYYY-MM-DD" (UTC)
  totalExp: number;
}

export interface DayBar {
  day: string;
  gained: number | null; // null: no data (not checked that day, or the first day tracked)
  covers: number; // how many days `gained` spans: 1 normally, more right after days without data; 0 with no data
}

export interface ExpStats {
  last7: number | null; // EXP over the last 7 finished days (or since tracking began)
  average: number | null; // EXP per day over the last 14 finished days (or the days tracked, if fewer)
  best: { day: string; gained: number } | null; // the most in a single day, among the last 14
}

export const CHART_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export const daysBetween = (from: string, to: string) => Math.round((startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime()) / DAY_MS);

// The snapshot holding the total at the end of `day`: the latest one on or before it.
function atEndOf(points: SnapshotPoint[], day: string): SnapshotPoint | undefined {
  return points.filter((p) => p.day <= day).at(-1);
}

// The points in day order (whatever order they arrive in).
const inDayOrder = (points: SnapshotPoint[]) => [...points].sort((a, b) => a.day.localeCompare(b.day));

// One bar per finished UTC day, the `count` days before `today`, oldest first.
export function dailyBars(unordered: SnapshotPoint[], today: string, count = CHART_DAYS): DayBar[] {
  const points = inDayOrder(unordered);
  const bars: DayBar[] = [];
  for (let back = count; back >= 1; back--) {
    const day = addUtcDays(today, -back);
    const here = points.find((p) => p.day === day);
    const before = atEndOf(points, addUtcDays(day, -1));
    bars.push(here && before ? { day, gained: here.totalExp - before.totalExp, covers: daysBetween(before.day, day) } : { day, gained: null, covers: 0 });
  }
  return bars;
}

// EXP gained from the end of the day `days` before yesterday to the end of yesterday, or since
// tracking began if that's later, with how many days that spans. Null without two snapshots to compare.
function gainedOver(points: SnapshotPoint[], today: string, days: number): { gained: number; span: number } | null {
  const end = atEndOf(points, addUtcDays(today, -1));
  const start = atEndOf(points, addUtcDays(today, -1 - days)) ?? points[0];
  if (!end || !start || start.day >= end.day) return null;
  return { gained: end.totalExp - start.totalExp, span: daysBetween(start.day, end.day) };
}

export function expStats(unordered: SnapshotPoint[], today: string): ExpStats {
  const points = inDayOrder(unordered);
  const week = gainedOver(points, today, 7);
  const fortnight = gainedOver(points, today, CHART_DAYS);
  let best: ExpStats["best"] = null;
  for (const bar of dailyBars(points, today)) {
    if (bar.covers === 1 && bar.gained! > (best?.gained ?? 0)) best = { day: bar.day, gained: bar.gained! };
  }
  return { last7: week?.gained ?? null, average: fortnight ? fortnight.gained / fortnight.span : null, best };
}
