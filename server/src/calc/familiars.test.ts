import { describe, expect, it } from "vitest";
import { familiarChoices as lineChoices, familiarLineFits as lineFits } from "@miku/shared";
import { familiarTotals } from "./familiars";

// Made-up lines per rank, small enough to check by eye.
const LINES = {
  common: [{ stat: "dmg", value: 1 }],
  rare: [{ stat: "dmg", value: 2 }],
  epic: [{ stat: "bossDmg", value: 30 }],
  unique: [{ stat: "bossDmg", value: 40 }],
  legendary: [{ stat: "bossDmg", value: 50 }],
} as const;

describe("lineChoices", () => {
  it("the 1st line from the familiar's own rank; the 2nd usually from the rank below, rarely its own", () => {
    expect(lineChoices("unique", LINES)).toEqual({ first: LINES.unique, usual: LINES.epic, rare: LINES.unique });
    expect(lineChoices("rare", LINES)).toEqual({ first: LINES.rare, usual: LINES.common, rare: LINES.rare });
  });
  it("nothing below Common: its 2nd line only from its own rank", () => {
    expect(lineChoices("common", LINES)).toEqual({ first: LINES.common, usual: null, rare: LINES.common });
  });
});

describe("lineFits", () => {
  const unique = lineChoices("unique", LINES);
  it("the 1st line only from the familiar's rank", () => {
    expect(lineFits({ stat: "bossDmg", value: 40 }, 0, unique)).toBe(true);
    expect(lineFits({ stat: "bossDmg", value: 30 }, 0, unique)).toBe(false);
    expect(lineFits({ stat: "bossDmg", value: 50 }, 0, unique)).toBe(false);
  });
  it("the 2nd from the rank below or its own, not from further away", () => {
    expect(lineFits({ stat: "bossDmg", value: 30 }, 1, unique)).toBe(true);
    expect(lineFits({ stat: "bossDmg", value: 40 }, 1, unique)).toBe(true);
    expect(lineFits({ stat: "bossDmg", value: 50 }, 1, unique)).toBe(false);
    expect(lineFits({ stat: "dmg", value: 2 }, 1, unique)).toBe(false);
    // the stat must match as well as the value
    expect(lineFits({ stat: "ied", value: 40 }, 1, unique)).toBe(false);
  });
  it("a Common familiar's 2nd line from its own rank", () => {
    expect(lineFits({ stat: "dmg", value: 1 }, 1, lineChoices("common", LINES))).toBe(true);
  });
  it("not entered, or another kind of line (worth 0), always fits; another kind with a value doesn't", () => {
    expect(lineFits(null, 0, unique)).toBe(true);
    expect(lineFits({ stat: "other", value: 0 }, 1, unique)).toBe(true);
    expect(lineFits({ stat: "other", value: 5 }, 0, unique)).toBe(false);
  });
});

describe("familiarTotals", () => {
  it("adds each stat's lines and badges, in the totals' order, leaving out stats nothing gives", () => {
    const totals = familiarTotals(
      [{ stat: "dmg", value: 9 }, { stat: "attPct", value: 6 }, { stat: "dmg", value: 3 }],
      [{ dmg: 1, att: 2 }, { critRate: 1 }],
      120,
    );
    expect(totals).toEqual([
      { stat: "attPct", familiars: 6, badges: 0, total: 6, over: null },
      { stat: "dmg", familiars: 12, badges: 1, total: 13, over: null },
      { stat: "critRate", familiars: 0, badges: 1, total: 1, over: null },
      { stat: "att", familiars: 0, badges: 2, total: 2, over: null },
    ]);
  });
  it("familiar Boss DMG counts up to the cap, saying what the lines added up to; at the cap exactly, nothing over", () => {
    expect(familiarTotals([{ stat: "bossDmg", value: 50 }, { stat: "bossDmg", value: 40 }, { stat: "bossDmg", value: 40 }], [], 120)).toEqual([{ stat: "bossDmg", familiars: 130, badges: 0, total: 120, over: 130 }]);
    expect(familiarTotals([{ stat: "bossDmg", value: 40 }, { stat: "bossDmg", value: 40 }, { stat: "bossDmg", value: 40 }], [], 120)).toEqual([{ stat: "bossDmg", familiars: 120, badges: 0, total: 120, over: null }]);
    // (the cap is familiars' own: badges add on top of it)
    expect(familiarTotals([{ stat: "bossDmg", value: 50 }, { stat: "bossDmg", value: 50 }, { stat: "bossDmg", value: 50 }], [{ bossDmg: 2 }], 120)[0]).toEqual({ stat: "bossDmg", familiars: 150, badges: 2, total: 122, over: 150 });
  });
  it("the cap is Boss DMG's only: another stat over it adds up in full", () => {
    expect(familiarTotals([{ stat: "dmg", value: 9 }, { stat: "dmg", value: 9 }], [], 10)).toEqual([{ stat: "dmg", familiars: 18, badges: 0, total: 18, over: null }]);
  });
  it("lines that aren't damage stats add nothing", () => {
    expect(familiarTotals([{ stat: "other", value: 0 }, { stat: "dmg", value: 1 }], [], 120)).toEqual([{ stat: "dmg", familiars: 1, badges: 0, total: 1, over: null }]);
  });
  it("IED combines: each source ignores its share of what's left", () => {
    // familiars 30% and 40%: 1 − 0.7 × 0.6 = 58%; badges 3% and 3%: 1 − 0.97² = 5.91%; all four:
    // 1 − 0.7 × 0.6 × 0.97² = 60.4822%
    const [ied] = familiarTotals([{ stat: "ied", value: 30 }, { stat: "ied", value: 40 }], [{ ied: 3 }, { ied: 3 }, { dmg: 1 }], 120);
    expect(ied!.stat).toBe("ied");
    expect(ied!.familiars).toBeCloseTo(58, 10);
    expect(ied!.badges).toBeCloseTo(5.91, 10);
    expect(ied!.total).toBeCloseTo(60.4822, 10);
    expect(ied!.over).toBeNull();
  });
  it("nothing typed: no totals", () => {
    expect(familiarTotals([], [{}], 120)).toEqual([]);
  });
});
