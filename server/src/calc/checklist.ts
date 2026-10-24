// The checklist's periods: a tick belongs to its task's current period, which ends at its reset.
import type { TaskReset } from "@miku/shared";
import { nextUtcMidnight, nextWeek, utcDay, weekStarting } from "./utcDays";

// The period a task's tick belongs to at a moment, and when it ends: the UTC day ("2026-10-23")
// for a daily task, the week from its reset day ("week-2026-10-19", prefixed so a weekly period
// can never be mistaken for a day's), and "once" for a one-off, which never ends.
export function taskPeriod(task: { reset: TaskReset; weekday: number | null }, moment: Date): { period: string; resetsAt: Date | null } {
  if (task.reset === "daily") return { period: utcDay(moment), resetsAt: nextUtcMidnight(moment) };
  if (task.reset === "weekly") {
    const week = weekStarting(moment, task.weekday!);
    return { period: `week-${week}`, resetsAt: nextWeek(week) };
  }
  return { period: "once", resetsAt: null };
}
