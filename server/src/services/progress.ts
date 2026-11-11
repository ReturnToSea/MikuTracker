import { byHandWorld } from "@miku/shared";
import { dailyBars, type DayBar, type LevelPoint, levelPoints, RANGES, type RangeStats, rangeStats } from "../calc/dailyGains";
import { type LevelGoal, levelGoals } from "../calc/levelGoals";
import { type TypedDay, typedLevels } from "../calc/typedLevels";
import { utcDay } from "../calc/utcDays";
import { db } from "../db";
import { ownCharacter } from "./characters";
import { HttpError } from "../http";

// Everything the character view shows below the character: EXP per UTC day for the last 90 days
// (today included), the level on each checked day of them, and for the last 7, 14, 30 and 90 days the EXP gained, the daily average, the
// share of a level gained a day, and the time to the next level and the next multiple of 5 at
// that average.
export interface ProgressView {
  today: string; // the current UTC day
  bars: DayBar[];
  levels: LevelPoint[]; // the checked days among the bars' days
  ranges: { days: number; stats: RangeStats | null; goals: LevelGoal[] }[];
  typed: TypedDay[] | null; // a character added by hand's levels as typed (its only history: no EXP); null otherwise
}

export async function characterProgress(ownerId: string, id: number): Promise<ProgressView> {
  const c = await ownCharacter(ownerId, id);
  const snapshots = await db().snapshot.findMany({ where: { characterId: id }, select: { day: true, level: true, totalExp: true, gained: true, capturedAt: true } });
  const byHand = byHandWorld(c.worldId);
  // A character that hasn't been checked since it was added has nothing to compare yet: its only
  // snapshot says 0 gained, which would read as "no EXP today". One added by hand never has EXP.
  const checked = !byHand && snapshots.some((s) => s.capturedAt > c.addedAt);
  const points = snapshots.filter(() => checked).map((s) => ({ day: s.day, totalExp: Number(s.totalExp), gained: Number(s.gained) }));
  const today = utcDay(new Date());
  return {
    today,
    bars: dailyBars(points, today),
    levels: levelPoints(points, today),
    ranges: RANGES.map((days) => {
      const stats = rangeStats(points, today, days);
      return { days, stats, goals: levelGoals(c.level, Number(c.exp), Math.max(0, stats?.average ?? 0)) };
    }),
    typed: byHand ? typedLevels(snapshots, today) : null,
  };
}
