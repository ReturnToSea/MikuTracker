import { describe, expect, it } from "vitest";
import { findSymbol, SYMBOLS } from "../gameFigures/symbols";
import { forceAt, mesoToLevel, symbolsToLevel } from "./symbols";

// Rows copied from the MapleStory Wiki's cost tables (level L → L+1: symbols, meso), checked
// against the formulas independently of this code.
const sym = (id: string) => findSymbol(id)!;
const row = (id: string, level: number) => [symbolsToLevel(sym(id), level), mesoToLevel(sym(id), level)];

describe("symbol costs (wiki tables)", () => {
  it("Arcane: Vanishing Journey and Esfera", () => {
    expect(row("vanishing-journey", 1)).toEqual([12, 970_000]);
    expect(row("vanishing-journey", 2)).toEqual([15, 1_230_000]); // 15 × 8.2 = 123 exactly; ordinary decimals give 122.99…
    expect(row("vanishing-journey", 10)).toEqual([111, 9_990_000]);
    expect(row("vanishing-journey", 19)).toEqual([372, 36_820_000]);
    expect(row("esfera", 1)).toEqual([12, 2_170_000]);
    expect(row("esfera", 9)).toEqual([92, 17_380_000]);
    expect(row("esfera", 19)).toEqual([372, 74_020_000]);
  });

  it("Arcane totals to Lv. 20: 2,679 symbols; Vanishing Journey 252,470,000 meso", () => {
    const vj = sym("vanishing-journey");
    const levels = Array.from({ length: 19 }, (_, i) => i + 1);
    expect(levels.reduce((t, l) => t + symbolsToLevel(vj, l), 0)).toBe(2_679);
    expect(levels.reduce((t, l) => t + mesoToLevel(vj, l), 0)).toBe(252_470_000);
  });

  it("Sacred: Cernium and Carcion (including rows where k − 0.6 × L isn't exact in binary)", () => {
    expect(row("cernium", 1)).toEqual([29, 36_500_000]);
    expect(row("cernium", 4)).toEqual([224, 241_900_000]);
    // 325 × (13.2 − 3) is exactly 3,315, but in ordinary decimals 13.2 − 3 is 10.19999…, and
    // 325 × that rounds down to 3,314 (331,400,000): the wiki says 331,500,000
    expect(row("cernium", 5)).toEqual([325, 331_500_000]);
    expect(row("cernium", 9)).toEqual([909, 709_000_000]);
    expect(row("cernium", 10)).toEqual([1_100, 792_000_000]);
    expect(row("carcion", 1)).toEqual([29, 62_600_000]);
    expect(row("carcion", 7)).toEqual([581, 1_045_800_000]);
    expect(row("carcion", 10)).toEqual([1_100, 1_782_000_000]);
  });

  it("Grand Sacred: Tallahart and Geardock", () => {
    expect(row("tallahart", 1)).toEqual([29, 113_600_000]);
    expect(row("tallahart", 10)).toEqual([1_100, 3_718_000_000]);
    expect(row("geardock", 1)).toEqual([29, 139_700_000]);
    expect(row("geardock", 5)).toEqual([325, 1_488_500_000]);
    expect(row("geardock", 10)).toEqual([1_100, 4_708_000_000]);
  });

  it("Sacred totals to Lv. 11: 4,565 symbols", () => {
    expect(Array.from({ length: 10 }, (_, i) => symbolsToLevel(sym("odium"), i + 1)).reduce((t, n) => t + n, 0)).toBe(4_565);
  });
});

describe("forceAt", () => {
  it("Arcane 30 at Lv. 1, +10 a level; Sacred 10, +10; nothing before unlocking", () => {
    expect([0, 1, 2, 20].map((l) => forceAt(sym("arcana"), l))).toEqual([0, 30, 40, 220]);
    expect([0, 1, 2, 11].map((l) => forceAt(sym("odium"), l))).toEqual([0, 10, 20, 110]);
    expect(forceAt(sym("geardock"), 11)).toBe(110);
  });
});

describe("the symbols", () => {
  it("6 Arcane (to Lv. 20) and 8 Sacred (to Lv. 11, two of them Grand), each with its daily amount", () => {
    expect(SYMBOLS.filter((s) => s.kind === "arcane").map((s) => [s.maxLevel, s.daily, s.weeklyPerClear])).toEqual(Array(6).fill([20, 40, 80]));
    expect(SYMBOLS.filter((s) => s.kind === "sacred").map((s) => `${s.name}:${s.daily}${s.grand ? " grand" : ""}`)).toEqual([
      "Cernium:30", "Hotel Arcus:15", "Odium:15", "Shangri-La:15", "Arteria:15", "Carcion:15", "Tallahart:15 grand", "Geardock:15 grand",
    ]);
    expect(SYMBOLS.filter((s) => s.kind === "sacred").every((s) => s.maxLevel === 11 && s.weeklyPerClear === null)).toBe(true);
  });

  it("selector coupons: Arcane for Arcane; Sacred for Sacred and Tallahart; none for Geardock", () => {
    expect(SYMBOLS.map((s) => s.selector)).toEqual([...Array(6).fill("arcane"), ...Array(7).fill("sacred"), null]);
    expect(new Set(SYMBOLS.map((s) => s.id)).size).toBe(14);
    expect(findSymbol("nobody")).toBeUndefined();
  });
});
