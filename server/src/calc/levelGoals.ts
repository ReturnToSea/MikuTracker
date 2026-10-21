import { MAX_LEVEL } from "../gameFigures/expTable";
import { expToReach } from "./exp";

// The levels shown under "Time to level": the next level, and the next multiple of 5
// (207 → 210, 285 → 290), each with the EXP still needed and how many days that takes at a
// daily rate. When the next level is itself the next multiple of 5 (209 → 210), there's one goal.

export interface LevelGoal {
  kind: "next-level" | "next-multiple-of-5";
  target: number;
  remaining: number; // EXP still needed
  days: number | null; // at the daily rate; null when the rate is 0 (never, at this pace)
}

export function nextMultipleOf5(level: number): number {
  return Math.min(MAX_LEVEL, Math.floor(level / 5) * 5 + 5);
}

export function levelGoals(level: number, exp: number, expPerDay: number): LevelGoal[] {
  if (!(expPerDay >= 0)) throw new RangeError(`EXP per day can't be negative (got ${expPerDay})`);
  if (level >= MAX_LEVEL) return [];
  const goal = (kind: LevelGoal["kind"], target: number): LevelGoal => {
    const remaining = expToReach(level, exp, target);
    return { kind, target, remaining, days: expPerDay > 0 ? remaining / expPerDay : null };
  };
  const goals = [goal("next-level", level + 1)];
  const five = nextMultipleOf5(level);
  if (five > level + 1) goals.push(goal("next-multiple-of-5", five));
  return goals;
}
