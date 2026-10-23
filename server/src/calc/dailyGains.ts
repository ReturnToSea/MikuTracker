import { MAX_LEVEL } from "../gameFigures/expTable";
import { fromTotal, progress } from "./exp";
import { addUtcDays, startOfUtcDay } from "./utcDays";

// EXP gained per UTC day, from a character's snapshots (one per UTC day, holding that day's latest
// total EXP and `gained`, the EXP gained that day: each check adds the change since the check
// before). Today counts too: its bar grows with each check.
//
// Days without a snapshot weren't checked (the Mac was off): they show as "no data", and the EXP
// gained over them lands on the next day that has data, marked with how many days it covers.

export interface SnapshotPoint {
  day: string; // "YYYY-MM-DD" (UTC)
  totalExp: number;
  gained: number;
}

export interface DayBar {
  day: string;
  gained: number | null; // null: no data (not checked that day)
  covers: number; // how many days `gained` spans: 1 normally, more right after days without data; 0 with no data
}

// A checked day's level, with progress through it (285 at 86.91% is 285.8691), and the whole
// levels reached since the check before (a level-up on a day that wasn't checked shows on the
// next checked day, which then covers more than one day).
export interface LevelPoint {
  day: string;
  level: number;
  reached: number[];
  covers: number;
}

export interface RangeStats {
  total: number; // EXP gained over the range
  average: number; // EXP per day
  levelPerDay: number; // levels per day: 0.205 is 20.5% of a level a day
}

export const RANGES = [7, 14, 30, 90] as const;
export const CHART_DAYS = 90; // the most bars the chart shows
const DAY_MS = 24 * 60 * 60 * 1000;

export const daysBetween = (from: string, to: string) => Math.round((startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime()) / DAY_MS);

// Where a character's first day started: its total minus what it gained that day. A record that
// claims more gained than its total is inconsistent, and its gain is ignored (one bad record mustn't
// break the whole EXP section, nor invent level-ups).
const startOf = (p: SnapshotPoint) => (p.gained > p.totalExp ? p.totalExp : p.totalExp - p.gained);

// The points in day order (whatever order they arrive in).
const inDayOrder = (points: SnapshotPoint[]) => [...points].sort((a, b) => a.day.localeCompare(b.day));

// One bar per UTC day, the `count` days ending today, oldest first.
export function dailyBars(unordered: SnapshotPoint[], today: string, count = CHART_DAYS): DayBar[] {
  const points = inDayOrder(unordered);
  const bars: DayBar[] = [];
  for (let back = count - 1; back >= 0; back--) {
    const day = addUtcDays(today, -back);
    const at = points.findIndex((p) => p.day === day);
    if (at === -1) bars.push({ day, gained: null, covers: 0 });
    else bars.push({ day, gained: points[at]!.gained, covers: at === 0 ? 1 : daysBetween(points[at - 1]!.day, day) });
  }
  return bars;
}

// Level with progress through it: 285 at 86.91% is 285.8691. Level 300 is just 300 (progress()
// counts it as 100% through, which would make it 301).
export function levelAt(total: number): number {
  const { level, exp } = fromTotal(total);
  return level === MAX_LEVEL ? MAX_LEVEL : level + progress(level, exp);
}

// The last `days` days, today included. The range starts from the total at the end of the day
// before it (from the last snapshot on or before then, even if earlier days weren't checked), or,
// for a character first tracked within the range, from where its first day started. Null with no
// snapshot in the range.
export function rangeStats(unordered: SnapshotPoint[], today: string, days: number): RangeStats | null {
  const points = inDayOrder(unordered);
  const first = addUtcDays(today, -(days - 1));
  const end = points.filter((p) => p.day <= today).at(-1);
  if (!end || end.day < first) return null;
  const before = points.filter((p) => p.day < first).at(-1);
  const start = before ?? points[0]!;
  const startTotal = before ? before.totalExp : startOf(start);
  const span = daysBetween(start.day, today) + (before ? 0 : 1);
  const total = end.totalExp - startTotal;
  return { total, average: total / span, levelPerDay: (levelAt(end.totalExp) - levelAt(startTotal)) / span };
}

// The level on each checked day of the `count` days ending today, oldest first.
export function levelPoints(unordered: SnapshotPoint[], today: string, count = CHART_DAYS): LevelPoint[] {
  const points = inDayOrder(unordered).filter((p) => p.day <= today);
  const first = addUtcDays(today, -(count - 1));
  return points.flatMap((p, i) => {
    if (p.day < first) return [];
    const before = points[i - 1]; // none for the first
    const level = levelAt(p.totalExp);
    const from = Math.floor(levelAt(before ? before.totalExp : startOf(p)));
    const reached = Array.from({ length: Math.max(0, Math.floor(level) - from) }, (_, k) => from + 1 + k);
    return [{ day: p.day, level, reached, covers: before ? daysBetween(before.day, p.day) : 1 }];
  });
}
