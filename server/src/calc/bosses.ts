// Boss weeks and months, and what a crystal pays. Weekly bosses reset every Thursday at 00:00 UTC
// and Black Mage on the 1st of each month at 00:00 UTC (sources in gameFigures/bosses.ts).
import { WEEKLY_RESET_DAY } from "@miku/shared";
import { HEROIC_MULTIPLIER } from "../gameFigures/bosses";
import { nextWeek, utcDay, weekStarting } from "./utcDays";

// The boss week a moment falls in, named by its first day (a Thursday): "2026-10-15".
export const bossWeek = (moment: Date): string => weekStarting(moment, WEEKLY_RESET_DAY);

// When the week after `week` starts: the next weekly reset.
export const weeklyReset = nextWeek;

// The boss month a moment falls in: "2026-10".
export const bossMonth = (moment: Date): string => utcDay(moment).slice(0, 7);

// When the month after `month` starts: the next monthly reset.
export function monthlyReset(month: string): Date {
  const [year, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, m, 1)); // Date.UTC's months count from 0, so `m` is the next one
}

// What one person gets for a crystal on a Heroic world: the price ×5, split equally, rounded down.
export const mesoPerPerson = (price: number, partySize: number): number => Math.floor((price * HEROIC_MULTIPLIER) / partySize);
