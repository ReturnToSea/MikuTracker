import { describe, expect, it } from "vitest";
import { CHART_DAYS, dailyBars, daysBetween, expStats, type SnapshotPoint } from "./dailyGains";
import { addUtcDays } from "./utcDays";

const TODAY = "2026-10-21";
// A history: totals at the end of the given days.
const history = (entries: [string, number][]): SnapshotPoint[] => entries.map(([day, totalExp]) => ({ day, totalExp }));

describe("daysBetween", () => {
  it("counts whole UTC days, across months and years", () => {
    expect(daysBetween("2026-10-20", "2026-10-21")).toBe(1);
    expect(daysBetween("2026-10-21", "2026-10-21")).toBe(0);
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(daysBetween("2026-11-01", "2026-11-02")).toBe(1); // California's clocks go back that day; UTC days don't change length
  });
});

describe("dailyBars", () => {
  it("one bar per finished UTC day, the 14 before today, oldest first (today isn't finished)", () => {
    const bars = dailyBars([], TODAY);
    expect(bars).toHaveLength(CHART_DAYS);
    expect([bars[0]!.day, bars.at(-1)!.day]).toEqual(["2026-10-07", "2026-10-20"]);
    expect(bars.every((b) => b.gained === null && b.covers === 0)).toBe(true);
  });

  it("each day's EXP is its total minus the day before's (by hand)", () => {
    const bars = dailyBars(history([["2026-10-18", 1_000], ["2026-10-19", 1_500], ["2026-10-20", 1_500]]), TODAY);
    expect(bars.slice(-3)).toEqual([
      { day: "2026-10-18", gained: null, covers: 0 }, // the first day tracked: nothing before it to compare with
      { day: "2026-10-19", gained: 500, covers: 1 },
      { day: "2026-10-20", gained: 0, covers: 1 }, // checked, no EXP: a real 0, not "no data"
    ]);
  });

  it("days without a snapshot are 'no data', and their EXP lands on the next day with data", () => {
    const bars = dailyBars(history([["2026-10-15", 100], ["2026-10-19", 4_100]]), TODAY);
    expect(bars.slice(-6)).toEqual([
      { day: "2026-10-15", gained: null, covers: 0 },
      { day: "2026-10-16", gained: null, covers: 0 },
      { day: "2026-10-17", gained: null, covers: 0 },
      { day: "2026-10-18", gained: null, covers: 0 },
      { day: "2026-10-19", gained: 4_000, covers: 4 }, // the 16th–19th together
      { day: "2026-10-20", gained: null, covers: 0 }, // not checked yesterday
    ]);
  });

  it("a snapshot from before the 14 days counts as the starting point", () => {
    const bars = dailyBars(history([["2026-09-30", 10], ["2026-10-07", 30]]), TODAY);
    expect(bars[0]).toEqual({ day: "2026-10-07", gained: 20, covers: 7 });
  });

  it("today's snapshot is never a bar (today isn't finished)", () => {
    const bars = dailyBars(history([["2026-10-20", 10], ["2026-10-21", 99]]), TODAY);
    expect(bars.map((b) => b.day)).not.toContain(TODAY);
    expect(bars.at(-1)).toEqual({ day: "2026-10-20", gained: null, covers: 0 });
  });

  it("works whatever order the snapshots arrive in", () => {
    const sorted = history([["2026-10-17", 0], ["2026-10-18", 100], ["2026-10-19", 300], ["2026-10-20", 600]]);
    const shuffled = [sorted[2]!, sorted[0]!, sorted[3]!, sorted[1]!];
    expect(dailyBars(shuffled, TODAY)).toEqual(dailyBars(sorted, TODAY));
    expect(dailyBars(shuffled, TODAY).slice(-3).map((b) => b.gained)).toEqual([100, 200, 300]);
    expect(expStats(shuffled, TODAY)).toEqual({ last7: 600, average: 200, best: { day: "2026-10-20", gained: 300 } });
    expect(shuffled.map((p) => p.day)).toEqual(["2026-10-19", "2026-10-17", "2026-10-20", "2026-10-18"]); // the caller's list isn't changed
  });

  it("a different count of days", () => {
    expect(dailyBars([], TODAY, 3).map((b) => b.day)).toEqual(["2026-10-18", "2026-10-19", "2026-10-20"]);
  });

  it("the gains always add up to the real change in total EXP (simulated histories with missed days)", () => {
    let seed = 7;
    const random = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31);
    for (let trial = 0; trial < 200; trial++) {
      const points: SnapshotPoint[] = [];
      let total = Math.floor(random() * 1e12);
      for (let back = 25; back >= 0; back--) {
        total += Math.floor(random() * 5e9);
        if (random() < 0.6) points.push({ day: addUtcDays(TODAY, -back), totalExp: total }); // ~40% of days missed
      }
      const bars = dailyBars(points, TODAY);
      const withData = bars.filter((b) => b.gained !== null);
      if (withData.length === 0) continue;
      const sum = withData.reduce((s, b) => s + b.gained!, 0);
      const first = withData[0]!;
      const startDay = addUtcDays(first.day, -first.covers);
      const start = points.find((p) => p.day === startDay)!.totalExp;
      const end = points.find((p) => p.day === withData.at(-1)!.day)!.totalExp;
      expect(sum).toBe(end - start);
      // and every day in a combined bar's span (but the last) is "no data"
      for (const b of withData) {
        for (let d = 1; d < b.covers; d++) {
          const skipped = bars.find((x) => x.day === addUtcDays(b.day, -d));
          if (skipped) expect(skipped.gained).toBeNull();
        }
      }
    }
  });
});

describe("expStats", () => {
  // 15 days of steady play, 1,000 a day, ending yesterday (and a snapshot today, which doesn't count).
  const steady = history(Array.from({ length: 16 }, (_, i) => [addUtcDays(TODAY, i - 15), i * 1_000] as [string, number]));

  it("7-day total, daily average and best day (by hand)", () => {
    const points = steady.map((p) => (p.day === "2026-10-17" ? { ...p, totalExp: p.totalExp + 4_000 } : p.day > "2026-10-17" ? { ...p, totalExp: p.totalExp + 4_000 } : p));
    // the 17th gained 5,000 instead of 1,000
    expect(expStats(points, TODAY)).toEqual({ last7: 11_000, average: 18_000 / 14, best: { day: "2026-10-17", gained: 5_000 } });
  });

  it("with less history than the windows, uses the days tracked", () => {
    const points = history([["2026-10-17", 0], ["2026-10-18", 600], ["2026-10-20", 1_500]]);
    expect(expStats(points, TODAY)).toEqual({ last7: 1_500, average: 500, best: { day: "2026-10-18", gained: 600 } }); // 1,500 over 3 days
  });

  it("a combined bar (after missed days) is never the best single day", () => {
    const gap = history([["2026-10-16", 0], ["2026-10-19", 9_000], ["2026-10-20", 9_100]]);
    expect(expStats(gap, TODAY).best).toEqual({ day: "2026-10-20", gained: 100 }); // not the 9,000 spread over three days
  });

  it("days without EXP are never a best day; a tie keeps the earlier day", () => {
    expect(expStats(history([["2026-10-18", 5], ["2026-10-19", 5], ["2026-10-20", 5]]), TODAY).best).toBeNull();
    expect(expStats(history([["2026-10-18", 0], ["2026-10-19", 7], ["2026-10-20", 14]]), TODAY).best).toEqual({ day: "2026-10-19", gained: 7 });
  });

  it("without two snapshots to compare, there's nothing to say", () => {
    expect(expStats([], TODAY)).toEqual({ last7: null, average: null, best: null });
    expect(expStats(history([["2026-10-20", 5]]), TODAY)).toEqual({ last7: null, average: null, best: null });
    expect(expStats(history([["2026-10-21", 5], ["2026-10-21", 9]]), TODAY)).toEqual({ last7: null, average: null, best: null }); // only today
  });

  it("with no snapshot in the last 14 days, there's no average (nothing is known about them)", () => {
    const points = history([["2026-09-01", 0], ["2026-10-01", 3_000]]);
    expect(expStats(points, TODAY)).toEqual({ last7: null, average: null, best: null });
  });

  it("windows: the 7 days start from the end of the 8th day back", () => {
    const points = history([["2026-10-12", 0], ["2026-10-13", 10], ["2026-10-20", 80]]);
    expect(expStats(points, TODAY).last7).toBe(70); // from the end of the 13th to the end of the 20th
  });
});
