import { dailyBars, type DayBar, RANGES, type RangeStats, rangeStats } from "../calc/dailyGains";
import { type LevelGoal, levelGoals } from "../calc/levelGoals";
import { utcDay } from "../calc/utcDays";
import { db } from "../db";
import { HttpError } from "../http";

// Everything the character view shows below the character: EXP per UTC day for the last 90 days
// (today included), and for the last 7, 14, 30 and 90 days the EXP gained, the daily average, the
// share of a level gained a day, and the time to the next level and the next multiple of 5 at
// that average.
export interface ProgressView {
  today: string; // the current UTC day
  bars: DayBar[];
  ranges: { days: number; stats: RangeStats | null; goals: LevelGoal[] }[];
}

export async function characterProgress(ownerId: string, id: number): Promise<ProgressView> {
  const c = await db().character.findFirst({ where: { id, ownerId } });
  if (!c) throw new HttpError(404, "Not found");
  const snapshots = await db().snapshot.findMany({ where: { characterId: id }, select: { day: true, totalExp: true, gained: true, capturedAt: true } });
  // A character that hasn't been checked since it was added has nothing to compare yet: its only
  // snapshot says 0 gained, which would read as "no EXP today".
  const checked = snapshots.some((s) => s.capturedAt > c.addedAt);
  const points = snapshots.filter(() => checked).map((s) => ({ day: s.day, totalExp: Number(s.totalExp), gained: Number(s.gained) }));
  const today = utcDay(new Date());
  return {
    today,
    bars: dailyBars(points, today),
    ranges: RANGES.map((days) => {
      const stats = rangeStats(points, today, days);
      return { days, stats, goals: levelGoals(c.level, Number(c.exp), Math.max(0, stats?.average ?? 0)) };
    }),
  };
}
