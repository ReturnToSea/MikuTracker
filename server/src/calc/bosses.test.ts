import { countedCrystals, DIFFICULTIES } from "@miku/shared";
import { describe, expect, it } from "vitest";
import { BOSSES, findBoss, MAX_PARTY } from "../gameFigures/bosses";
import { bossMonth, bossWeek, mesoPerPerson, monthlyReset, weeklyReset } from "./bosses";

// Every moment is written in UTC; npm test runs these in California time and in UTC. Tue 20 Oct
// 2026 is a Tuesday, so Thu 15 and Thu 22 Oct start boss weeks.
const at = (iso: string) => new Date(iso);

describe("bossWeek", () => {
  it("runs from Thursday 00:00 UTC to the next Thursday", () => {
    expect(bossWeek(at("2026-10-22T00:00:00.000Z"))).toBe("2026-10-22");
    expect(bossWeek(at("2026-10-21T23:59:59.999Z"))).toBe("2026-10-15");
    // every day of one week, Thursday to Wednesday
    for (const day of ["15", "16", "17", "18", "19", "20", "21"]) expect(bossWeek(at(`2026-10-${day}T12:00:00Z`))).toBe("2026-10-15");
    expect(bossWeek(at("2026-10-28T23:59:59.999Z"))).toBe("2026-10-22");
  });

  it("follows the UTC day, not the local one: Wednesday 5 PM in California is already Thursday", () => {
    expect(bossWeek(new Date(Date.UTC(2026, 9, 22, 0, 30)))).toBe("2026-10-22");
  });

  it("crosses months and years", () => {
    expect(bossWeek(at("2026-11-02T08:00:00Z"))).toBe("2026-10-29");
    expect(bossWeek(at("2027-01-02T08:00:00Z"))).toBe("2026-12-31");
  });
});

describe("weeklyReset", () => {
  it("is the Thursday after the week's first day, at 00:00 UTC", () => {
    expect(weeklyReset("2026-10-15").toISOString()).toBe("2026-10-22T00:00:00.000Z");
    expect(weeklyReset("2026-12-31").toISOString()).toBe("2027-01-07T00:00:00.000Z");
  });
});

describe("bossMonth and monthlyReset", () => {
  it("the month changes at 00:00 UTC on the 1st", () => {
    expect(bossMonth(at("2026-10-31T23:59:59.999Z"))).toBe("2026-10");
    expect(bossMonth(at("2026-11-01T00:00:00.000Z"))).toBe("2026-11");
  });

  it("resets on the 1st of the next month, December into January", () => {
    expect(monthlyReset("2026-10").toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(monthlyReset("2026-12").toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("mesoPerPerson", () => {
  it("is the price ×5 (Heroic), split equally and rounded down", () => {
    expect(mesoPerPerson(100_800_000, 1)).toBe(504_000_000); // Hard Lucid solo
    expect(mesoPerPerson(279_500_000, 2)).toBe(698_750_000); // Extreme Lotus, party of 2
    expect(mesoPerPerson(16_200_000, 6)).toBe(13_500_000);
    // 19,012,500 × 5 = 95,062,500, ÷ 4
    expect(mesoPerPerson(19_012_500, 4)).toBe(23_765_625);
    expect(mesoPerPerson(46_334_700, 3)).toBe(77_224_500); // 231,673,500 ÷ 3
    expect(mesoPerPerson(9_112_500, 6)).toBe(7_593_750);
    expect(mesoPerPerson(11, 2)).toBe(27); // 55 ÷ 2 = 27.5, rounded down
  });
});

describe("countedCrystals", () => {
  it("counts the most valuable ones up to the limit, in the order given", () => {
    expect(countedCrystals([5, 9, 1, 7], 2)).toEqual([false, true, false, true]);
    expect(countedCrystals([5, 9, 1, 7], 4)).toEqual([true, true, true, true]);
    expect(countedCrystals([5, 9, 1, 7], 10)).toEqual([true, true, true, true]);
    expect(countedCrystals([5, 9], 0)).toEqual([false, false]);
    expect(countedCrystals([], 14)).toEqual([]);
  });

  it("of equal ones, the earlier counts", () => {
    expect(countedCrystals([3, 8, 3, 3], 2)).toEqual([true, true, false, false]);
    expect(countedCrystals([3, 3, 8, 3], 3)).toEqual([true, true, true, false]);
  });

  it("15 different crystals with a limit of 14: only the cheapest is left out", () => {
    const values = [40, 10, 150, 20, 60, 130, 70, 5, 80, 90, 100, 110, 120, 140, 30];
    const counts = countedCrystals(values, 14);
    expect(values.filter((_, i) => !counts[i])).toEqual([5]);
  });
});

describe("the boss list", () => {
  it("has 28 weekly bosses in game order, then Black Mage as the monthly one", () => {
    expect(BOSSES).toHaveLength(29);
    expect(BOSSES.map((b) => b.name).slice(0, 3)).toEqual(["Zakum", "Magnus", "Hilla"]);
    expect(BOSSES.at(-2)!.name).toBe("Jupiter");
    expect(BOSSES.filter((b) => b.kind === "monthly").map((b) => b.name)).toEqual(["Black Mage"]);
  });

  it("each boss has a unique id, its difficulties easiest first, and harder pays more", () => {
    expect(new Set(BOSSES.map((b) => b.id)).size).toBe(BOSSES.length);
    for (const b of BOSSES) {
      expect(b.difficulties.length).toBeGreaterThan(0);
      const order = b.difficulties.map((d) => DIFFICULTIES.indexOf(d.difficulty));
      expect(order).toEqual([...order].sort((x, y) => x - y));
      const prices = b.difficulties.map((d) => d.price);
      expect(prices).toEqual([...prices].sort((x, y) => x - y));
      for (const d of b.difficulties) expect(Number.isInteger(d.price) && d.price > 0).toBe(true);
    }
  });

  it("parties of up to 6, except the ones the game limits", () => {
    const smaller = BOSSES.flatMap((b) => b.difficulties.filter((d) => d.maxParty !== MAX_PARTY).map((d) => `${d.difficulty} ${b.name}: ${d.maxParty}`));
    expect(smaller).toEqual([
      "Extreme Lotus: 2",
      ...["Easy", "Normal", "Hard", "Extreme"].map((d) => `${d} First Adversary: 3`),
      ...["Normal", "Hard"].map((d) => `${d} Malefic Star: 3`),
      ...["Normal", "Hard"].map((d) => `${d} Limbo: 3`),
      ...["Normal", "Hard"].map((d) => `${d} Baldrix: 3`),
      ...["Normal", "Hard"].map((d) => `${d} Jupiter: 3`),
    ]);
  });

  it("spot checks against the wiki's table (GMS v270, base prices)", () => {
    const priceOf = (id: string, difficulty: string) => findBoss(id)!.difficulties.find((d) => d.difficulty === difficulty)!.price;
    expect(priceOf("zakum", "Chaos")).toBe(16_200_000);
    expect(priceOf("lucid", "Hard")).toBe(100_800_000);
    expect(priceOf("chosen_seren", "Extreme")).toBe(847_000_000);
    expect(priceOf("kalos_the_guardian", "Extreme")).toBe(1_040_000_000);
    expect(priceOf("jupiter", "Hard")).toBe(1_190_600_000);
    expect(priceOf("black_mage", "Extreme")).toBe(3_600_000_000);
    expect(findBoss("nobody")).toBeUndefined();
  });
});
