import { describe, expect, it } from "vitest";
import { EXP_TO_NEXT } from "../gameFigures/expTable";
import { levelGoals, nextMultipleOf5 } from "./levelGoals";

const need = (level: number) => EXP_TO_NEXT[level - 1]!;

describe("nextMultipleOf5", () => {
  it("is the next 5 strictly above, up to 300", () => {
    expect([200, 204, 205, 207, 209, 285, 296, 299].map(nextMultipleOf5)).toEqual([205, 205, 210, 210, 210, 290, 300, 300]);
  });
});

describe("levelGoals", () => {
  it("at 207: the next level and 210, each with EXP to go and days at the rate (by hand)", () => {
    const perDay = 1_000_000_000;
    const toNext = need(207) - 5;
    const toFive = toNext + need(208) + need(209);
    expect(levelGoals(207, 5, perDay)).toEqual([
      { kind: "next-level", target: 208, remaining: toNext, days: toNext / perDay },
      { kind: "next-multiple-of-5", target: 210, remaining: toFive, days: toFive / perDay },
    ]);
  });

  it("when the next level is the next multiple of 5, there's one goal", () => {
    expect(levelGoals(209, 0, 1).map((g) => g.target)).toEqual([210]);
    expect(levelGoals(299, 0, 1).map((g) => g.target)).toEqual([300]);
    expect(levelGoals(204, 0, 1).map((g) => g.target)).toEqual([205]);
  });

  it("near the cap the multiple of 5 is 300", () => {
    expect(levelGoals(296, 0, 1).map((g) => [g.kind, g.target])).toEqual([
      ["next-level", 297],
      ["next-multiple-of-5", 300],
    ]);
  });

  it("at 300 there's nothing left to reach", () => {
    expect(levelGoals(300, 0, 1_000)).toEqual([]);
  });

  it("with no EXP per day, the time is unknown (never at this pace) but the EXP to go is still shown", () => {
    const [goal] = levelGoals(285, 0, 0);
    expect(goal).toEqual({ kind: "next-level", target: 286, remaining: need(285), days: null });
  });

  it("refuses a negative or missing daily rate", () => {
    expect(() => levelGoals(285, 0, -1)).toThrow("EXP per day can't be negative (got -1)");
    expect(() => levelGoals(285, 0, Number.NaN)).toThrow("can't be negative");
  });
});
