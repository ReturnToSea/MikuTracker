import { CHART_DAYS } from "./dailyGains";
import { addUtcDays } from "./utcDays";

// A character added by hand (Challenger) has no EXP: its level graph is the levels typed, one per UTC day
// at most (v4.2.0). Pure.

export interface TypedDay {
  day: string;
  level: number; // the last level typed on or before this day
  typed: boolean; // a level was typed this day
}

// Every day of the last `count` (today included) from the first typed one, each with the level typed
// then or carried over from before. A day before the first typed level has none, so isn't listed.
export function typedLevels(points: readonly { day: string; level: number }[], today: string, count = CHART_DAYS): TypedDay[] {
  const typed = new Map(points.map((p) => [p.day, p.level]));
  const first = addUtcDays(today, -(count - 1));
  // the level carried into the first day: the last typed before it
  // Stryker disable next-line EqualityOperator: one typed on the first day itself is that day's level either way (the loop sets it)
  let level = [...typed].filter(([day]) => day < first).sort(([a], [b]) => a.localeCompare(b)).at(-1)?.[1];
  const days: TypedDay[] = [];
  for (let day = first; day <= today; day = addUtcDays(day, 1)) {
    if (typed.has(day)) level = typed.get(day);
    if (level !== undefined) days.push({ day, level, typed: typed.has(day) });
  }
  return days;
}
