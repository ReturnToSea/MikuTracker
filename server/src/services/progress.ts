import { dailyBars, type DayBar, expStats, type ExpStats } from "../calc/dailyGains";
import { type LevelGoal, levelGoals } from "../calc/levelGoals";
import { utcDay } from "../calc/utcDays";
import { db } from "../db";
import { HttpError } from "../http";

// Everything the character view shows below the character: EXP per UTC day for the last 14
// finished days, the 7-day total, daily average and best day, and the time to the next level and
// the next multiple of 5 at that average.
export interface ProgressView {
  today: string; // the current UTC day (not finished, so not a bar)
  bars: DayBar[];
  stats: ExpStats;
  goals: LevelGoal[];
}

export async function characterProgress(ownerId: string, id: number): Promise<ProgressView> {
  const c = await db().character.findFirst({ where: { id, ownerId } });
  if (!c) throw new HttpError(404, "Not found");
  const snapshots = await db().snapshot.findMany({ where: { characterId: id }, select: { day: true, totalExp: true } });
  const points = snapshots.map((s) => ({ day: s.day, totalExp: Number(s.totalExp) }));
  const today = utcDay(new Date());
  const stats = expStats(points, today);
  return { today, bars: dailyBars(points, today), stats, goals: levelGoals(c.level, Number(c.exp), stats.average ?? 0) };
}
