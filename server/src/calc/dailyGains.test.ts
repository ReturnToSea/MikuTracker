import { describe, expect, it } from "vitest";
import { CHART_DAYS, dailyBars, daysBetween, levelAt, levelPoints, RANGES, rangeStats, type SnapshotPoint } from "./dailyGains";
import { expToNext, totalExp } from "./exp";
import { addUtcDays } from "./utcDays";

const TODAY = "2026-10-21";
// A history: the total and the EXP gained on each given day.
const history = (entries: [string, number, number][]): SnapshotPoint[] => entries.map(([day, totalExp, gained]) => ({ day, totalExp, gained }));

describe("daysBetween", () => {
  it("counts whole UTC days, across months and years", () => {
    expect(daysBetween("2026-10-20", "2026-10-21")).toBe(1);
    expect(daysBetween("2026-10-21", "2026-10-21")).toBe(0);
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(daysBetween("2026-11-01", "2026-11-02")).toBe(1); // California's clocks go back that day; UTC days don't change length
  });
});

describe("dailyBars", () => {
  it("one bar per UTC day, the 90 ending today, oldest first", () => {
    const bars = dailyBars([], TODAY);
    expect([bars.length, CHART_DAYS]).toEqual([90, 90]);
    expect([bars[0]!.day, bars.at(-1)!.day]).toEqual(["2026-07-24", "2026-10-21"]);
    expect(bars.every((b) => b.gained === null && b.covers === 0)).toBe(true);
  });

  it("each day's bar is the EXP gained that day, today's included (so far)", () => {
    const bars = dailyBars(history([["2026-10-19", 1_000, 300], ["2026-10-20", 1_500, 500], ["2026-10-21", 1_500, 0]]), TODAY);
    expect(bars.slice(-3)).toEqual([
      { day: "2026-10-19", gained: 300, covers: 1 }, // the first day tracked: the EXP since the first check
      { day: "2026-10-20", gained: 500, covers: 1 },
      { day: "2026-10-21", gained: 0, covers: 1 }, // checked, no EXP: a real 0, not "no data"
    ]);
  });

  it("days without a snapshot are 'no data', and the next day with data says how many days its EXP covers", () => {
    const bars = dailyBars(history([["2026-10-15", 100, 0], ["2026-10-19", 4_100, 4_000]]), TODAY);
    expect(bars.slice(-7)).toEqual([
      { day: "2026-10-15", gained: 0, covers: 1 },
      { day: "2026-10-16", gained: null, covers: 0 },
      { day: "2026-10-17", gained: null, covers: 0 },
      { day: "2026-10-18", gained: null, covers: 0 },
      { day: "2026-10-19", gained: 4_000, covers: 4 }, // the 16th–19th together
      { day: "2026-10-20", gained: null, covers: 0 },
      { day: "2026-10-21", gained: null, covers: 0 }, // not checked yet today
    ]);
  });

  it("a snapshot from before the bars counts for the first bar's span", () => {
    const bars = dailyBars(history([["2026-09-30", 10, 0], ["2026-10-15", 30, 20]]), TODAY, 7);
    expect(bars[0]).toEqual({ day: "2026-10-15", gained: 20, covers: 15 });
  });

  it("a snapshot after today (a clock that went back) isn't a bar", () => {
    expect(dailyBars(history([["2026-10-22", 5, 5]]), TODAY).at(-1)).toEqual({ day: TODAY, gained: null, covers: 0 });
  });

  it("works whatever order the snapshots arrive in, without changing the caller's list", () => {
    const sorted = history([["2026-10-18", 0, 0], ["2026-10-19", 100, 100], ["2026-10-21", 600, 500]]);
    const shuffled = [sorted[2]!, sorted[0]!, sorted[1]!];
    expect(dailyBars(shuffled, TODAY)).toEqual(dailyBars(sorted, TODAY));
    expect(dailyBars(shuffled, TODAY).slice(-3).map((b) => [b.gained, b.covers])).toEqual([[100, 1], [null, 0], [500, 2]]);
    expect(rangeStats(shuffled, TODAY, 7)).toEqual(rangeStats(sorted, TODAY, 7));
    expect(shuffled.map((p) => p.day)).toEqual(["2026-10-21", "2026-10-18", "2026-10-19"]);
  });

  it("a different count of days", () => {
    expect(dailyBars([], TODAY, 3).map((b) => b.day)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21"]);
  });

  it("the bars always add up to the real change in total EXP (simulated histories with missed days)", () => {
    let seed = 7;
    const random = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31);
    for (let trial = 0; trial < 200; trial++) {
      // a character checked on ~60% of days, its EXP growing every day
      const points: SnapshotPoint[] = [];
      let total = Math.floor(random() * 1e12);
      let lastChecked: number | null = null;
      for (let back = 25; back >= 0; back--) {
        total += Math.floor(random() * 5e9);
        if (random() < 0.6) {
          points.push({ day: addUtcDays(TODAY, -back), totalExp: total, gained: lastChecked === null ? 0 : total - lastChecked });
          lastChecked = total;
        }
      }
      const bars = dailyBars(points, TODAY, 26);
      const withData = bars.filter((b) => b.gained !== null);
      const sum = withData.reduce((s, b) => s + b.gained!, 0);
      expect(sum).toBe(points.length ? points.at(-1)!.totalExp - points[0]!.totalExp : 0);
      // and every day inside a combined bar's span is "no data"
      for (const b of withData) {
        for (let d = 1; d < b.covers; d++) expect(bars.find((x) => x.day === addUtcDays(b.day, -d))!.gained).toBeNull();
      }
    }
  });
});

describe("rangeStats", () => {
  // 100 days of steady play, 1,000 a day, ending today.
  const steady = history(Array.from({ length: 100 }, (_, i) => [addUtcDays(TODAY, i - 99), 1e9 + i * 1_000, i === 0 ? 0 : 1_000] as [string, number, number]));

  it("the ranges are 7, 14, 30 and 90 days", () => {
    expect(RANGES).toEqual([7, 14, 30, 90]);
  });

  it("each range counts today and the days before it, from the end of the day before the range", () => {
    for (const days of RANGES) expect([days, rangeStats(steady, TODAY, days)]).toEqual([days, { total: days * 1_000, average: 1_000, levelPerDay: expect.any(Number) }]);
  });

  it("by hand: the 7 days are the 15th to the 21st, from the total at the end of the 14th", () => {
    const points = history([["2026-10-14", 500, 0], ["2026-10-15", 600, 100], ["2026-10-20", 1_200, 600], ["2026-10-21", 1_900, 700]]);
    expect(rangeStats(points, TODAY, 7)).toMatchObject({ total: 1_400, average: 200 });
    // the 14th itself only counts in the longer ranges
    expect(rangeStats(points, TODAY, 8)).toMatchObject({ total: 1_400, average: 1_400 / 8 }); // started on the 14th with 0 gained
  });

  it("today counts as a day even before it's over", () => {
    const points = history([["2026-10-20", 1_000, 0], ["2026-10-21", 1_100, 100]]);
    expect(rangeStats(points, TODAY, 7)).toMatchObject({ total: 100, average: 50 }); // the 20th and the 21st
  });

  it("a character first tracked within the range: from where its first day started, over the days since", () => {
    // added on the 19th; by its last check that day it had gained 300
    const points = history([["2026-10-19", 5_300, 300], ["2026-10-21", 6_000, 700]]);
    expect(rangeStats(points, TODAY, 30)).toMatchObject({ total: 1_000, average: 1_000 / 3 }); // the 19th, 20th and 21st
  });

  it("days not checked just before the range: from the last snapshot before it, over the days since then", () => {
    const points = history([["2026-10-10", 0, 0], ["2026-10-18", 900, 900], ["2026-10-21", 1_100, 200]]);
    expect(rangeStats(points, TODAY, 7)).toMatchObject({ total: 1_100, average: 100 }); // 11 days from the end of the 10th
  });

  it("not checked today: up to the last check in the range, still over the days to today", () => {
    const points = history([["2026-10-14", 0, 0], ["2026-10-18", 700, 700]]);
    expect(rangeStats(points, TODAY, 7)).toMatchObject({ total: 700, average: 100 });
  });

  it("nothing to say without a snapshot in the range", () => {
    expect(rangeStats([], TODAY, 7)).toBeNull();
    expect(rangeStats(history([["2026-10-14", 5, 0]]), TODAY, 7)).toBeNull(); // only before it
    expect(rangeStats(history([["2026-10-22", 5, 0]]), TODAY, 7)).toBeNull(); // only after today
    expect(rangeStats(history([["2026-10-14", 5, 0]]), TODAY, 8)).toMatchObject({ total: 0 }); // the 14th is in 8 days
  });

  it("levels a day: progress through levels, across level-ups (by hand)", () => {
    // from level 250 at 0% to level 251 at 50% over 3 days: 1.5 levels, 0.5 a day
    const start = totalExp(250, 0);
    const end = totalExp(251, expToNext(251) / 2);
    const points = history([["2026-10-18", start, 0], ["2026-10-21", end, end - start]]);
    expect(rangeStats(points, TODAY, 3)).toEqual({ total: end - start, average: (end - start) / 3, levelPerDay: 0.5 });
    // a character's first day starts from its total minus what it gained that day
    expect(rangeStats(history([["2026-10-21", end, end - start]]), TODAY, 7)!.levelPerDay).toBe(1.5);
    // reaching level 300: half a level, not one and a half (level 300 isn't "300 and 100%")
    const half = totalExp(299, Math.round(expToNext(299) / 2));
    const max = totalExp(300, 0);
    expect(rangeStats(history([["2026-10-20", half, 0], ["2026-10-21", max, max - half]]), TODAY, 1)!.levelPerDay).toBeCloseTo(0.5, 9);
  });
});

describe("levelPoints", () => {
  const at = (level: number, fraction: number) => totalExp(level, Math.round(expToNext(level) * fraction));
  // Levels to 6 decimals: "25% through" built from whole EXP is a hair off .25.
  const rounded = (points: { level: number }[]) => points.map((p) => ({ ...p, level: Math.round(p.level * 1e6) / 1e6 }));

  it("levelAt: the level with progress through it (by hand)", () => {
    expect(levelAt(totalExp(285, 0))).toBe(285);
    expect(levelAt(at(250, 0.25))).toBeCloseTo(250.25, 9);
    expect(levelAt(at(299, 0.5))).toBeCloseTo(299.5, 9);
    expect(levelAt(totalExp(300, 0))).toBe(300); // not 301
  });

  it("one point per checked day, oldest first, with the levels reached since the check before", () => {
    const points = history([
      ["2026-10-18", at(250, 0.5), 0],
      ["2026-10-19", at(250, 0.75), 1],
      ["2026-10-21", at(252, 0.25), 1], // the 20th wasn't checked: 251 and 252 since the 19th
    ]);
    expect(rounded(levelPoints(points, TODAY))).toEqual([
      { day: "2026-10-18", level: 250.5, reached: [], covers: 1 },
      { day: "2026-10-19", level: 250.75, reached: [], covers: 1 },
      { day: "2026-10-21", level: 252.25, reached: [251, 252], covers: 2 },
    ]);
  });

  it("only the days in range (today included), but a level-up counts from the check before the range", () => {
    const points = history([
      ["2026-10-10", at(250, 0.9), 0],
      ["2026-10-16", at(251, 0.1), 1],
      ["2026-10-22", at(252, 0), 1], // after today (a clock that went back): left out
    ]);
    expect(rounded(levelPoints(points, TODAY, 7))).toEqual([{ day: "2026-10-16", level: 251.1, reached: [251], covers: 6 }]);
    expect(levelPoints(points, TODAY, 3)).toEqual([]);
  });

  it("a character's first day: level-ups from where that day started (its total minus what it gained)", () => {
    const start = at(260, 0.95);
    const end = at(261, 0.05);
    expect(rounded(levelPoints(history([["2026-10-21", end, end - start]]), TODAY))).toEqual([{ day: "2026-10-21", level: 261.05, reached: [261], covers: 1 }]);
  });

  it("several levels in one day, and none at all", () => {
    const points = history([["2026-10-20", at(200, 0.5), 0], ["2026-10-21", at(203, 0.5), 1], ["2026-10-22", at(203, 0.6), 1]]);
    expect(levelPoints(points, "2026-10-22").map((p) => p.reached)).toEqual([[], [201, 202, 203], []]);
  });

  it("works whatever order the snapshots arrive in", () => {
    const sorted = history([["2026-10-19", at(250, 0.9), 0], ["2026-10-20", at(251, 0.1), 1]]);
    expect(levelPoints([sorted[1]!, sorted[0]!], TODAY)).toEqual(levelPoints(sorted, TODAY));
  });

  it("a first day that claims more gained than its total (inconsistent data): its gain is ignored, not an error", () => {
    const points = history([["2026-10-21", 5_000, 9_000]]);
    expect(levelPoints(points, TODAY)).toEqual([{ day: "2026-10-21", level: levelAt(5_000), reached: [], covers: 1 }]);
    expect(rangeStats(points, TODAY, 7)).toMatchObject({ total: 0 });
    // exactly its total gained (from level 1 with 0 EXP) is still believed
    expect(rangeStats(history([["2026-10-21", 5_000, 5_000]]), TODAY, 7)).toMatchObject({ total: 5_000 });
  });

  it("90 days by default", () => {
    const points = history([["2026-07-23", at(250, 0), 0], ["2026-07-24", at(250, 0.1), 1]]);
    expect(levelPoints(points, TODAY).map((p) => p.day)).toEqual(["2026-07-24"]);
  });
});
