import { describe, expect, it } from "vitest";
import type { FlameItem } from "../src/api/types";
import { atLeast, formatChance, formatMeso, formatScore, liveScore, pointAt, priceFromMillions, scoreBand, withFlames } from "../src/lib/flames";

describe("formatMeso", () => {
  it("k, m, B with two decimals, one from 10B, whole with commas from 1,000B; endless as —", () => {
    expect([formatMeso(950), formatMeso(1500), formatMeso(499_400), formatMeso(7_000_000), formatMeso(81_400_000), formatMeso(1_234_567_890)]).toEqual(["950", "2k", "499k", "7m", "81m", "1.23B"]);
    expect([formatMeso(3_094_000_000), formatMeso(31_370_000_000), formatMeso(999_940_000_000), formatMeso(10_358_400_000_000)]).toEqual(["3.09B", "31.4B", "999.9B", "10,358B"]);
    // the unit goes by the rounded number: never "1000k", "1000m", "10.00B" or "1000.0B"
    expect([formatMeso(999_499), formatMeso(999_500), formatMeso(999_499_999), formatMeso(999_500_000), formatMeso(9_994_999_999), formatMeso(9_995_000_000), formatMeso(999_950_000_000)]).toEqual(["999k", "1m", "999m", "1.00B", "9.99B", "10.0B", "1,000B"]);
    expect([formatMeso(999.4), formatMeso(999.5), formatMeso(1e9), formatMeso(1e10)]).toEqual(["999", "1k", "1.00B", "10.0B"]);
    expect([formatMeso(null), formatMeso(Infinity), formatMeso(0)]).toEqual(["—", "—", "0"]);
  });
});

describe("formatChance", () => {
  it("whole from 10%, one decimal below, <0.1% and >99% at the edges, never a false 0% or 100%", () => {
    expect([formatChance(0.2124), formatChance(0.1), formatChance(0.0998), formatChance(0.0013), formatChance(0.001), formatChance(0.00099)]).toEqual(["21%", "10%", "10.0%", "0.1%", "0.1%", "<0.1%"]);
    expect([formatChance(0.994), formatChance(0.995), formatChance(0.9999), formatChance(1), formatChance(0), formatChance(0.0000001)]).toEqual(["99%", ">99%", ">99%", "100%", "0%", "<0.1%"]);
  });
});

describe("formatScore", () => {
  it("one decimal, commas", () => {
    expect([formatScore(159.75), formatScore(1169), formatScore(0), formatScore(22.25), formatScore(1234.56)]).toEqual(["159.8", "1,169", "0", "22.3", "1,234.6"]);
  });
});

describe("liveScore", () => {
  // STR 10 a tier worth 1, STR+DEX 6 a tier worth 1.125, ATT 1 a tier worth 4
  const item = {
    grid: [
      { stat: "STR", values: [null, null, 30, 40, 50, 60, 70] },
      { stat: "STR+DEX", values: [null, null, 18, 24, 30, 36, 42] },
      { stat: "ATT", values: [null, null, 3, 4, 5, 6, 7] },
    ],
    weights: { STR: 1, "STR+DEX": 1.125, ATT: 4 },
  } as unknown as Pick<FlameItem, "grid" | "weights">;
  it("adds each picked line's value × its worth: STR T6 60 + STR+DEX T5 30 × 1.125 + ATT T5 5 × 4 = 113.75", () => {
    expect(liveScore(item, { STR: 6, "STR+DEX": 5, ATT: 5 })).toBe(113.75);
    expect(liveScore(item, {})).toBe(0);
    // a stat the item can't roll counts nothing
    expect(liveScore(item, { Speed: 5, STR: 3 })).toBe(30);
  });

  it("rounds each line to hundredths, as the server does: 3 × 0.333 = 0.999 → 1.00 each", () => {
    const thirds = { grid: [{ stat: "STR", values: [3, 3, 3, 3, 3, 3, 3] }, { stat: "DEX", values: [3, 3, 3, 3, 3, 3, 3] }], weights: { STR: 0.333, DEX: 0.333 } } as unknown as Pick<FlameItem, "grid" | "weights">;
    expect(liveScore(thirds, { STR: 1, DEX: 1 })).toBe(2);
  });
});

describe("scoreBand", () => {
  it("75% of the best and up, 50% and up, below; an item with no best counts as done", () => {
    expect([scoreBand(75, 100), scoreBand(74.9, 100), scoreBand(50, 100), scoreBand(49.9, 100), scoreBand(0, 100), scoreBand(0, 0)]).toEqual(["hi", "mid", "mid", "lo", "lo", "hi"]);
  });
});

describe("withFlames", () => {
  it("keeps the saved stars, potential, hammers and a typed item's description; only the flames change", () => {
    const saved = { stars: 17, flames: { STR: 3 }, potential: { rank: "epic" as const, lines: ["STR +6%", null, null] as (string | null)[] }, hammers: 1, other: { kind: "eye", level: 160, boss: false, att: 0, matt: 0 } };
    expect(withFlames(saved, 0, { DEX: 4 })).toEqual({ ...saved, flames: { DEX: 4 } });
  });

  it("nothing saved yet: blank details, starting at the stars the item comes with", () => {
    expect(withFlames(undefined, 22, { ATT: 6 })).toEqual({ stars: 22, flames: { ATT: 6 }, potential: null, hammers: 0 });
  });
});

describe("priceFromMillions", () => {
  it("millions to whole meso; not a price: null", () => {
    expect([priceFromMillions("3"), priceFromMillions("4.5"), priceFromMillions("0"), priceFromMillions(" 2.0000004 ")]).toEqual([3_000_000, 4_500_000, 0, 2_000_000]);
    expect([priceFromMillions(""), priceFromMillions("  "), priceFromMillions("-1"), priceFromMillions("abc"), priceFromMillions("Infinity")]).toEqual([null, null, null, null, null]);
  });
});

describe("pointAt", () => {
  const pts: [number, number | null][] = [[10, 0.01], [10.5, 0.05], [11, 0.002], [12, null], [20, 0.03]];
  it("the distribution: the tallest point within reach, so a spike beside small points is easy to hit", () => {
    expect(pointAt(pts, 11, 1, true)).toBe(1);
    expect(pointAt(pts, 10, 0.4, true)).toBe(0);
    // exactly at the edge of reach still counts
    expect(pointAt(pts, 11.5, 1, true)).toBe(1);
    expect(pointAt(pts, 15, 1, true)).toBe(-1);
  });

  it("ties and order: the first tallest point, the first nearest point", () => {
    const two: [number, number | null][] = [[10, 0.05], [10.5, 0.01], [11, 0.05]];
    // the tallest in reach is the first one, even with a smaller one after it; of two as tall, the first
    expect(pointAt(two, 10.2, 1, true)).toBe(0);
    // the nearest: the first point when it's nearest; at the same distance, the first
    expect(pointAt(two, 10.1, 1, false)).toBe(0);
    expect(pointAt(two, 10.25, 1, false)).toBe(0);
  });

  it("a curve: the nearest point; points without a value are skipped", () => {
    expect(pointAt(pts, 11.2, 1, false)).toBe(2);
    expect(pointAt(pts, 12.4, 1, false)).toBe(2);
    expect(pointAt(pts, 18, 1, false)).toBe(4);
    expect(pointAt([[1, null]], 1, 1, false)).toBe(-1);
  });
});

describe("atLeast", () => {
  it("the chance of each score or more: 0.5 + 0.3 + 0.2 from the bottom, 0.2 at the top", () => {
    const r = atLeast([[0, 0.5], [10, 0.3], [25, 0.2]]);
    expect(r).toHaveLength(3);
    [1, 0.5, 0.2].forEach((p, i) => expect(r[i]).toBeCloseTo(p, 12));
    expect(atLeast([])).toEqual([]);
  });
});
