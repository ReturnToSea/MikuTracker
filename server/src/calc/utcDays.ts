// MapleStory's days run on UTC: the daily reset is at 00:00 UTC, so "EXP per day" means per
// UTC day, whatever the computer's own time zone is. Days are written "YYYY-MM-DD".

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

// The UTC day a moment falls in.
export function utcDay(moment: Date): string {
  return moment.toISOString().slice(0, 10);
}

// 00:00 UTC at the start of a day.
export function startOfUtcDay(day: string): Date {
  const m = DAY.exec(day);
  const start = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
  if (!start || utcDay(start) !== day) throw new RangeError(`Not a calendar day: "${day}"`);
  return start;
}

// The next 00:00 UTC strictly after a moment (exactly at midnight, that's the following one).
export function nextUtcMidnight(moment: Date): Date {
  return new Date(startOfUtcDay(utcDay(moment)).getTime() + DAY_MS);
}

// The day `n` days later (or earlier, for negative n).
export function addUtcDays(day: string, n: number): string {
  return utcDay(new Date(startOfUtcDay(day).getTime() + n * DAY_MS));
}

// The week a moment falls in, for weeks that start on `weekday` (0 Sunday … 6 Saturday) at 00:00
// UTC, named by their first day: weeks starting Thursday are named "2026-10-15", "2026-10-22", …
export function weekStarting(moment: Date, weekday: number): string {
  return addUtcDays(utcDay(moment), -((moment.getUTCDay() - weekday + 7) % 7));
}

// When the week after `week` (named by its first day) starts, at 00:00 UTC.
export const nextWeek = (week: string): Date => startOfUtcDay(addUtcDays(week, 7));
