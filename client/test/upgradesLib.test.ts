import { describe, expect, it } from "vitest";
import type { UpgradeStep } from "../src/api/types";
import { along, chanceText, costNote, decades, eventsFrom, formatFd, formatTick, nowText, pageFor, pageQuery, SAME_PER_FD, stepKey, SYSTEM_NAME } from "../src/lib/upgrades";

const step = (over: Partial<UpgradeStep>): UpgradeStep => ({ system: "flames", slot: "hat", name: "Hat", icon: null, step: "Black Flame", perFd: 1e8, cost: 4.2e7, fd: 0.42, chance: 1 / 14, boom: null, now: { score: 37.13, best: 268.8 }, ...over });

describe("the Upgrades page's display rules", () => {
  it("pageFor: the system's own page with the item picked", () => {
    expect([pageFor({ system: "flames", slot: "hat" }), pageFor({ system: "starforce", slot: "ring1" }), pageFor({ system: "potential", slot: "a b" })]).toEqual(["/gear/flames?item=hat", "/gear/starforce?item=ring1", "/gear/potential?item=a+b"]);
    expect(SYSTEM_NAME).toEqual({ flames: "Flames", starforce: "Star Force", potential: "Potential" });
    // that page's events from here go with it, so it shows the figures the row did (Flames has none)
    expect([pageFor({ system: "starforce", slot: "hat" }, "thirtyOff", "sale"), pageFor({ system: "potential", slot: "hat" }, "thirtyOff", "miracle,sale"), pageFor({ system: "flames", slot: "hat" }, "thirtyOff", "sale")]).toEqual(["/gear/starforce?item=hat&events=thirtyOff", "/gear/potential?item=hat&events=miracle%2Csale", "/gear/flames?item=hat"]);
    expect([stepKey({ system: "flames", slot: "hat" }), stepKey({ system: "potential", slot: "hat" })]).toEqual(["flames|hat", "potential|hat"]);
  });

  it("pageQuery and eventsFrom: a page's address after its path, and the events back from it", () => {
    expect([pageQuery("hat", ""), pageQuery("hat", "a,b"), pageQuery(null, "a"), pageQuery(null, "")]).toEqual(["?item=hat", "?item=hat&events=a%2Cb", "?events=a", ""]);
    // only the events the page has, in its own order
    expect([...eventsFrom("sale,miracle,free", ["miracle", "sale"])]).toEqual(["miracle", "sale"]);
    expect([...eventsFrom(null, ["miracle", "sale"])]).toEqual([]);
    expect([...eventsFrom("", ["miracle", "sale"])]).toEqual([]);
  });

  it("nowText: the flame score of its best; the stars and the boom price; the rank and the other cube", () => {
    expect(nowText(step({}))).toBe("score 37.1 / 268.8");
    expect(nowText(step({ system: "starforce", now: { star: 17, boomCost: 500_000_000 } }))).toBe("17★ · booms at 500m");
    expect(nowText(step({ system: "starforce", now: { star: 21, boomCost: 0 } }))).toBe("21★ · booms not priced");
    expect(nowText(step({ system: "potential", now: { rank: "unique", cube: "glowing", otherPerFd: 1.12e9 } }))).toBe("Unique · Bright 1.12B per 1%");
    expect(nowText(step({ system: "potential", now: { rank: null, cube: "bright", otherPerFd: null } }))).toBe("no potential · Glowing can't beat it");
  });

  it("chanceText: 1 in X flames or cubes better; the next tap's success and boom, unrounded", () => {
    expect(chanceText(step({ chance: 1 / 14 }))).toBe("1 in 14 flames better");
    expect(chanceText(step({ system: "potential", chance: 0.0015 }))).toBe("1 in 667 cubes better");
    expect(chanceText(step({ system: "starforce", chance: 0.1575, boom: 0.0674 }))).toBe("next tap 15.75%, boom 6.74%");
    expect(chanceText(step({ system: "starforce", chance: 0.42, boom: 0 }))).toBe("next tap 42%");
  });

  it("costNote and formatFd", () => {
    expect([costNote(step({})), costNote(step({ system: "potential" })), costNote(step({ system: "starforce" }))]).toEqual(["average, to any better roll", "average, to any better roll", "average, booms included"]);
    expect([0.42, 1.5678, 0.1, 0.0074, 0.000891, 3e-7].map(formatFd)).toEqual(["+0.42%", "+1.57%", "+0.10%", "+0.0074%", "+0.00089%", "+0.0000003%"]);
    // the chart's ticks: grouped, never in "e" notation
    expect([10000, 10, 1, 0.01, 0.0000001].map(formatTick)).toEqual(["10,000%", "10%", "1%", "0.01%", "0.0000001%"]);
  });

  it("decades: whole powers of ten around the values, at least one apart; along: where a value sits", () => {
    expect(decades([4.2e7, 3e9, 0])).toEqual([7, 10]);
    expect(decades([1e8])).toEqual([8, 9]);
    expect(decades([])).toEqual([0, 1]);
    expect([along([7, 10], 1e7), along([7, 10], 1e10), along([7, 10], 1e8)]).toEqual([0, 1, 1 / 3]);
    expect(SAME_PER_FD).toEqual([1e8, 1e9, 1e10, 1e11]);
  });
});
