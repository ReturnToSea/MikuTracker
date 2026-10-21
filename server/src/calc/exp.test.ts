import { describe, expect, it } from "vitest";
import { EXP_TO_NEXT } from "../gameFigures/expTable";
import { checkProgress, expToNext, expToReach, fromTotal, progress, totalExp } from "./exp";

describe("totalExp", () => {
  it("adds up every level before, plus the EXP into this one (by hand)", () => {
    expect(totalExp(1, 0)).toBe(0);
    expect(totalExp(1, 10)).toBe(10);
    expect(totalExp(2, 0)).toBe(15);
    expect(totalExp(3, 5)).toBe(15 + 34 + 5);
    expect(totalExp(201, 0)).toBe(13_669_361_700); // published: total EXP to reach level 201
    expect(totalExp(300, 0)).toBe(8_509_498_537_428_819); // the most EXP a character can have
  });

  it("reaching the next level adds exactly that level's EXP, all the way up", () => {
    for (let level = 1; level < 300; level++) expect(totalExp(level + 1, 0) - totalExp(level, 0)).toBe(EXP_TO_NEXT[level - 1]);
  });

  it("the last EXP of a level is one short of the next level", () => {
    for (const level of [1, 199, 200, 259, 260, 299]) expect(totalExp(level, expToNext(level) - 1) + 1).toBe(totalExp(level + 1, 0));
  });
});

describe("fromTotal", () => {
  it("gives back the level and EXP, at the edges and in between", () => {
    const cases: [number, number][] = [
      [1, 0],
      [1, 14],
      [2, 0],
      [200, 0],
      [200, 2_207_026_469],
      [259, 123_456_789],
      [260, 0],
      [299, 1_737_759_854_037_636],
      [300, 0],
    ];
    for (const [level, exp] of cases) expect(fromTotal(totalExp(level, exp))).toEqual({ level, exp });
  });

  it.each([-1, 1.5, 8_509_498_537_428_820])("refuses a total of %d", (total) => {
    expect(() => fromTotal(total)).toThrow("Total EXP must be a whole number from 0 to 8509498537428819");
  });
});

describe("progress and expToReach", () => {
  it("progress is the share of the level done; level 300 counts as done", () => {
    expect(progress(285, 0)).toBe(0);
    expect(progress(285, expToNext(285) / 2)).toBeCloseTo(0.5, 12);
    expect(progress(300, 0)).toBe(1);
  });

  it("expToReach 207 → 210 is the rest of 207 plus all of 208 and 209 (by hand)", () => {
    const [n207, n208, n209] = [EXP_TO_NEXT[206]!, EXP_TO_NEXT[207]!, EXP_TO_NEXT[208]!];
    expect(expToReach(207, 1_000, 210)).toBe(n207 - 1_000 + n208 + n209);
    expect(expToReach(299, 0, 300)).toBe(1_737_759_854_037_637);
  });

  it("refuses a target that isn't above the current level, or past 300", () => {
    expect(() => expToReach(210, 0, 210)).toThrow("Target level 210 must be above the current level 210");
    expect(() => expToReach(210, 0, 209)).toThrow("must be above");
    expect(() => expToReach(299, 0, 301)).toThrow("Level must be a whole number from 1 to 300 (got 301)");
  });
});

describe("impossible progress is refused", () => {
  it("by totalExp, progress and expToReach too", () => {
    expect(() => totalExp(200, 2_207_026_470)).toThrow("EXP at level 200 must be a whole number from 0 to 2207026469");
    expect(() => totalExp(301, 0)).toThrow("Level must be a whole number from 1 to 300");
    expect(() => progress(300, 1)).toThrow("EXP at level 300 must be a whole number from 0 to 0");
    expect(() => progress(285, -1)).toThrow("EXP at level 285 must be a whole number");
    expect(() => expToReach(285, -1, 290)).toThrow("EXP at level 285 must be a whole number");
  });

  it.each([0, 301, 2.5, Number.NaN])("level %d", (level) => {
    expect(() => checkProgress(level, 0)).toThrow("Level must be a whole number from 1 to 300");
  });

  it("EXP below 0, not whole, or enough for the next level", () => {
    expect(() => checkProgress(200, -1)).toThrow("EXP at level 200 must be a whole number from 0 to 2207026469 (got -1)");
    expect(() => checkProgress(200, 0.5)).toThrow("from 0 to 2207026469");
    expect(() => checkProgress(200, 2_207_026_470)).toThrow("from 0 to 2207026469");
    expect(() => checkProgress(200, 2_207_026_469)).not.toThrow();
  });

  it("level 300 has no EXP", () => {
    expect(() => checkProgress(300, 1)).toThrow("EXP at level 300 must be a whole number from 0 to 0");
  });

  it("expToNext only goes up to level 299", () => {
    expect(() => expToNext(300)).toThrow("Level must be a whole number from 1 to 299 (got 300)");
    expect(expToNext(1)).toBe(15);
  });
});
