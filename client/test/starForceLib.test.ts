import { describe, expect, it } from "vitest";
import type { StarForceRow } from "../src/api/types";
import { boomCostFrom, costPoints, eventsParam, formatRate, jumpSpans, withBoomSettings, withStars } from "../src/lib/starForce";

describe("formatRate", () => {
  it("every decimal the rate has, nothing more; none as —", () => {
    expect([formatRate(0.1575), formatRate(0.02055), formatRate(0.126375), formatRate(0.315), formatRate(1), formatRate(0.0674 * 0.7)]).toEqual(["15.75%", "2.055%", "12.6375%", "31.5%", "100%", "4.718%"]);
    expect([formatRate(0), formatRate(-1)]).toEqual(["—", "—"]);
  });
});

describe("eventsParam", () => {
  it("the ticked events in a fixed order, whatever order they were ticked in", () => {
    expect(eventsParam(new Set(["plusOne", "thirtyOff"]))).toBe("thirtyOff,plusOne");
    expect(eventsParam(new Set())).toBe("");
    expect(eventsParam(new Set(["fewerBooms", "fiveTenFifteen", "thirtyOff", "plusOne"]))).toBe("thirtyOff,fewerBooms,fiveTenFifteen,plusOne");
  });
});

describe("what saving sends", () => {
  const saved = { stars: 17, flames: { STR: 6 }, potential: null, hammers: 1, boomCost: 5e8, safety: "1144" as const };
  it("new stars keep everything else", () => {
    expect(withStars(saved, 0, 21)).toEqual({ ...saved, stars: 21 });
    expect(withStars(undefined, 22, 23)).toEqual({ stars: 23, flames: {}, potential: null, hammers: 0 });
  });

  it("a new boom cost and boxes keep everything else; 0 and none leave them out", () => {
    expect(withBoomSettings(saved, 0, 1e9, "4444")).toEqual({ ...saved, boomCost: 1e9, safety: "4444" });
    expect(withBoomSettings(saved, 0, 0, null)).toEqual({ stars: 17, flames: { STR: 6 }, potential: null, hammers: 1 });
    expect(withBoomSettings(undefined, 22, 3e8, null)).toEqual({ stars: 22, flames: {}, potential: null, hammers: 0, boomCost: 3e8 });
  });
});

describe("boomCostFrom", () => {
  it("plain meso, commas allowed, whole; not a cost: null", () => {
    expect([boomCostFrom("1500000000"), boomCostFrom("1,500,000,000"), boomCostFrom("0"), boomCostFrom(" 12.6 ")]).toEqual([1_500_000_000, 1_500_000_000, 0, 13]);
    expect([boomCostFrom(""), boomCostFrom("   "), boomCostFrom("-5"), boomCostFrom("lots"), boomCostFrom("Infinity")]).toEqual([null, null, null, null, null]);
    // up to what the server takes
    expect([boomCostFrom("1000000000000000"), boomCostFrom("1000000000000001")]).toEqual([1e15, null]);
  });
});

describe("jumpSpans", () => {
  const row = (from: number, to = from + 1) => ({ from, to }) as StarForceRow;
  it("a jump spans its rows from its first; rows inside a jump get 0", () => {
    const rows = [row(17), row(18), row(19), row(20), row(21)];
    const jumps = [{ from: 17, to: 18 }, { from: 18, to: 19 }, { from: 19, to: 21 }, { from: 21, to: 22 }] as Parameters<typeof jumpSpans>[1];
    expect(jumpSpans(rows, jumps)).toEqual([1, 1, 2, 0, 1]);
  });

  it("two-star rows (+1) count once each", () => {
    const rows = [row(7, 9), row(9, 11), row(11, 12)];
    expect(jumpSpans(rows, [{ from: 7, to: 11 }, { from: 11, to: 12 }] as Parameters<typeof jumpSpans>[1])).toEqual([2, 0, 1]);
  });
});

describe("costPoints", () => {
  it("each range's middle with its share", () => {
    expect(costPoints({ width: 10, bins: [0.5, 0.3, 0.2], marks: { median: 0, p75: 0, p90: 0, p99: 0 } })).toEqual([[5, 0.5], [15, 0.3], [25, 0.2]]);
  });
});
