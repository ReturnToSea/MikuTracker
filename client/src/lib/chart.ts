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
export function barDetail(bar: DayBar, today: string): string {
  const date = new Date(`${bar.day}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) + (bar.day === today ? " (today)" : "");
  if (bar.gained === null) return `${date}: no data (not checked that day)`;
  const amount = `${bar.gained.toLocaleString("en-US")} EXP`;
  return bar.covers > 1 ? `${date}: ${amount} over ${bar.covers} days (some days weren't checked)` : `${date}: ${amount}`;
}

// How a chart of `count` bars shows its amounts: above every bar up to 14, smaller up to 30, and
// beyond that only in each bar's tooltip (they don't fit).
export const amountStyle = (count: number): "full" | "small" | "none" => (count <= 14 ? "full" : count <= 30 ? "small" : "none");

// Which days get a date under them: all up to 14 bars, then every 3rd or 10th, counting back from
// today so today always has one.
export function showDate(index: number, count: number): boolean {
  const every = count <= 14 ? 1 : count <= 30 ? 3 : 10;
  return (count - 1 - index) % every === 0;
}

// A share of a level a day: 0.2051 → "+20.5%".
export const fmtLevelPct = (levelPerDay: number) => `${levelPerDay >= 0 ? "+" : ""}${(levelPerDay * 100).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
