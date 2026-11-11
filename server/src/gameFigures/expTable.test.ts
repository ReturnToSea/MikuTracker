import { describe, expect, it } from "vitest";
import { GMS_EXP_BEFORE_V271 } from "../../test/fixtures/gmsExpBeforeV271";
import { EXP_TABLE_PATCH, EXP_TO_NEXT, MAX_LEVEL } from "./expTable";
import { byHandWorld, CHALLENGER, heroicWorld, nexonWorlds } from "@miku/shared";
import { WORLDS } from "./worlds";

const need = (level: number) => EXP_TO_NEXT[level - 1]!;

describe("the GMS EXP table", () => {
  it("has a positive whole number for every level from 1 to 299", () => {
    expect(EXP_TO_NEXT).toHaveLength(MAX_LEVEL - 1);
    expect(MAX_LEVEL).toBe(300);
    for (const v of EXP_TO_NEXT) expect(Number.isSafeInteger(v) && v > 0).toBe(true);
  });

  it("matches published values", () => {
    expect([need(1), need(10), need(200), need(260), need(299)]).toEqual([15, 1_242, 2_207_026_470, 1_731_919_984_062, 1_737_759_854_037_637]);
    // Namu Wiki's KMS table (KMS made the same cuts in March 2026)
    expect([need(225), need(230), need(239)]).toEqual([35_647_390_783, 56_071_749_123, 85_236_017_035]);
  });

  it("never needs less EXP for a higher level", () => {
    for (let level = 2; level < MAX_LEVEL; level++) expect(need(level)).toBeGreaterThanOrEqual(need(level - 1));
  });

  it("from level 1 to 300 adds up to 8,509,498,537,428,819, which is still exact as a JavaScript number", () => {
    let total = 0;
    for (const v of EXP_TO_NEXT) total += v;
    expect(total).toBe(8_509_498_537_428_819);
    expect(Number.isSafeInteger(total)).toBe(true);
  });

  it("is current as of v.271", () => {
    expect(EXP_TABLE_PATCH).toBe("v.271");
  });
});

describe("v.271's cuts", () => {
  // From Nexon's v.271 patch notes: the approximate cut for each range of levels.
  const CUTS: [from: number, to: number, cut: number][] = [
    [210, 214, 0.08],
    [215, 219, 0.15],
    [220, 224, 0.21],
    [225, 229, 0.27],
    [230, 234, 0.33],
    [235, 239, 0.38],
    [240, 244, 0.43],
    [245, 249, 0.47],
    [250, 259, 0.58],
  ];

  it.each(CUTS)("levels %i–%i are the old GMS values cut by about %f", (from, to, cut) => {
    for (let level = from; level <= to; level++) {
      const ratio = need(level) / GMS_EXP_BEFORE_V271[level - 1]!;
      expect(Math.abs(ratio - (1 - cut))).toBeLessThan(0.01); // "about": within one percentage point
    }
  });

  it("left every other level unchanged (above 270, up to rounding in the last few digits)", () => {
    for (let level = 1; level < MAX_LEVEL; level++) {
      if (level >= 210 && level <= 259) continue;
      const before = GMS_EXP_BEFORE_V271[level - 1]!;
      if (level < 270) expect(need(level)).toBe(before);
      else expect(Math.abs(need(level) - before) / before).toBeLessThan(1e-12);
    }
  });
});

describe("worlds", () => {
  it("are Kronos (45) and Hyperion (70), the IDs Nexon's rankings use, and Challenger (900, ours) added by hand; all Heroic", () => {
    expect(WORLDS).toEqual([
      { id: 45, name: "Kronos", byHand: false, heroic: true },
      { id: 70, name: "Hyperion", byHand: false, heroic: true },
      { id: 900, name: "Challenger", byHand: true, heroic: true },
    ]);
    // and an ID no world has is neither
    expect([byHandWorld(900), byHandWorld(45), byHandWorld(1), heroicWorld(70), heroicWorld(900), heroicWorld(1)]).toEqual([true, false, false, true, true, false]);
    expect([nexonWorlds(), CHALLENGER]).toEqual([[45, 70], 900]);
  });
});
