import { describe, expect, it } from "vitest";
import { rankName } from "../src/lib/gearDetails";
import { changed, cubeEventsParam, cubePrice, fineChance, liveScore, oneIn, withPotential, withRank } from "../src/lib/potential";

describe("the Potential page's display rules", () => {
  it("cubeEventsParam: the events in a fixed order, whatever order they were ticked in", () => {
    expect([cubeEventsParam(new Set()), cubeEventsParam(new Set(["sale"])), cubeEventsParam(new Set(["sale", "miracle"])), cubeEventsParam(new Set(["miracle", "sale"]))]).toEqual(["", "sale", "miracle,sale", "miracle,sale"]);
  });

  it("cubePrice: millions with the half million kept", () => {
    expect([12e6, 22e6, 9e6, 16.5e6, 1_234_560_000].map(cubePrice)).toEqual(["12m", "22m", "9m", "16.5m", "1,234.6m"]);
  });

  it("oneIn: a chance per cube as 1 in X cubes, one decimal below 10", () => {
    expect([0.0015, 0.00025, 0.68, 0.25, 0.1, 0.11].map(oneIn)).toEqual(["1 in 667", "1 in 4,000", "1 in 1.5", "1 in 4.0", "1 in 10", "1 in 9.1"]);
    expect([0, -0.1, 1, 1.2].map(oneIn)).toEqual(["never", "never", "every cube", "every cube"]);
  });

  it("fineChance: two significant figures below 10%, the usual wording from 10%", () => {
    expect([0.00054, 0.0015, 0.099, 0.000001].map(fineChance)).toEqual(["0.054%", "0.15%", "9.9%", "0.00010%"]);
    expect([0, 0.1, 0.5, 1].map(fineChance)).toEqual(["0%", "10%", "50%", "100%"]);
  });

  it("liveScore: the editor's lines added up from the server's points, to the hundredth", () => {
    const points = { "STR +13%": 168.61, "STR +10%": 129.7 };
    expect(liveScore(points, ["STR +13%", "STR +10%", "STR +13%"], 20.52)).toBe(466.92);
    expect(liveScore(points, ["STR +13%", null, "Unknown line"], 20.52)).toBe(168.61);
    expect(liveScore(points, [], 20.52)).toBe(0);
    // added the way the server adds hundredths (0.1 + 0.2 would be 0.30000000000000004)
    expect(liveScore({ a: 0.1, b: 0.2 }, ["a", "b"], 20.52)).toBe(0.3);
  });

  it("liveScore: ignore defense lines multiply, as in game, then take the IED value", () => {
    // one line: 40 × 20.52 = 820.8; 40, 40, 30: 1 − 0.6 × 0.6 × 0.7 = 74.8% × 20.52 = 1534.896 → 1534.9
    expect(liveScore({}, ["Ignore Enemy DEF +40%", null, null], 20.52)).toBe(820.8);
    expect(liveScore({}, ["Ignore Enemy DEF +40%", "Ignore Enemy DEF +40%", "Ignore Enemy DEF +30%"], 20.52)).toBe(1534.9);
    // with other lines: ATT 13% 699.66 + boss 40% 480 + IED 35% × 20.52 = 718.2
    expect(liveScore({ "ATT +13%": 699.66, "Boss Damage +40%": 480 }, ["ATT +13%", "Boss Damage +40%", "Ignore Enemy DEF +35%"], 20.52)).toBe(1897.86);
    expect(liveScore({ "Ignore Enemy DEF +40%": 999 }, ["Ignore Enemy DEF +40%"], 0)).toBe(0);
    // only whole IED lines combine; anything else is scored by its points
    expect(liveScore({ "Max Ignore Enemy DEF +40%": 5, "Ignore Enemy DEF +40% when hit": 7 }, ["Max Ignore Enemy DEF +40%", "Ignore Enemy DEF +40% when hit"], 20.52)).toBe(12);
  });

  it("withRank: a new rank keeps the lines it also has, in the same place; no rank, no potential", () => {
    const item = { options: { legendary: [["STR +13%", "DEX +13%"], ["STR +10%"], ["STR +13%"]], unique: [["STR +10%"], ["STR +10%", "STR +7%"], ["STR +7%"]] } };
    expect(withRank(item, { rank: "legendary", lines: ["STR +13%", "STR +10%", "STR +13%"] }, "unique")).toEqual({ rank: "unique", lines: [null, "STR +10%", null] });
    expect(withRank(item, null, "legendary")).toEqual({ rank: "legendary", lines: [null, null, null] });
    expect(withRank(item, { rank: "legendary", lines: ["STR +13%", null, null] }, null)).toBeNull();
    // a rank the item has no lines for: nothing kept
    expect(withRank(item, { rank: "legendary", lines: ["STR +13%", "STR +10%", "STR +13%"] }, "epic")).toEqual({ rank: "epic", lines: [null, null, null] });
  });

  it("changed: the rank or any line differs from what's saved", () => {
    const saved = { rank: "legendary" as const, lines: ["STR +13%", "STR +10%", null] };
    expect(changed(saved, { rank: "legendary", lines: ["STR +13%", "STR +10%", null] })).toBe(false);
    expect(changed(saved, { rank: "unique", lines: ["STR +13%", "STR +10%", null] })).toBe(true);
    expect(changed(saved, { rank: "legendary", lines: ["STR +13%", "STR +10%", "STR +10%"] })).toBe(true);
    expect(changed(saved, null)).toBe(true);
    expect(changed({ rank: null, lines: [null, null, null] }, null)).toBe(false);
    expect(changed({ rank: null, lines: [null, null, null] }, { rank: "rare", lines: [null, null, null] })).toBe(true);
  });

  it("withPotential: the item's other details as saved, or blank ones at the stars it comes with", () => {
    const p = { rank: "rare" as const, lines: ["STR +3%", null, null] };
    expect(withPotential({ stars: 17, flames: { STR: 6 }, potential: null, hammers: 1, boomCost: 5, other: { kind: "hat", level: 150, boss: true, att: 0, matt: 0 } }, 0, p)).toEqual({ stars: 17, flames: { STR: 6 }, potential: p, hammers: 1, boomCost: 5, other: { kind: "hat", level: 150, boss: true, att: 0, matt: 0 } });
    expect(withPotential(undefined, 22, null)).toEqual({ stars: 22, flames: {}, hammers: 0, potential: null });
  });

  it("rankName: a rank as shown", () => {
    expect(["rare", "legendary"].map(rankName)).toEqual(["Rare", "Legendary"]);
  });
});
