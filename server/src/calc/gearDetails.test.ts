import { describe, expect, it } from "vitest";
import { classStatsOf, type DetailItem, flameGrid, otherStarLimit, starGains, starNotes, starRange } from "./gearDetails";

// Where an item's "weapon attack unknown" note starts (null: none), and whether a star is past it.
const unconfirmedFrom = (it: DetailItem) => starNotes(it).find((n) => n.text.includes("isn't known"))?.from ?? null;
const starUnconfirmed = (it: DetailItem, star: number) => star >= (unconfirmedFrom(it) ?? Infinity);

// Numbers worked out by hand from the wiki's tables (Star Force Enhancement/Stat Tables, Bonus
// Stats/Stat Tables), step by step, not by running the same code.
const item = (over: Partial<DetailItem>): DetailItem => ({ slot: "hat", level: 200, stats: { str: 65, dex: 65, att: 7 }, classStats: ["str", "dex"], starMin: 0, starMax: 30, flames: "boss", ...over });
const hat = item({});

describe("starGains: armor", () => {
  it("a Lv. 200 Warrior hat at 22★: STR/DEX +145, ATT/M.ATT +106, HP +260", () => {
    // stats: 5 × 2 + 10 × 3 (stars 1–15) + 7 × 15 (16★–22★) = 145; attack 12+13+14+15+16+17+19 = 106;
    // HP 5+5+10+10+10+15+15+20+20+25×6 = 260
    expect(starGains(hat, 22)).toEqual({ str: 145, dex: 145, int: 0, luk: 0, hp: 260, mp: 0, att: 106, matt: 106, speed: 0, jump: 0 });
  });

  it("stars past 22 add attack only: 25★ ATT +175, 30★ +315", () => {
    // 106 + 21 + 23 + 25 = 175; then + 26 + 27 + 28 + 29 + 30 = 315
    expect([starGains(hat, 25).att, starGains(hat, 30).att, starGains(hat, 30).str]).toEqual([175, 315, 145]);
  });

  it("0 stars add nothing; 1★ adds 2 class stats and 5 HP", () => {
    expect(starGains(hat, 0)).toEqual({ str: 0, dex: 0, int: 0, luk: 0, hp: 0, mp: 0, att: 0, matt: 0, speed: 0, jump: 0 });
    expect(starGains(hat, 1)).toMatchObject({ str: 2, dex: 2, hp: 5, att: 0 });
  });

  it("each level bracket's 16★: 128 → +7 stat/+7 ATT, 138 → 9/8, 150 → 11/9, 160 → 13/10, 200 → 15/12, 250 → 17/14", () => {
    const at16 = (level: number) => {
      const a = starGains(item({ level }), 16);
      const b = starGains(item({ level }), 15);
      return [a.str - b.str, a.att - b.att];
    };
    expect([128, 137, 138, 150, 160, 199, 200, 249, 250].map(at16)).toEqual([[7, 7], [7, 7], [9, 8], [11, 9], [13, 10], [13, 10], [15, 12], [15, 12], [17, 14]]);
  });

  it("every star adds the item's class stats: all four on an item any class wears (the wiki; masonym)", () => {
    const pendant = item({ slot: "pendant", stats: { str: 15, dex: 15, int: 15, luk: 15, att: 5 }, classStats: classStatsOf(null) });
    expect(starGains(pendant, 17)).toMatchObject({ str: 70, dex: 70, int: 70, luk: 70 }); // 40 + 2 × 15
    const strOnly = item({ stats: { str: 10 }, classStats: classStatsOf(null) });
    expect(starGains(strOnly, 16)).toMatchObject({ str: 55, dex: 55, int: 55, luk: 55 });
    // an item showing no main stat (a heart with only HP) still gets them: masonym gives all four to everything
    const heart = item({ slot: "heart", level: 160, stats: {}, classStats: classStatsOf(null) });
    expect(starGains(heart, 17)).toMatchObject({ str: 66, dex: 66, int: 66, luk: 66 }); // 40 + 2 × 13
    const warrior = item({ stats: {}, classStats: classStatsOf(["Warrior"]) });
    expect(starGains(warrior, 16)).toMatchObject({ str: 55, dex: 55, int: 0, luk: 0 });
  });

  it("gloves with only magic attack get magic attack; gloves with neither get none", () => {
    expect(starGains(item({ slot: "gloves", stats: { int: 10, matt: 3 } }), 15)).toMatchObject({ att: 0, matt: 7 });
    expect(starGains(item({ slot: "gloves", stats: { int: 10 } }), 15)).toMatchObject({ att: 0, matt: 0 });
  });

  it("gloves: no HP, +1 attack at 5, 7, 9, 11, 13, 14 and 15★ (only an attack they have)", () => {
    const gloves = item({ slot: "gloves", stats: { str: 20, dex: 20, att: 5 } });
    expect(starGains(gloves, 15)).toMatchObject({ hp: 0, att: 7, matt: 0 });
    expect([4, 5, 6, 12, 13].map((s) => starGains(gloves, s).att)).toEqual([0, 1, 1, 4, 5]);
  });

  it("shoes: no HP; speed and jump +1 from 3★ to 10★, +2 from 11★ to 15★", () => {
    const shoes = item({ slot: "shoes" });
    expect(starGains(shoes, 15)).toMatchObject({ hp: 0, speed: 18, jump: 18 }); // 8 × 1 + 5 × 2
    expect([2, 3, 10, 11].map((s) => starGains(shoes, s).speed)).toEqual([0, 1, 8, 10]);
  });

  it("face and eye accessories get no HP; belts, capes, rings and hearts do", () => {
    for (const slot of ["face", "eye"]) expect(starGains(item({ slot }), 5).hp).toBe(0);
    for (const slot of ["belt", "cape", "ring", "heart", "earrings"]) expect(starGains(item({ slot }), 5).hp).toBe(40);
  });

  it("an item below Lv. 128 stops gaining at 15★", () => {
    const low = item({ level: 120 });
    expect(starGains(low, 20)).toEqual(starGains(low, 15));
  });
});

describe("starGains: weapons", () => {
  it("1★–15★: +1 + 2% of the attack so far, compounding (base 100 → +15 at 5★)", () => {
    // 100 → 103 (1 + 2) → 106 (1 + ⌊2.06⌋) → 109 → 112 → 115
    const w = item({ slot: "weapon", level: 150, stats: { str: 40, dex: 40, att: 100 } });
    expect(starGains(w, 5)).toMatchObject({ att: 15, matt: 0, hp: 35, mp: 35, str: 10 }); // HP 5+5+5+10+10
  });

  it("Genesis Sword (Lv. 200, ATT 340) at its fixed 22★: ATT +228, STR/DEX +145", () => {
    // 15 compounding steps from 340 (by hand): +7 +7 +8 +8 +8 +8 +8 +8 +9 +9 +9 +9 +9 +9 +10 = 126,
    // then 16★–22★ (Lv. 200–249 weapons): 13+13+14+14+15+16+17 = 102
    const genesis = item({ slot: "weapon", stats: { str: 150, dex: 150, att: 340 }, starMin: 22, starMax: 22 });
    expect(starGains(genesis, 22)).toMatchObject({ att: 228, matt: 0, str: 145, dex: 145 });
    expect(starRange(genesis)).toEqual([22, 22]);
  });

  it("weapon 17★ in the first brackets is one more than 16★ (masonym; a Korean table for Fafnir)", () => {
    const step = (level: number, star: number) => {
      const w = item({ slot: "weapon", level, stats: { str: 1, att: 100 } });
      return starGains(w, star).att - starGains(w, star - 1).att;
    };
    expect([128, 138, 150, 160, 200].map((l) => [step(l, 16), step(l, 17)])).toEqual([[6, 7], [7, 8], [8, 9], [9, 9], [13, 13]]);
    expect([step(200, 23), step(200, 25), step(250, 23)]).toEqual([34, 36, 36]);
  });

  it("every weapon bracket's 16★+ attack and stats, as NamuWiki's table gives them", () => {
    const steps = (level: number, to: number) => {
      const w = item({ slot: "weapon", level, stats: { att: 100 }, classStats: ["str"] });
      return Array.from({ length: to - 15 }, (_, i) => [starGains(w, 16 + i).att - starGains(w, 15 + i).att, starGains(w, 16 + i).str - starGains(w, 15 + i).str]);
    };
    // [attack, stat] for each star from 16★ (NamuWiki: 130, 140, 150, 160, 200 and 250 weapons)
    expect(steps(130, 20)).toEqual([[6, 7], [7, 7], [7, 7], [8, 7], [9, 7]]);
    expect(steps(140, 25)).toEqual([[7, 9], [8, 9], [8, 9], [9, 9], [10, 9], [11, 9], [12, 9], [30, 0], [31, 0], [32, 0]]);
    expect(steps(150, 25)).toEqual([[8, 11], [9, 11], [9, 11], [10, 11], [11, 11], [12, 11], [13, 11], [31, 0], [32, 0], [33, 0]]);
    expect(steps(160, 25)).toEqual([[9, 13], [9, 13], [10, 13], [11, 13], [12, 13], [13, 13], [14, 13], [32, 0], [33, 0], [34, 0]]);
    expect(steps(200, 30)).toEqual([[13, 15], [13, 15], [14, 15], [14, 15], [15, 15], [16, 15], [17, 15], [34, 0], [35, 0], [36, 0], [37, 0], [38, 0], [39, 0], [40, 0], [41, 0]]);
    expect(steps(250, 22)).toEqual([[16, 17], [16, 17], [17, 17], [17, 17], [18, 17], [19, 17], [20, 17]]);
  });

  it("magic weapons: magic attack compounds (base 100 → +15 at 5★), then each bracket's figure", () => {
    const staff = item({ slot: "weapon", level: 150, stats: { int: 40, matt: 100 } });
    expect(starGains(staff, 5)).toMatchObject({ att: 0, matt: 15 });
    const at = (n: number) => starGains(staff, n).matt;
    expect(at(16) - at(15)).toBe(8); // Lv. 150–159 weapons' 16★
  });

  it("secondaries gain like armor (Nexon: Astra secondaries as Lv. 200 armor); kataras and Zero's Lapis like weapons", () => {
    const gem = item({ slot: "secondary", level: 200, type: "Imugi Gem", stats: { str: 20, dex: 20, att: 7 } });
    // armor: HP but no MP, no compounding attack below 16★; Lv. 200 armor's 16★–30★ attack (106 at 22★)
    expect(starGains(gem, 5)).toMatchObject({ att: 0, hp: 40, mp: 0 });
    expect(starGains(gem, 22)).toMatchObject({ att: 106, matt: 106, str: 145 });
    expect(starUnconfirmed(gem, 30)).toBe(false);
    const katara = item({ slot: "secondary", level: 160, type: "Katara", stats: { luk: 20, att: 100 } });
    expect(starGains(katara, 5)).toMatchObject({ att: 15, hp: 35, mp: 35 }); // the weapon figures
    expect(starUnconfirmed(katara, 26)).toBe(true);
    const lapis = item({ slot: "secondary", level: 200, type: "Heavy Sword", stats: { str: 100, att: 100 } });
    expect(starGains(lapis, 5).att).toBe(15);
  });

  it("magic weapons gain magic attack, physical ones attack", () => {
    const staff = item({ slot: "weapon", level: 150, stats: { int: 40, matt: 100 } });
    expect(starGains(staff, 16)).toMatchObject({ att: 0 });
    expect(starGains(staff, 16).matt).toBeGreaterThan(0);
  });

  it("unconfirmed figures: Lv. 138–199 weapons from 26★, Lv. 250 weapons from 23★; Lv. 200–249 all confirmed", () => {
    const w = item({ slot: "weapon", level: 160 });
    expect([starUnconfirmed(w, 25), starUnconfirmed(w, 26), starUnconfirmed(hat, 30), starUnconfirmed(item({ slot: "weapon" }), 30)]).toEqual([false, true, false, false]);
    expect([starUnconfirmed(item({ slot: "weapon", level: 250 }), 22), starUnconfirmed(item({ slot: "weapon", level: 250 }), 23)]).toEqual([false, true]);
    expect(starUnconfirmed(item({ slot: "weapon", level: 128 }), 20)).toBe(false);
    expect(starUnconfirmed(item({ slot: "weapon", level: 120 }), 15)).toBe(false); // below every bracket
    // the first unconfirmed star, if the item can reach it
    expect([unconfirmedFrom(item({ slot: "weapon", level: 160 })), unconfirmedFrom(item({ slot: "weapon", level: 250, starMax: 25 })), unconfirmedFrom(item({ slot: "weapon", level: 160, starMax: 26 })), unconfirmedFrom(item({ slot: "weapon", level: 160, starMax: 25 })), unconfirmedFrom(item({ slot: "weapon", level: 250, starMax: 22 })), unconfirmedFrom(item({ slot: "weapon" }))]).toEqual([26, 23, 26, null, null, null]);
    expect([unconfirmedFrom(hat), unconfirmedFrom(item({ slot: "weapon", level: 120, starMax: 15 }))]).toEqual([null, null]);
    expect(unconfirmedFrom(item({ level: 160 }))).toBeNull(); // armor: its figures are all known, even where the same level's weapons' aren't
    // shoes: their speed note from 11★ (masonym +2 from 11★, the wiki from 12★), only if they reach it
    expect(starNotes(item({ slot: "shoes" }))).toEqual([{ from: 11, text: "Speed and jump from 11★: masonym says +2 a star from 11★, the wiki from 12★ (a difference of 1)." }]);
    expect(starNotes(item({ slot: "shoes", level: 100, starMax: 8 }))).toEqual([]);
    expect(starNotes(item({ slot: "weapon", level: 160 }))).toEqual([{ from: 26, text: "From 26★ this weapon's attack isn't known from any source (nobody stars it that far): masonym's estimate." }]);
    expect(starNotes(hat)).toEqual([]);
  });
});

describe("star limits and class stats", () => {
  it("a typed item's limit follows its level; emblems, badges, pocket items, medals, totems none", () => {
    expect([otherStarLimit("hat", 94), otherStarLimit("hat", 95), otherStarLimit("hat", 107), otherStarLimit("hat", 108), otherStarLimit("hat", 117), otherStarLimit("hat", 118), otherStarLimit("hat", 127), otherStarLimit("hat", 128), otherStarLimit("hat", 137), otherStarLimit("hat", 138)]).toEqual([5, 8, 8, 10, 10, 15, 15, 20, 20, 30]);
    expect(["emblem", "badge", "pocket", "medal", "totem", "android"].map((s) => otherStarLimit(s, 200))).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it("starRange never starts above the limit", () => {
    expect(starRange(item({ starMin: 22, starMax: 15 }))).toEqual([15, 15]);
  });

  it("class stats by branch; Thief items don't get STR; anyone's get all four", () => {
    expect(classStatsOf(["Warrior"])).toEqual(["str", "dex"]);
    expect(classStatsOf(["Thief"])).toEqual(["dex", "luk"]);
    expect(classStatsOf(["Magician"])).toEqual(["int", "luk"]);
    expect(classStatsOf(["Bowman"])).toEqual(["str", "dex"]);
    expect(classStatsOf(["Pirate"])).toEqual(["str", "dex"]);
    expect(classStatsOf(["Thief", "Pirate"])).toEqual(["str", "dex", "luk"]); // Xenon
    expect(classStatsOf(null)).toEqual(["str", "dex", "int", "luk"]);
    expect(classStatsOf([])).toEqual(["str", "dex", "int", "luk"]);
  });
});

describe("flameGrid", () => {
  const value = (grid: ReturnType<typeof flameGrid>, stat: string, tier: number) => grid.find((r) => r.stat === stat)?.values[tier - 1];

  it("a Lv. 200 boss hat: tiers 3–7 only; STR T6 +66, STR+DEX T5 +30, HP T7 +4,200, ATT T5 +5", () => {
    const g = flameGrid(hat);
    expect([value(g, "STR", 6), value(g, "STR+DEX", 5), value(g, "Max HP", 7), value(g, "ATT", 5), value(g, "All Stats %", 4)]).toEqual([66, 30, 4200, 5, 4]);
    expect([value(g, "STR", 1), value(g, "STR", 2), value(g, "STR", 3)]).toEqual([null, null, 33]);
    expect(g.map((r) => r.stat)).toEqual(["STR", "DEX", "INT", "LUK", "STR+DEX", "STR+INT", "STR+LUK", "DEX+INT", "DEX+LUK", "INT+LUK", "Max HP", "Max MP", "Req. level", "Defense", "ATT", "M. ATT", "Speed", "Jump", "All Stats %"]);
  });

  it("every level bracket of the wiki's tables", () => {
    const at = (level: number, stat: string, tier: number) => value(flameGrid(item({ level, flames: "normal" })), stat, tier);
    // single stats: 1 per tier to Lv. 19, 2 at 20–39 … 10 at 180–199, 11 at 200–229, 12 from 230
    expect([0, 19, 20, 140, 180, 199, 200, 229, 230, 250].map((l) => at(l, "LUK", 1))).toEqual([1, 1, 2, 8, 10, 10, 11, 11, 12, 12]);
    // two-stat lines: 1 to Lv. 39 … 5 at 160–199, 6 at 200–249, 7 from 250
    expect([0, 39, 40, 160, 199, 200, 249, 250].map((l) => at(l, "DEX+LUK", 1))).toEqual([1, 1, 2, 5, 5, 6, 6, 7]);
    // HP: 3 below Lv. 10, 30 per 10 levels to 570 at 190–199, 600 at 200, +20 per 10 levels to 700
    expect([0, 9, 10, 150, 199, 200, 210, 249, 250, 300].map((l) => at(l, "Max HP", 1))).toEqual([3, 3, 30, 450, 570, 600, 620, 680, 700, 700]);
    expect([at(160, "STR", 3), at(250, "STR", 5), at(140, "Defense", 2), at(200, "Req. level", 3), at(200, "Speed", 4), at(200, "Jump", 5)]).toEqual([27, 60, 16, -15, 4, 5]);
    expect([at(200, "DEX", 2), at(200, "INT", 3), at(200, "Max MP", 4), at(200, "M. ATT", 5)]).toEqual([22, 33, 2400, 5]);
  });

  it("normal items: tiers 1–5", () => {
    const g = flameGrid(item({ flames: "normal" }));
    expect(g[0]!.values).toEqual([11, 22, 33, 44, 55, null, null]);
  });

  it("level rules: attack and magic attack from Lv. 60, all stats % from Lv. 70 (not weapons)", () => {
    const stats = (level: number) => flameGrid(item({ level })).map((r) => r.stat);
    expect([stats(59).includes("ATT"), stats(60).includes("ATT"), stats(59).includes("M. ATT"), stats(69).includes("All Stats %"), stats(70).includes("All Stats %")]).toEqual([false, true, false, false, true]);
  });

  it("weapons: boss damage (from Lv. 90) and damage %, no speed or jump; attack as a share of its own", () => {
    const genesis = item({ slot: "weapon", stats: { str: 150, dex: 150, att: 340 } });
    const g = flameGrid(genesis);
    expect(g.map((r) => r.stat)).toEqual(["STR", "DEX", "INT", "LUK", "STR+DEX", "STR+INT", "STR+LUK", "DEX+INT", "DEX+LUK", "INT+LUK", "Max HP", "Max MP", "Req. level", "Defense", "ATT", "M. ATT", "Boss damage %", "Damage %", "All Stats %"]);
    expect([value(g, "Boss damage %", 7), value(g, "Damage %", 7), value(g, "All Stats %", 3)]).toEqual([14, 7, 3]);
    // boss weapon, Lv. 200: (5 + 1) × tier × 1.1^(tier − 3) %, rounded up:
    // T3 18% of 340 = 61.2 → 62; T7 6 × 7 × 1.4641 = 61.4922% → 209.07 → 210
    expect([value(g, "ATT", 3), value(g, "ATT", 7)]).toEqual([62, 210]);
    expect(value(g, "M. ATT", 7)).toBe(210); // no magic attack: uses its attack (unconfirmed)
    expect(flameGrid(item({ slot: "weapon", level: 89 })).some((r) => r.stat === "Boss damage %")).toBe(false);
    expect(flameGrid(item({ slot: "weapon", level: 89 })).map((r) => r.stat)).toContain("STR"); // only boss damage waits for Lv. 90
    expect(flameGrid(item({ slot: "weapon", level: 90 })).some((r) => r.stat === "Boss damage %")).toBe(true);
  });

  it("weapon attack flames: non-boss weapons use 1.1^(tier − 1); a whole number stays whole", () => {
    const w = (att: number, flames: "boss" | "normal") => item({ slot: "weapon", level: 200, stats: { att }, flames });
    // normal, Lv. 200, T1: 6 × 1 × 1 = 6% of 100 = 6; T5: 6 × 5 × 1.4641 = 43.923% → 43.92 → 44
    expect([value(flameGrid(w(100, "normal")), "ATT", 1), value(flameGrid(w(100, "normal")), "ATT", 5)]).toEqual([6, 44]);
    // boss, Lv. 200, T4: 6 × 4 × 1.1 = 26.4% of 250 = exactly 66 (66.00000000000001 in decimal maths)
    expect(value(flameGrid(w(250, "boss")), "ATT", 4)).toBe(66);
    const staff = item({ slot: "weapon", level: 200, stats: { matt: 250 } });
    expect(value(flameGrid(staff), "M. ATT", 4)).toBe(66);
    // a normal magic weapon: 1.1^(tier − 1); T2: 6 × 2 × 1.1 = 13.2% of 250 = exactly 33
    expect(value(flameGrid({ ...staff, flames: "normal" }), "M. ATT", 2)).toBe(33);
  });

  it("an item that can't have flames has no grid", () => {
    expect(flameGrid(item({ flames: null }))).toEqual([]);
  });
});
