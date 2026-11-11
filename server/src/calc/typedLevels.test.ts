import { describe, expect, it } from "vitest";
import { typedLevels } from "./typedLevels";

// The level graph of a character added by hand (Challenger): one point a day, the last level typed carried.
describe("typed levels", () => {
  it("each day from the first typed, carrying the level, marking the days typed (worked out by hand)", () => {
    const points = [{ day: "2026-11-13", level: 226 }, { day: "2026-11-11", level: 200 }, { day: "2026-11-12", level: 214 }];
    expect(typedLevels(points, "2026-11-15")).toEqual([
      { day: "2026-11-11", level: 200, typed: true },
      { day: "2026-11-12", level: 214, typed: true },
      { day: "2026-11-13", level: 226, typed: true },
      { day: "2026-11-14", level: 226, typed: false },
      { day: "2026-11-15", level: 226, typed: false },
    ]);
  });

  it("a level typed before the window carries into its first day; one after today is left out", () => {
    const points = [{ day: "2026-11-01", level: 200 }, { day: "2026-11-03", level: 210 }, { day: "2026-11-09", level: 230 }, { day: "2026-11-11", level: 240 }];
    expect(typedLevels(points, "2026-11-10", 5)).toEqual([
      { day: "2026-11-06", level: 210, typed: false },
      { day: "2026-11-07", level: 210, typed: false },
      { day: "2026-11-08", level: 210, typed: false },
      { day: "2026-11-09", level: 230, typed: true },
      { day: "2026-11-10", level: 230, typed: false },
    ]);
  });

  it("of several levels typed before the window (in any order), the latest carries in", () => {
    const points = [{ day: "2026-11-03", level: 210 }, { day: "2026-11-05", level: 220 }, { day: "2026-11-01", level: 200 }];
    expect(typedLevels(points, "2026-11-08", 2)).toEqual([
      { day: "2026-11-07", level: 220, typed: false },
      { day: "2026-11-08", level: 220, typed: false },
    ]);
  });

  it("the window's first day typed itself; across a month's end; nothing typed: nothing", () => {
    expect(typedLevels([{ day: "2026-10-30", level: 250 }, { day: "2026-10-28", level: 249 }], "2026-11-01", 3)).toEqual([
      { day: "2026-10-30", level: 250, typed: true },
      { day: "2026-10-31", level: 250, typed: false },
      { day: "2026-11-01", level: 250, typed: false },
    ]);
    expect(typedLevels([], "2026-11-01")).toEqual([]);
    // 90 days by default: today and the 89 before
    const all = typedLevels([{ day: "2026-01-01", level: 200 }], "2026-11-01");
    expect([all.length, all[0]!.day, all.at(-1)!.day]).toEqual([90, "2026-08-04", "2026-11-01"]);
  });
});
