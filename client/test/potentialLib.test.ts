import { describe, expect, it } from "vitest";
import { rankName } from "../src/lib/gearDetails";
import { STAT_VALUE_DEFAULTS } from "@miku/shared";
import { changed, cooldownBelow, cooldownText, lineText, cubeEventsParam, cubePrice, fineChance, liveScore, oneIn, signedScore, withPotential, withRank } from "../src/lib/potential";

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

  it("liveScore: a hat's cooldown lines add up first, then count once by its table (v2.4.1)", () => {
    // the hat's points at 0 to 6 s (2 s 174.52, 4 s 425.48, blanks taking the one below)
    const cd = [0, 0, 174.52, 174.52, 425.48, 425.48, 425.48];
    expect(liveScore({ "STR +13%": 168.61, "Skill Cooldown -2 sec": 174.52 }, ["STR +13%", "Skill Cooldown -2 sec", "Skill Cooldown -2 sec"], 20.52, cd)).toBe(594.09);
    // two 1 s lines make 2 s; 1 s alone nothing
    expect(liveScore({}, ["Skill Cooldown -1 sec", "Skill Cooldown -1 sec", null], 20.52, cd)).toBe(174.52);
    expect(liveScore({}, ["Skill Cooldown -1 sec", null, null], 20.52, cd)).toBe(0);
    // past the table's end: its last (the server's 6 s)
    expect(liveScore({}, ["Skill Cooldown -2 sec", "Skill Cooldown -2 sec", "Skill Cooldown -2 sec", "Skill Cooldown -2 sec"], 0, cd)).toBe(425.48);
    // not a hat (no table): each line by its own points, as before
    expect(liveScore({ "Skill Cooldown -2 sec": 5 }, ["Skill Cooldown -2 sec", "Skill Cooldown -2 sec"], 0)).toBe(10);
    // only whole cooldown lines count as seconds; every number of digits counts (a made-up 10 s line: 6 s's)
    expect(liveScore({ "Skill Cooldown -2 sec when hit": 7 }, ["Skill Cooldown -2 sec when hit"], 0, cd)).toBe(7);
    expect(liveScore({ "Max Skill Cooldown -2 sec": 7 }, ["Max Skill Cooldown -2 sec"], 0, cd)).toBe(7);
    expect(liveScore({}, ["Skill Cooldown -10 sec"], 0, cd)).toBe(425.48);
  });

  it("cooldownBelow: what an empty cooldown box counts as: the nearest filled box below, else nothing", () => {
    const v = { ...STAT_VALUE_DEFAULTS, cd2: 1.37, cd4: 3.34 };
    expect([2, 3, 4, 5, 6].map((s) => cooldownBelow(v, s))).toEqual([null, { sec: 2, value: 1.37 }, { sec: 2, value: 1.37 }, { sec: 4, value: 3.34 }, { sec: 4, value: 3.34 }]);
    expect(cooldownBelow({ ...STAT_VALUE_DEFAULTS, cd5: 4 }, 6)).toEqual({ sec: 5, value: 4 });
    expect(cooldownBelow({ ...STAT_VALUE_DEFAULTS, cd2: 0 }, 3)).toEqual({ sec: 2, value: 0 });
    expect(cooldownBelow(STAT_VALUE_DEFAULTS, 6)).toBeNull();
  });

  it("lineText: a picked line's points; a hat's cooldown line its seconds (they add up before they count)", () => {
    const hat = { points: { "STR +13%": 168.61, "Skill Cooldown -1 sec": 0, "Skill Cooldown -2 sec": 174.52 }, cooldown: { sec: 0, min: 0, points: [0, 0, 174.52, 174.52, 425.48, 425.48, 425.48] } };
    expect(["STR +13%", "Skill Cooldown -1 sec", "Skill Cooldown -2 sec", "Unknown line"].map((l) => lineText(hat, l))).toEqual(["+168.6", "1 s, adds up", "2 s, adds up", "+0"]);
    expect(lineText(hat, null)).toBe("");
    // not a hat: points, as for any line
    expect(lineText({ ...hat, cooldown: null }, "Skill Cooldown -2 sec")).toBe("+174.5");
    // only whole cooldown lines; every number of digits
    expect(["Skill Cooldown -2 sec when hit", "Max Skill Cooldown -2 sec", "Skill Cooldown -10 sec"].map((l) => lineText(hat, l))).toEqual(["+0", "+0", "10 s, adds up"]);
  });

  it("cooldownText and signedScore", () => {
    expect(cooldownText(null)).toBeNull();
    expect(cooldownText({ sec: 2, min: 0 })).toBe("cooldown 2 s");
    expect(cooldownText({ sec: 2, min: 4 })).toBe("cooldown 2 s, under the 4 s it must keep: any roll that keeps 4 s is better");
    expect(cooldownText({ sec: 4, min: 4 })).toBe("cooldown 4 s, must keep 4 s: only rolls that keep it count");
    expect([12.3, 0, -5].map(signedScore)).toEqual(["+12.3", "+0", "−5"]);
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
