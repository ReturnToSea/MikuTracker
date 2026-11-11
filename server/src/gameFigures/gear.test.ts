import { beforeAll, describe, expect, it } from "vitest";
import { fits, GEAR_SLOTS, type GearItem, gearFile, itemKey, RING_SLOTS } from "./gear";

// Facts the item list must always hold, so a rebuild after a patch (scripts/gear-data.mjs) can't
// quietly break the gear tab.
// Read before the tests, not on import, and a broken gearFile leaves the list empty: the tests then
// fail, instead of the whole file (which mutation testing would count as nothing failing).
let items: GearItem[] = [];
let jobs: ReturnType<typeof gearFile>["jobs"] = {};
beforeAll(() => {
  try {
    ({ items, jobs } = gearFile());
  } catch {
    // the tests below fail on the empty list
  }
});
const named = (name: string) => items.find((i) => i.name === name)!;

describe("the gear list", () => {
  it("every item has its own key, a slot of the window, and an icon file", () => {
    expect(new Set(items.map(itemKey)).size).toBe(items.length);
    const kinds = new Set(GEAR_SLOTS.map((s) => s.kind));
    expect(items.filter((i) => !kinds.has(i.slot))).toEqual([]);
    expect(items.filter((i) => !/^Eqp .+\.png$/.test(i.file))).toEqual([]);
    expect(items.filter((i) => !/^\d{7}$/.test(String(i.id)))).toEqual([]);
  });

  it("weapons have a type some job uses; only weapons are lucky; overalls are tops", () => {
    const used = new Set(Object.values(jobs).flatMap((j) => j.weapons));
    expect(items.filter((i) => i.slot === "weapon" && !used.has(i.weaponType!))).toEqual([]);
    expect(items.filter((i) => (i.slot === "weapon") !== (i.weaponType !== undefined))).toEqual([]);
    expect(items.filter((i) => i.lucky && i.slot !== "weapon")).toEqual([]);
    expect(items.filter((i) => i.overall && i.slot !== "top")).toEqual([]);
    expect(named("Genesis Badge")).toMatchObject({ slot: "badge", group: "Pitched Boss" });
    expect(named("Genesis Badge").lucky).toBeUndefined();
  });

  it("every known job can fill its weapon and secondary slots", () => {
    for (const job of Object.keys(jobs)) {
      const can = (slot: string) => items.filter((i) => i.slot === slot && fits(i, job));
      expect([job, can("weapon").length > 0, can("secondary").length > 0]).toEqual([job, true, true]);
    }
  });

  it("the Oz rings: Restraint and Continuous Lv. 3–6 are active, Weapon Jump Lv. 3–4 passive, all keyed by level", () => {
    const oz = items.filter((i) => i.oz);
    expect(oz.map((i) => i.name)).toEqual([
      ...[3, 4, 5, 6].map((l) => `Ring of Restraint Lv. ${l}`),
      ...[3, 4, 5, 6].map((l) => `Continuous Ring Lv. ${l}`),
      ...["S", "D", "I", "L"].flatMap((s) => [3, 4].map((l) => `Weapon Jump ${s} Ring Lv. ${l}`)),
    ]);
    expect(oz.filter((i) => i.key !== `${i.id}-${i.oz!.level}` || i.slot !== "ring" || i.jobs !== null)).toEqual([]);
    expect(oz.filter((i) => i.oz!.kind === "active").every((i) => !i.name.startsWith("Weapon Jump"))).toBe(true);
  });

  it("the items the owner picked are there, and the Korean-only ones aren't (Sanguinary Spirit isn't any more: GMS has it from v.272)", () => {
    for (const name of ["Will o' the Wisps", "Ayame's Treasure", "Kanna's Treasure", "Heroic Tenebris Expedition Ring (Complete)", "Heroic Awake Ring (Lv. 4)", "Glory Guard Ring: Justicar", "Treasure Hunter John's Ring", "Seven Day Monster Parker", "Immortal Legacy", "Total Control", "Gold Maple Leaf Emblem", "Mitra's Rage: Thief", "Meister Earring"]) {
      expect(items.some((i) => i.name === name), name).toBe(true);
    }
    expect(items.filter((i) => i.slot === "heart").map((i) => i.name).sort()).toEqual(["Black Heart", "Fairy Heart", "Liquid-Metal Heart", "Outlaw Heart", "Plasma Heart", "Titanium Heart", "Total Control"]);
    expect(items.filter((i) => i.slot === "totem").map((i) => i.name)).toEqual(["Guild Castle Blue Brooch", "Guild Castle Red Brooch", "Guild Castle Green Brooch"]);
    expect(items.filter((i) => i.slot === "medal").map((i) => i.name).sort()).toEqual(["Immortal Legacy", "Seven Day Monster Parker"]);
    expect(items.some((i) => ["Lidium Heart", "Hayato's Treasure"].includes(i.name))).toBe(false);
    expect(items.find((i) => i.name === "Sanguinary Spirit")).toMatchObject({ slot: "eye", set: "Brilliant Boss", level: 250, flames: "boss" });
  });

  it("Lethe (v.272): a Magician with Dominiums; its weapons, and three of its four Quills (Astra Quill has no GMS wiki page yet)", () => {
    const of = (slot: string) => items.filter((i) => i.slot === slot && fits(i, "Lethe")).map((i) => i.name).sort();
    expect(of("weapon")).toEqual(["AbsoLab Treatise", "Arcane Umbra Dictio", "Destiny Dominium (Stage 1)", "Destiny Dominium (Stage 2)", "Fafnir Edict", "Genesis Dominium"]);
    expect(of("secondary")).toEqual(["Frozen Intempestus Quill", "Nox Quill", "Princess No's Quill"]);
    expect(items.find((i) => i.name === "Arcane Umbra Dictio")).toMatchObject({ level: 200, flames: "boss", stats: { int: 100, luk: 100, matt: 347 } });
  });

  it("Ren's and Night Walker's secondaries are the four agreed (shop, Frozen, Princess No, Astra)", () => {
    const secondaries = (job: string) => items.filter((i) => i.slot === "secondary" && fits(i, job)).map((i) => i.name).sort();
    expect(secondaries("Ren")).toEqual(["Astra Imugi Gem", "Frozen Imugi Gem", "Princess No's Imugi Gem", "Violet Imugi Gem"]);
    expect(secondaries("Night Walker")).toEqual(["Astra Obsidian", "Ereve Brilliance", "Frozen Ereve Brilliance", "Princess No's Floral Jewel"]);
  });

  it("the window has 4 ring slots plus the passive one, and every slot key once", () => {
    expect(RING_SLOTS).toEqual(["ring1", "ring2", "ring3", "ring4"]);
    expect(new Set(GEAR_SLOTS.map((s) => s.key)).size).toBe(GEAR_SLOTS.length);
    expect(GEAR_SLOTS.filter((s) => s.kind === "totem")).toHaveLength(3);
  });
});

describe("fits", () => {
  const item = (over: Partial<GearItem>): GearItem => ({ id: 1000000, name: "x", slot: "hat", jobs: null, level: 1, set: null, group: "g", file: "Eqp x.png", ...over });

  it("an item for anyone fits anyone, an unknown job too", () => {
    expect(fits(item({}), "Night Walker")).toBe(true);
    expect(fits(item({ jobs: ["Warrior"] }), "Some New Job")).toBe(true);
    expect(fits(item({ jobs: ["Warrior"] }), "constructor")).toBe(true); // not mistaken for a known job
    expect(fits(item({ slot: "weapon", jobs: ["Warrior"], weaponType: "Sword" }), "hasOwnProperty")).toBe(true);
  });

  it("by branch or by the job itself", () => {
    expect(fits(item({ jobs: ["Thief"] }), "Night Walker")).toBe(true);
    expect(fits(item({ jobs: ["Warrior"] }), "Night Walker")).toBe(false);
    expect(fits(item({ jobs: ["Night Walker"] }), "Night Walker")).toBe(true);
    expect(fits(item({ jobs: ["Night Lord"] }), "Night Walker")).toBe(false);
    expect(fits(item({ jobs: ["Pirate"] }), "Xenon")).toBe(true); // Thief and Pirate
    expect(fits(item({ jobs: ["Thief"] }), "Xenon")).toBe(true);
  });

  it("a weapon must also be one of the job's weapon types", () => {
    expect(fits(item({ slot: "weapon", jobs: ["Thief"], weaponType: "Claw" }), "Night Walker")).toBe(true);
    expect(fits(item({ slot: "weapon", jobs: ["Thief"], weaponType: "Dagger" }), "Night Walker")).toBe(false);
    expect(fits(item({ slot: "weapon", jobs: null, weaponType: "Dagger" }), "Night Walker")).toBe(true); // anyone's: not checked
    expect(fits(item({ slot: "weapon", jobs: ["Warrior"], weaponType: "Two-handed Sword" }), "Hero")).toBe(true);
  });
});
