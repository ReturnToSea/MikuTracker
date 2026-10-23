// Boss weeks and months, and what a crystal pays. Weekly bosses reset every Thursday at 00:00 UTC
// and Black Mage on the 1st of each month at 00:00 UTC (sources in gameFigures/bosses.ts).
import { HEROIC_MULTIPLIER } from "../gameFigures/bosses";
import { addUtcDays, startOfUtcDay, utcDay } from "./utcDays";

const THURSDAY = 4; // getUTCDay(): 0 is Sunday

// The boss week a moment falls in, named by its first day (a Thursday): "2026-10-15".
export function bossWeek(moment: Date): string {
  const day = utcDay(moment);
  return addUtcDays(day, -((moment.getUTCDay() - THURSDAY + 7) % 7));
}

// When the week after `week` starts: the next weekly reset.
export const weeklyReset = (week: string): Date => startOfUtcDay(addUtcDays(week, 7));

// The boss month a moment falls in: "2026-10".
export const bossMonth = (moment: Date): string => utcDay(moment).slice(0, 7);

// When the month after `month` starts: the next monthly reset.
export function monthlyReset(month: string): Date {
  const [year, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, m, 1)); // Date.UTC's months count from 0, so `m` is the next one
}

// What one person gets for a crystal on a Heroic world: the price ×5, split equally, rounded down.
export const mesoPerPerson = (price: number, partySize: number): number => Math.floor((price * HEROIC_MULTIPLIER) / partySize);
