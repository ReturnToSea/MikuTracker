import { describe, expect, it } from "vitest";
import { gearFile, POTENTIAL_KINDS } from "./gear";
import { nearestLine, nexonLevel, potentialFile, potentialOptions } from "./potential";

describe("nexonLevel: Nexon Korea's level range for a GMS item level", () => {
  it("every 10 levels to 119 (each tenth level on its own), then one range from 120 up (Korea's 201+ isn't GMS's)", () => {
    expect([0, 9, 10, 11, 19, 20, 21, 85, 90, 110, 111, 119].map(nexonLevel)).toEqual([0, 0, 10, 11, 11, 20, 21, 81, 90, 110, 111, 111]);
    expect([120, 150, 151, 160, 200, 201, 250, 300].map(nexonLevel)).toEqual([120, 120, 120, 120, 120, 120, 120, 120]);
  });
});

describe("potentialOptions (Nexon Korea's tables)", () => {
  const first = (part: string, level: number, rank: "rare" | "epic" | "unique" | "legendary", line = 0) => potentialOptions(part, level)[rank]![line]!.map((o) => o.line);

  it("a Lv. 160 hat rolls GMS's 13% (Korea's 12% + 1); a Lv. 150 hat 12%", () => {
    expect(first("hat", 160, "legendary")).toContain("STR +13%");
    expect(first("hat", 160, "legendary")).toContain("All Stats +10%");
    expect(first("hat", 150, "legendary")).toContain("STR +12%");
    expect(first("hat", 150, "legendary")).not.toContain("STR +13%");
    expect(first("hat", 200, "legendary")).toContain("Skill Cooldown -2 sec");
  });

  it("a Genesis weapon (Lv. 200) rolls what the owner saw cubed: ATT and damage 13%, crit rate 12%, boss and IED at most 40%", () => {
    const lines = potentialOptions("weapon", 200).legendary!.flat().map((o) => o.line);
    expect(lines).toEqual(expect.arrayContaining(["ATT +13%", "Damage +13%", "Critical Rate +12%", "Ignore Enemy DEF +40%", "Ignore Enemy DEF +35%", "Boss Damage +35%", "Boss Damage +40%"]));
    for (const gone of ["Boss Damage +45%", "Ignore Enemy DEF +45%", "Critical Rate +13%", "ATT +12%", "Damage +12%"]) expect(lines).not.toContain(gone);
  });

  it("from Lv. 151 only main stat, all stats, ATT, Magic ATT and damage % rise by 1%; HP stays 12% (Nexon's forum), and so do crit rate, boss, IED and flat lines", () => {
    for (const part of ["hat", "weapon", "overall", "secondary", "ring", "emblem"]) {
      const before = potentialOptions(part, 150).legendary!;
      const after = potentialOptions(part, 151).legendary!;
      after.forEach((slot, i) =>
        slot.forEach((o, j) => {
          const was = before[i]![j]!;
          expect(o.chance).toBe(was.chance);
          const m = /^(STR|DEX|INT|LUK|All Stats|ATT|Magic ATT|Damage) \+(\d+)%$/.exec(was.line);
          expect(o.line).toBe(m ? `${m[1]} +${Number(m[2]) + 1}%` : was.line);
        }),
      );
    }
    expect(first("hat", 160, "legendary")).toContain("Max HP +12%");
    expect(first("hat", 160, "legendary")).not.toContain("Max HP +13%");
  });

  it("each line's chance, from Nexon's tables: the black cube (Bright) rolls top lines on line 2 twice as often as the red (Glowing)", () => {
    const chance = (cube: "black" | "red", line: number, text: string) => potentialOptions("weapon", 200, cube).legendary![line]!.find((o) => o.line === text)?.chance;
    // Nexon Korea's weapon tables (Lv. 120+): line 1 the same for both cubes; line 2's 40% IED 0.9756% black, 0.4878% red
    expect([chance("black", 0, "Boss Damage +40%"), chance("red", 0, "Boss Damage +40%"), chance("black", 0, "Boss Damage +35%")]).toEqual([4.878, 4.878, 9.7561]);
    expect([chance("black", 1, "Ignore Enemy DEF +40%"), chance("red", 1, "Ignore Enemy DEF +40%")]).toEqual([0.9756, 0.4878]);
    expect(potentialOptions("hat", 250).legendary![0]!.find((o) => o.line === "Max HP +12%")?.chance).toBe(9.7561);
    for (const cube of ["black", "red"] as const) {
      const sum = potentialOptions("hat", 250, cube).legendary![0]!.reduce((t, o) => t + o.chance, 0);
      expect(Math.round(sum)).toBe(100);
    }
  });

  it("all four ranks, three lines each, for both cubes", () => {
    for (const cube of ["black", "red"] as const) {
      const o = potentialOptions("hat", 200, cube);
      expect(Object.keys(o).sort()).toEqual(["epic", "legendary", "rare", "unique"]);
      expect(Object.values(o).map((positions) => positions!.length)).toEqual([3, 3, 3, 3]);
    }
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

  it("every listed item's potential category, and every kind a typed item can be, has Nexon's tables for both cubes", () => {
    const parts = new Set([...gearFile().items.flatMap((i) => (i.potential ? [i.potential] : [])), ...POTENTIAL_KINDS]);
    const missing = [...parts].filter((p) => (["black", "red"] as const).some((c) => Object.keys(potentialOptions(p, 200, c)).length === 0 || Object.keys(potentialOptions(p, 100, c)).length === 0));
    expect(missing).toEqual([]);
    expect(parts.size).toBeGreaterThanOrEqual(17);
  });

  it("every kind and level range Nexon has lists all four ranks, and both cubes the same lines in each (only the chances differ)", () => {
    const { cubes, lines, tables } = potentialFile();
    const shape = (t: number) => tables[t]!.map((slot) => slot.map(([i]) => lines[i]).sort());
    let checked = 0;
    for (const [part, levels] of Object.entries(cubes.black)) {
      for (const [level, ranks] of Object.entries(levels)) {
        expect(Object.keys(ranks).sort()).toEqual(["epic", "legendary", "rare", "unique"]);
        for (const [rank, table] of Object.entries(ranks)) {
          expect(shape(cubes.red[part]![level]![rank as "rare"]!)).toEqual(shape(table));
          checked += 1;
        }
      }
    }
    expect(Object.keys(cubes.red).sort()).toEqual(Object.keys(cubes.black).sort());
    expect(checked).toBe(1400);
  });

  it("an unknown kind of item has nothing", () => {
    expect(potentialOptions("tail", 200)).toEqual({});
  });
});

describe("nearestLine: a saved line the item can't roll any more becomes the nearest one it can", () => {
  const weapon = ["Boss Damage +30%", "Boss Damage +35%", "Boss Damage +40%", "Max HP +12%", "Max HP +9%", "10% chance to ignore 20% damage when hit", "10% chance to ignore 40% damage when hit"];
  it("the same kind of line with the closest value", () => {
    expect(nearestLine("Boss Damage +45%", weapon)).toBe("Boss Damage +40%");
    expect(nearestLine("Max HP +13%", weapon)).toBe("Max HP +12%");
    expect(nearestLine("Max HP +10%", weapon)).toBe("Max HP +9%");
    expect(nearestLine("10% chance to ignore 35% damage when hit", weapon)).toBe("10% chance to ignore 40% damage when hit");
  });
  it("a line it can still roll stays; a kind it can't roll at all is dropped", () => {
    expect(nearestLine("Boss Damage +35%", weapon)).toBe("Boss Damage +35%");
    expect(nearestLine("Enables <Decent Haste>", ["Enables <Decent Sharp Eyes>", "Enables <Decent Haste>"])).toBe("Enables <Decent Haste>");
    expect(nearestLine("Enables <Decent Holy Symbol>", ["Enables <Decent Haste>"])).toBeNull();
    expect(nearestLine("Ignore Enemy DEF +45%", weapon)).toBeNull();
    expect(nearestLine("Boss Damage +40%", [])).toBeNull();
  });
});
