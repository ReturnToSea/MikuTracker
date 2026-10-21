import type { DayBar } from "../api/types";
import { fmtExp } from "./format";

// The daily EXP chart's numbers, as plain functions.

// A round top for the scale, at or above the biggest value: 1, 2, 2.5 or 5 times a power of 10.
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 2.5, 5, 10].map((m) => m * power).find((v) => v >= value)!;
}

// The scale's lines: 0, a quarter, half, three quarters and the top.
export const ticks = (max: number) => [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);

// What's written above a bar: the amount ("16.5B"), "0", or nothing for a day without data.
export const barLabel = (bar: DayBar) => (bar.gained === null ? "" : fmtExp(bar.gained));

// "Oct 7": a bar's day, as the UTC calendar day it is.
export const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// What the tooltip says about a bar.
export function barDetail(bar: DayBar): string {
  const date = new Date(`${bar.day}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  if (bar.gained === null) return `${date}: no data (not checked that day)`;
  const amount = `${bar.gained.toLocaleString("en-US")} EXP`;
  return bar.covers > 1 ? `${date}: ${amount} over ${bar.covers} days (some days weren't checked)` : `${date}: ${amount}`;
}
