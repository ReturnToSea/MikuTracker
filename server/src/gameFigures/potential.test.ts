import { describe, expect, it } from "vitest";
import { gearFile, POTENTIAL_KINDS } from "./gear";
import { nexonLevel, potentialOptions } from "./potential";

describe("nexonLevel: Nexon Korea's level range for a GMS item level", () => {
  it("every 10 levels to 119 (each tenth level on its own), 120–150, and GMS 151+ as Korea's 201+", () => {
    expect([0, 9, 10, 11, 19, 20, 21, 85, 90, 110, 111, 119].map(nexonLevel)).toEqual([0, 0, 10, 11, 11, 20, 21, 81, 90, 110, 111, 111]);
    expect([120, 150, 151, 160, 200, 201, 250, 300].map(nexonLevel)).toEqual([120, 120, 201, 201, 201, 201, 201, 201]);
  });
});

describe("potentialOptions (Nexon Korea's tables)", () => {
  const first = (part: string, level: number, rank: "rare" | "epic" | "unique" | "legendary") => potentialOptions(part, level)[rank]![0]!.map((o) => o.line);

  it("a Lv. 160 hat rolls GMS's 13% (Korea's Lv. 201+ values); a Lv. 150 hat 12%", () => {
    expect(first("hat", 160, "legendary")).toContain("STR +13%");
    expect(first("hat", 160, "legendary")).toContain("All Stats +10%");
    expect(first("hat", 150, "legendary")).toContain("STR +12%");
    expect(first("hat", 150, "legendary")).not.toContain("STR +13%");
    expect(first("hat", 200, "legendary")).toContain("Skill Cooldown -2 sec");
  });

  it("each line's chance, from Nexon's table (a Lv. 201+ Legendary hat's first line: STR +13% at 9.7561%)", () => {
    const line = potentialOptions("hat", 250).legendary![0]!.find((o) => o.line === "STR +13%");
    expect(line?.chance).toBe(9.7561);
    const sum = potentialOptions("hat", 250).legendary![0]!.reduce((t, o) => t + o.chance, 0);
    expect(Math.round(sum)).toBe(100);
  });

  it("all four ranks, three lines each", () => {
    const o = potentialOptions("hat", 200);
    expect(Object.keys(o).sort()).toEqual(["epic", "legendary", "rare", "unique"]);
    expect(Object.values(o).map((positions) => positions!.length)).toEqual([3, 3, 3, 3]);
  });

  it("where Korea has no item of that kind and level, the nearest level range below (no hats at Lv. 81–89)", () => {
    // Nexon has hats at 80 and 90 but not 81–89: Lv. 85 uses the Lv. 80 table, the nearest below
    expect(potentialOptions("hat", 85)).toEqual(potentialOptions("hat", 80));
    expect(potentialOptions("hat", 85)).not.toEqual(potentialOptions("hat", 90));
  });

  it("below the lowest level range Nexon has, the lowest one (emblems start at Lv. 60)", () => {
    expect(potentialOptions("emblem", 30)).toEqual(potentialOptions("emblem", 60));
    expect(Object.keys(potentialOptions("emblem", 30)).length).toBeGreaterThan(0);
  });

  it("GMS's 151+ step where Korea has no Lv. 201+ table (overalls, secondaries, emblems…): +1% on the lines it raises", () => {
    // Korea's Lv. 120–200 overall: STR +12% at Legendary; GMS Lv. 160: 13%
    expect(first("overall", 150, "legendary")).toContain("STR +12%");
    expect(first("overall", 160, "legendary")).toContain("STR +13%");
    expect(first("overall", 160, "legendary")).not.toContain("STR +12%");
    expect(first("secondary", 160, "legendary")).toEqual(expect.arrayContaining(["STR +13%", "ATT +13%", "Magic ATT +13%", "Critical Rate +13%", "Damage +13%", "All Stats +10%"]));
    // lines the step doesn't raise stay: boss damage, ignore defense, flat stats
    const plain = (rank: "legendary") => potentialOptions("secondary", 150)[rank]![0]!.map((o) => o.line).filter((l) => /^(Boss Damage|Ignore Enemy DEF)|^\w+ \+\d+$/.test(l));
    const stepped = potentialOptions("secondary", 160).legendary![0]!.map((o) => o.line).filter((l) => /^(Boss Damage|Ignore Enemy DEF)|^\w+ \+\d+$/.test(l));
    expect(stepped).toEqual(plain("legendary"));
    expect(stepped.length).toBeGreaterThan(0);
    // the chances are Korea's
    expect(potentialOptions("secondary", 160).legendary![0]!.map((o) => o.chance)).toEqual(potentialOptions("secondary", 150).legendary![0]!.map((o) => o.chance));
  });

  it("every listed item's potential category, and every kind a typed item can be, has Nexon's tables", () => {
    const parts = new Set([...gearFile().items.flatMap((i) => (i.potential ? [i.potential] : [])), ...POTENTIAL_KINDS]);
    const missing = [...parts].filter((p) => Object.keys(potentialOptions(p, 200)).length === 0 || Object.keys(potentialOptions(p, 100)).length === 0);
    expect(missing).toEqual([]);
    expect(parts.size).toBeGreaterThanOrEqual(17);
  });

  it("an unknown kind of item has nothing", () => {
    expect(potentialOptions("tail", 200)).toEqual({});
  });
});
