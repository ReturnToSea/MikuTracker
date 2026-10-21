// How numbers, durations and dates are shown. Plain functions, tested on their own.

// EXP to 3 significant digits: 5.12B, 20.7B, 137B, 1.04T. Below 1,000 it's the plain number.
const UNITS: [size: number, unit: string][] = [
  [1e3, "K"],
  [1e6, "M"],
  [1e9, "B"],
  [1e12, "T"],
  [1e15, "Q"],
];
export function fmtExp(n: number): string {
  for (let i = UNITS.length - 1; i >= 0; i--) {
    const [size, unit] = UNITS[i]!;
    if (n < size) continue;
    // 999.6B rounds to "1.00e+3"B: show it in the next unit (1.00T) instead.
    if (Number((n / size).toPrecision(3)) >= 1000) {
      const [biggerSize, biggerUnit] = UNITS[i + 1]!;
      return (n / biggerSize).toPrecision(3) + biggerUnit;
    }
    return (n / size).toPrecision(3) + unit;
  }
  return String(Math.round(n));
}

// Whole numbers with thousands separators: 2,207,026,470.
export const fmtInt = (n: number) => n.toLocaleString("en-US");

// The change from one value to the next as a percentage, e.g. "+12.0%".
export function fmtChange(before: number, after: number): string {
  const change = (after / before - 1) * 100;
  return `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
}

// A length of time in days, shown in the unit that reads best: "≈ 5 hours", "≈ 4.3 days",
// "≈ 5.6 months", "≈ 2.1 years". Under an hour still shows as "≈ 1 hour".
export function fmtDuration(days: number): string {
  if (days < 1) {
    const hours = Math.max(1, Math.round(days * 24));
    return `≈ ${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  if (days < 60) return `≈ ${days.toFixed(1)} days`;
  if (days < 730) return `≈ ${(days / 30.44).toFixed(1)} months`;
  return `≈ ${(days / 365.25).toFixed(1)} years`;
}

// The date `days` from `now`, in local time: "Sun, Oct 25", with the year when it isn't this year.
export function fmtFutureDate(days: number, now: Date): string {
  const when = new Date(now.getTime() + days * 86_400_000);
  const sameYear = when.getFullYear() === now.getFullYear();
  return when.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

// When something happened, by the UTC day (the game's day) and in local time:
// "today at 08:05 UTC (1:05 AM your time)", "yesterday at …", "Oct 19 at …".
export function fmtWhen(moment: Date, now: Date): string {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000);
  const when = day(moment) === day(now) ? "today" : day(moment) === day(yesterday) ? "yesterday" : moment.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const utc = moment.toISOString().slice(11, 16);
  const local = moment.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${when} at ${utc} UTC (${local} your time)`;
}
