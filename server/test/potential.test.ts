import { STAT_VALUE_DEFAULTS } from "@miku/shared";
import { describe, expect, it } from "vitest";
import { stopScore } from "../src/calc/flames";
import { cubesToReach, linePoints, rollDistribution } from "../src/calc/potential";
import { jobStats } from "../src/gameFigures/jobStats";
import { potentialOptions } from "../src/gameFigures/potential";
import { db } from "../src/db";
import { SOLE_OWNER } from "../src/owner";
import { api, ok } from "./api";
import { NOW, useDbTestSetup } from "./helpers";

useDbTestSetup();

// Real items from gear-items.json.
const ARCANE_KNIGHT_HAT = "1004808"; // Lv. 200 hat
const GENESIS_SWORD = "1215024"; // Lv. 200 weapon, comes with 22★
const GOLLUX_BELT = "1132246"; // Lv. 150 belt
const SILVER_BLOSSOM_RING = "1113149"; // Lv. 110 ring
const STONE_OF_LIFE = "1162009"; // a pocket item: no potential

let made = 0;
async function character(job = "Ren", ownerId = SOLE_OWNER) {
  const name = `Char${++made}`;
  const c = await db().character.create({ data: { ownerId, worldId: 45, name, nameKey: name.toLowerCase(), job, level: 270, exp: 0n, worldRank: 1, sortOrder: made, addedAt: NOW, checkedAt: NOW } });
  return c.id;
}
const wear = (id: number, slot: string, body: object) => ok(api().put(`/api/gear/${id}/${slot}`).send(body));
const potential = (id: number, slot: string, rank: string, lines: (string | null)[], stars = 0, other?: object) =>
  ok(api().put(`/api/gear/${id}/${slot}/details`).send({ stars, flames: {}, potential: { rank, lines }, hammers: 0, ...(other ? { other } : {}) }));
const board = async (id: number, query = "budget=10000000000") => (await ok(api().get(`/api/gear/${id}/potential?${query}`))).body;
type Metrics = { better: number; rankUp: number; cubesToBetter: number | null; mesoToBetter: number | null; gainIfBetter: number | null; mesoPerFd: number | null; price: number; cubesForChance: { chance: number; cubes: number | null }[] };
type Item = { slot: string; name: string; level: number; starMin: number; ied: number; rank: string | null; lines: (string | null)[]; options: Record<string, string[][]>; points: Record<string, number>; score: number; best: number; cubes: { glowing: Metrics; bright: Metrics }; cooldown: { sec: number; min: number; points: number[] } | null; cheaper: string | null; stop: { score: number; reached: boolean; cube: string; cubes: number; meso: number } | null };
const item = (b: { items: Item[] }, slot: string) => b.items.find((i) => i.slot === slot)!;

describe("GET /api/gear/:id/potential", () => {
  it("only the items that can have potential, with their saved lines' score, cheapest per 1% final damage first", async () => {
    const id = await character();
    await wear(id, "hat", { item: ARCANE_KNIGHT_HAT });
    await wear(id, "weapon", { item: GENESIS_SWORD });
    await wear(id, "belt", { item: GOLLUX_BELT });
    await wear(id, "ring1", { item: SILVER_BLOSSOM_RING });
    await wear(id, "pocket", { other: "Typed pocket, no details yet" });
    // the hat (Ren, the defaults): STR 13% × 12.97 + STR 10% × 12.97 + cooldown (no value yet: 0) = 168.61 + 129.7
    await potential(id, "hat", "legendary", ["STR +13%", "STR +10%", "Skill Cooldown -2 sec"]);
    // the weapon: ATT 13% × 53.82 + boss 40% × 12 + IED 35% × 20.52 = 699.66 + 480 + 718.2
    await potential(id, "weapon", "legendary", ["ATT +13%", "Boss Damage +40%", "Ignore Enemy DEF +35%"], 22);
    const b = await board(id);
    expect([b.known, b.budget, b.prices]).toEqual([true, 10e9, { glowing: 12_000_000, bright: 22_000_000 }]);
    expect(b.items.map((i: Item) => i.slot).sort()).toEqual(["belt", "hat", "ring1", "weapon"]);
    expect([item(b, "hat").score, item(b, "hat").rank, item(b, "hat").lines]).toEqual([298.31, "legendary", ["STR +13%", "STR +10%", "Skill Cooldown -2 sec"]]);
    expect(item(b, "weapon").score).toBe(1897.86);
    expect([item(b, "weapon").starMin, item(b, "hat").starMin]).toEqual([22, 0]);
    // nothing saved: no rank (counted as Rare with no lines)
    expect([item(b, "belt").rank, item(b, "belt").lines, item(b, "belt").score]).toEqual([null, [null, null, null], 0]);
    const costs = b.items.map((i: Item) => (i.cheaper ? i.cubes[i.cheaper as "glowing"].mesoPerFd! : Infinity));
    expect(costs).toEqual([...costs].sort((x, y) => x - y));
    expect(costs.every(Number.isFinite)).toBe(true);
  });

  it("never an item that can't have potential: a listed pocket item, a typed one, nor one the list no longer has", async () => {
    const id = await character();
    await wear(id, "pocket", { item: STONE_OF_LIFE });
    await wear(id, "badge", { other: "Typed badge" });
    await ok(api().put(`/api/gear/${id}/badge/details`).send({ stars: 0, flames: {}, potential: null, hammers: 0, other: { kind: "badge", level: 140, boss: false, att: 0, matt: 0 } }));
    await wear(id, "hat", { item: ARCANE_KNIGHT_HAT });
    // saved before: a potential on the pocket item, and an item the list doesn't have any more
    await db().gearSlot.update({ where: { characterId_slot: { characterId: id, slot: "pocket" } }, data: { details: JSON.stringify({ stars: 0, flames: {}, potential: { rank: "rare", lines: ["STR +3%", null, null] }, hammers: 0 }) } });
    await db().gearSlot.create({ data: { characterId: id, slot: "medal", item: "9999999", details: JSON.stringify({ stars: 0, flames: {}, potential: { rank: "rare", lines: ["STR +3%", null, null] }, hammers: 0 }) } });
    expect((await board(id)).items.map((i: Item) => i.slot)).toEqual(["hat"]);
    // the Equipment page still loads, the pocket's saved details as saved
    const gear = (await ok(api().get("/api/gear?world=45"))).body.characters[0];
    expect(gear.details.pocket.potential).toEqual({ rank: "rare", lines: ["STR +3%", null, null] });
    expect(gear.details.medal.potential.lines).toEqual(["STR +3%", null, null]);
  });

  it("details saved without potential: no rank, no lines", async () => {
    const id = await character();
    await wear(id, "hat", { item: ARCANE_KNIGHT_HAT });
    await ok(api().put(`/api/gear/${id}/hat/details`).send({ stars: 17, flames: {}, potential: null, hammers: 0 }));
    expect(item(await board(id), "hat")).toMatchObject({ rank: null, lines: [null, null, null], score: 0 });
  });

  it("the best lines can't be beaten: no cheaper cube and no meso figures", async () => {
    const id = await character();
    await wear(id, "hat", { item: ARCANE_KNIGHT_HAT });
    // 3 × STR 13% × 12.97 = 505.83, the best a Lv. 200 hat can roll for a Ren (all stats 10% is 146.5)
    await potential(id, "hat", "legendary", ["STR +13%", "STR +13%", "STR +13%"]);
    const hat = item(await board(id), "hat");
    expect([hat.score, hat.best, hat.cheaper, hat.cubes.glowing.mesoPerFd, hat.cubes.bright.mesoPerFd, hat.cubes.bright.better]).toEqual([505.83, 505.83, null, null, null, 0]);
  });

  it("the cheaper cube is the one with the lower meso per 1% final damage; the stop score the higher of each cube's, reached the cheaper way", async () => {
    const id = await character();
    await wear(id, "hat", { item: ARCANE_KNIGHT_HAT });
    await potential(id, "hat", "unique", ["STR +10%", "STR +7%", null]);
    await wear(id, "weapon", { item: GENESIS_SWORD });
    await potential(id, "weapon", "legendary", ["ATT +13%", "Boss Damage +40%", "Ignore Enemy DEF +35%"], 22);
    await wear(id, "belt", { item: GOLLUX_BELT });
    await wear(id, "top", { item: "1042433" }); // Eternal Knight Armor, Lv. 250
    await potential(id, "top", "legendary", ["STR +13%", "STR +10%", "STR +10%"]);
    // 100B per 1%: high enough that some ways there are Bright's
    const b = await board(id, "budget=100000000000");
    const ren = jobStats("Ren", ["Warrior"])!;
    const points = (l: string) => linePoints(l, ren, STAT_VALUE_DEFAULTS);
    for (const it of b.items as Item[]) {
      const { glowing, bright } = it.cubes;
      expect(it.cheaper).toBe(glowing.mesoPerFd! < bright.mesoPerFd! ? "glowing" : "bright");
      // each cube's own stop score at Legendary (the Flames maths), and its way there from where the item is
      const part = it.slot === "weapon" ? "weapon" : it.slot;
      const rolls = (cube: "black" | "red", up: number[]) => ({ ranks: (["rare", "epic", "unique", "legendary"] as const).map((r) => rollDistribution(potentialOptions(part, it.level, cube)[r]!, points, STAT_VALUE_DEFAULTS.ied380)), rankUp: up });
      const red = rolls("red", [0.14, 0.06, 0.025]);
      const black = rolls("black", [0.17, 0.11, 0.05]);
      const at = Math.max(stopScore(red.ranks[3]!, 12e6, 0.785, 100e9)!, stopScore(black.ranks[3]!, 22e6, 0.785, 100e9)!);
      expect(it.stop!.score).toBe(at);
      const from = ["rare", "epic", "unique", "legendary"].indexOf(it.rank ?? "rare");
      const ways = [
        { cube: "glowing", meso: cubesToReach(red, from, at)! * 12e6 },
        { cube: "bright", meso: cubesToReach(black, from, at)! * 22e6 },
      ].sort((x, y) => x.meso - y.meso);
      expect([it.stop!.cube, it.stop!.meso]).toEqual([ways[0]!.cube, expect.closeTo(ways[0]!.meso, 0)]);
    }
    // the two cubes don't always agree: Bright is cheaper for the weapon and top, Glowing for the others; the ways there differ too
    expect(Object.fromEntries(b.items.map((i: Item) => [i.slot, i.cheaper]))).toEqual({ belt: "glowing", hat: "glowing", weapon: "bright", top: "bright" });
    expect(Object.fromEntries(b.items.map((i: Item) => [i.slot, i.stop!.cube]))).toEqual({ belt: "bright", hat: "glowing", weapon: "glowing", top: "glowing" });
  });

  it("each cube's figures fit together: at Legendary a fixed chance a cube; below it, the rank-up chance and more cubes", async () => {
    const id = await character();
    await wear(id, "hat", { item: ARCANE_KNIGHT_HAT });
    await potential(id, "hat", "legendary", ["STR +13%", "STR +10%", "STR +10%"]);
    await wear(id, "belt", { item: GOLLUX_BELT });
    const b = await board(id);
    const hat = item(b, "hat");
    for (const cube of ["glowing", "bright"] as const) {
      const m = hat.cubes[cube];
      expect(m.rankUp).toBe(0);
      expect(m.cubesToBetter).toBeCloseTo(1 / m.better, 6);
      expect(m.mesoToBetter).toBeCloseTo(m.cubesToBetter! * m.price, 0);
      // meso per 1% FD: the meso to a better roll ÷ (the gain × 0.785 / 100)
      expect(m.mesoPerFd).toBeCloseTo(m.mesoToBetter! / ((m.gainIfBetter! * 0.785) / 100), -2);
      expect(m.cubesForChance.map((c) => c.chance)).toEqual([0.25, 0.5, 0.7, 0.99]);
      // 1 − (1 − p)ⁿ ≥ 50%
      expect(m.cubesForChance[1]!.cubes).toBe(Math.ceil(Math.log(0.5) / Math.log(1 - m.better) - 1e-9));
    }
    // the belt starts at Rare: the spreadsheet's rank-up chances, Glowing 14% and Bright 17%
    expect([item(b, "belt").cubes.glowing.rankUp, item(b, "belt").cubes.bright.rankUp]).toEqual([0.14, 0.17]);
    // Bright's 2nd and 3rd lines roll prime lines more often: it beats a good hat more often
    expect(hat.cubes.bright.better).toBeGreaterThan(hat.cubes.glowing.better);
    expect(hat.best).toBeGreaterThan(hat.score);
  });

  it("Double Miracle Time doubles the rank-up chances; a cube sale takes 25% off both cubes", async () => {
    const id = await character();
    await wear(id, "belt", { item: GOLLUX_BELT });
    await potential(id, "belt", "epic", ["STR +6%", "STR +3%", "DEX +3%"]);
    const plain = item(await board(id), "belt");
    const miracle = item(await board(id, "budget=1e10&events=miracle"), "belt");
    expect([miracle.cubes.glowing.rankUp, miracle.cubes.bright.rankUp]).toEqual([0.12, 0.22]);
    expect(miracle.cubes.glowing.cubesToBetter!).toBeLessThan(plain.cubes.glowing.cubesToBetter!);
    const sale = await board(id, "budget=1e10&events=sale");
    expect(sale.prices).toEqual({ glowing: 9_000_000, bright: 16_500_000 });
    expect(item(sale, "belt").cubes.bright.mesoToBetter).toBeCloseTo(plain.cubes.bright.mesoToBetter! * 0.75, 0);
    expect(item(sale, "belt").cubes.bright.cubesToBetter).toBe(plain.cubes.bright.cubesToBetter);
    expect((await api().get(`/api/gear/${id}/potential?budget=1&events=free`)).status).toBe(400);
  });

  it("the character's stat values change the scores: a typed cooldown value (2 s), and the bosses' defense", async () => {
    const id = await character();
    await wear(id, "hat", { item: ARCANE_KNIGHT_HAT });
    await potential(id, "hat", "legendary", ["STR +13%", "STR +10%", "Skill Cooldown -2 sec"]);
    await wear(id, "weapon", { item: GENESIS_SWORD });
    await potential(id, "weapon", "legendary", ["ATT +13%", "Boss Damage +40%", "Ignore Enemy DEF +35%"], 22);
    const defaults = (await ok(api().get("/api/gear?world=45"))).body.characters[0].statValues.values;
    await ok(api().put(`/api/gear/${id}/stat-values`).send({ ...defaults, cd2: 6, bossDef: 300 }));
    const b = await board(id);
    // + 2 s at 6% ÷ 0.785 × 100 = 764.33
    expect(item(b, "hat").score).toBe(1062.64);
    // IED 35% × 15.6 (300% defense) = 546
    expect(item(b, "weapon").score).toBe(1725.66);
    expect(item(b, "weapon").ied).toBe(15.6);
  });

  it("skill cooldown as a table (v2.4.1): a hat's seconds add up and count by the table; a blank box takes the one below", async () => {
    const id = await character();
    await wear(id, "hat", { item: ARCANE_KNIGHT_HAT });
    await potential(id, "hat", "legendary", ["STR +13%", "Skill Cooldown -2 sec", "Skill Cooldown -2 sec"]);
    await wear(id, "weapon", { item: GENESIS_SWORD });
    await potential(id, "weapon", "legendary", ["ATT +13%", "Boss Damage +40%", "Ignore Enemy DEF +35%"], 22);
    const defaults = (await ok(api().get("/api/gear?world=45"))).body.characters[0].statValues.values;
    // the Ren Discord's 2 and 4 s (3, 5 and 6 s left blank)
    await ok(api().put(`/api/gear/${id}/stat-values`).send({ ...defaults, cd2: 1.37, cd4: 3.34 }));
    const b = await board(id);
    // STR 13% 168.61 + 4 s 3.34 ÷ 0.785 × 100 = 425.48 (not twice 2 s's 174.52)
    expect(item(b, "hat").score).toBe(594.09);
    expect(item(b, "hat").cooldown).toEqual({ sec: 4, min: 0, points: [0, 0, 174.52, 174.52, 425.48, 425.48, 425.48] });
    expect(item(b, "weapon").cooldown).toBeNull();
  });

  it("a hat's minimum cooldown: only rolls that keep it count; a hat under it takes any that does (brendonmay's odds)", async () => {
    const id = await character();
    await wear(id, "hat", { item: ARCANE_KNIGHT_HAT });
    await potential(id, "hat", "legendary", ["STR +13%", "STR +10%", "Skill Cooldown -2 sec"]);
    await wear(id, "weapon", { item: GENESIS_SWORD });
    await potential(id, "weapon", "legendary", ["ATT +13%", "Boss Damage +40%", "Ignore Enemy DEF +35%"], 22);
    const defaults = (await ok(api().get("/api/gear?world=45"))).body.characters[0].statValues.values;
    const before = await board(id);
    await ok(api().put(`/api/gear/${id}/stat-values`).send({ ...defaults, cd2: 1.37, cd4: 3.34, cdMin: 4 }));
    const b = await board(id);
    const hat = item(b, "hat");
    // 2 s, 4 needed: any roll with 4 s or more beats it. Lv. 200 Legendary hats roll at least 4 s 0.062523%
    // of the time with Bright, 0.026487% with Glowing (brendonmay's engine gives the same)
    expect(hat.cooldown).toMatchObject({ sec: 2, min: 4 });
    expect(hat.cubes.bright.better).toBeCloseTo(0.00062523, 8);
    expect(hat.cubes.glowing.better).toBeCloseTo(0.00026487, 8);
    expect(hat.cubes.bright.mesoToBetter).toBeCloseTo(22e6 / hat.cubes.bright.better, -3);
    // the gain is from its real score (STR 23% 298.31 + 2 s 174.52): a 4 s roll's 425.48 and a little stat is less
    expect(hat.score).toBe(472.83);
    expect(hat.cubes.bright.gainIfBetter).toBeLessThan(0);
    expect([hat.cubes.bright.mesoPerFd, hat.cubes.glowing.mesoPerFd]).toEqual([null, null]);
    // so the cheaper way to a roll that keeps it: Bright (1 in 1,599 at 22m) over Glowing (1 in 3,775 at 12m)
    expect(hat.cheaper).toBe("bright");
    // listed last (no meso per 1%); the weapon is untouched
    expect(b.items.at(-1).slot).toBe("hat");
    expect(item(b, "weapon").cubes).toEqual(item(before, "weapon").cubes);
    // its graph leaves out the rolls that don't keep it, giving their share
    const g = (await ok(api().get(`/api/gear/${id}/potential/hat`))).body;
    expect(g.cubes.bright.short).toBeCloseTo(1 - 0.00062523, 8);
    expect(g.cubes.bright.distribution.reduce((sum: number, [, p]: [number, number]) => sum + p, 0)).toBeCloseTo(0.00062523, 8);
    expect(Math.min(...g.cubes.bright.distribution.map(([s]: [number, number]) => s))).toBeGreaterThanOrEqual(425.48);
    expect(item(before, "hat").cheaper).not.toBeNull();
    // Targets: under its minimum it hasn't reached its stop score, whatever its lines score
    // (a budget so low the stop score is the lowest: any lines would have reached it)
    const targets = await board(id, "budget=1");
    expect(item(targets, "hat").stop).toMatchObject({ reached: false });
    expect(item(targets, "hat").stop!.cubes).toBeGreaterThan(1000);
  });

  it("a hat under a 2 s minimum, no table typed: Glowing is the cheaper way to a roll that keeps it (1 in ~18 at 12m)", async () => {
    const id = await character();
    await wear(id, "hat", { item: ARCANE_KNIGHT_HAT });
    await potential(id, "hat", "legendary", ["STR +13%", "STR +10%", null]);
    const defaults = (await ok(api().get("/api/gear?world=45"))).body.characters[0].statValues.values;
    await ok(api().put(`/api/gear/${id}/stat-values`).send({ ...defaults, cdMin: 2 }));
    const hat = item(await board(id), "hat");
    // a roll that keeps 2 s has one stat line fewer: less than its lines, so neither cube is priced per 1%
    expect([hat.cubes.glowing.mesoPerFd, hat.cubes.bright.mesoPerFd]).toEqual([null, null]);
    expect(hat.cubes.glowing.mesoToBetter!).toBeLessThan(hat.cubes.bright.mesoToBetter!);
    expect(hat.cheaper).toBe("glowing");
  });

  it("no final damage value (0 per 100 score) and no minimum: no cube is the cheaper on any item", async () => {
    const id = await character();
    await wear(id, "hat", { item: ARCANE_KNIGHT_HAT });
    await potential(id, "hat", "legendary", ["STR +13%", "STR +10%", null]);
    await wear(id, "belt", { item: GOLLUX_BELT });
    const defaults = (await ok(api().get("/api/gear?world=45"))).body.characters[0].statValues.values;
    await ok(api().put(`/api/gear/${id}/stat-values`).send({ ...defaults, fdPer100: 0 }));
    const b = await board(id);
    expect(b.items.map((i: Item) => i.cheaper)).toEqual([null, null]);
    expect(item(b, "hat").cubes.bright.mesoToBetter).not.toBeNull();
  });

  it("a hat that keeps its minimum: a better roll must keep it too", async () => {
    const id = await character();
    await wear(id, "hat", { item: ARCANE_KNIGHT_HAT });
    await potential(id, "hat", "legendary", ["STR +13%", "STR +10%", "Skill Cooldown -2 sec"]);
    const defaults = (await ok(api().get("/api/gear?world=45"))).body.characters[0].statValues.values;
    await ok(api().put(`/api/gear/${id}/stat-values`).send({ ...defaults, cd2: 1.37, cd4: 3.34 }));
    const free = item(await board(id), "hat");
    await ok(api().put(`/api/gear/${id}/stat-values`).send({ ...defaults, cd2: 1.37, cd4: 3.34, cdMin: 2 }));
    const kept = item(await board(id), "hat");
    // the same score to beat, fewer rolls that beat it (some better ones have no cooldown line)
    expect(kept.score).toBe(free.score);
    expect(kept.cubes.bright.better).toBeLessThan(free.cubes.bright.better);
    expect(kept.cubes.bright.better).toBeGreaterThan(0);
    expect(kept.cubes.bright.mesoPerFd).not.toBeNull();
    const g = (await ok(api().get(`/api/gear/${id}/potential/hat`))).body;
    expect(g.cubes.bright.short).toBeGreaterThan(0.9);
    const free0 = (await ok(api().put(`/api/gear/${id}/stat-values`).send({ ...defaults, cd2: 1.37, cd4: 3.34 })), (await ok(api().get(`/api/gear/${id}/potential/hat`))).body);
    expect(free0.cubes.bright.short).toBe(0);
  });

  it("an item's ignore defense lines multiply, as in game", async () => {
    const id = await character();
    await wear(id, "weapon", { item: GENESIS_SWORD });
    // 40% and 35% IED: 1 − 0.6 × 0.65 = 61% × 20.52 = 1251.72, + boss 40% × 12 = 480
    await potential(id, "weapon", "legendary", ["Ignore Enemy DEF +40%", "Ignore Enemy DEF +35%", "Boss Damage +40%"], 22);
    expect(item(await board(id), "weapon").score).toBe(1731.72);
  });

  it("stop scores for the budget: the higher of the two cubes' (each past where cubing on costs more), reached or not", async () => {
    const id = await character();
    await wear(id, "hat", { item: ARCANE_KNIGHT_HAT });
    await potential(id, "hat", "legendary", ["STR +13%", "STR +10%", "STR +10%"]);
    await wear(id, "belt", { item: GOLLUX_BELT });
    const low = await board(id, "budget=1000000000");
    const high = await board(id, "budget=1000000000000");
    const belt = item(low, "belt").stop!;
    expect(belt.reached).toBe(false);
    expect(belt.score).toBeLessThan(item(high, "belt").stop!.score);
    expect(belt.meso).toBeCloseTo(belt.cubes * low.prices[belt.cube], 0);
    // the hat (428.01): cubing on costs about 156B per 1% (Bright), so it's past where 1B per 1% stops, not
    // where 1,000B does
    expect(item(low, "hat").stop!.reached).toBe(true);
    expect(item(high, "hat").stop!.reached).toBe(false);
    expect(item(low, "hat").cubes.bright.mesoPerFd!).toBeGreaterThan(100e9);
    expect(item(low, "hat").cubes.bright.mesoPerFd!).toBeLessThan(1000e9);
    expect(item(await board(id, "budget=0"), "hat").stop).toBeNull();
  });

  it("what each line can be at each rank, best first, with what it adds", async () => {
    const id = await character();
    await wear(id, "hat", { item: ARCANE_KNIGHT_HAT });
    const hat = item(await board(id), "hat");
    expect(Object.keys(hat.options).sort()).toEqual(["epic", "legendary", "rare", "unique"]);
    expect(hat.options.legendary![0]![0]).toBe("STR +13%");
    expect(hat.options.legendary![0]).toContain("Skill Cooldown -2 sec");
    expect([hat.points["STR +13%"], hat.points["DEX +13%"], hat.points["INT +13%"], hat.points["Skill Cooldown -2 sec"]]).toEqual([168.61, 21.84, 0, 0]);
  });

  it("a saved line the item can't roll any more (Lv. 151+ values corrected) reads as the nearest one it can", async () => {
    const id = await character();
    await wear(id, "weapon", { item: GENESIS_SWORD });
    // saved before v2.3.0, with Korea's Lv. 201+ values
    await db().gearSlot.update({ where: { characterId_slot: { characterId: id, slot: "weapon" } }, data: { details: JSON.stringify({ stars: 22, flames: {}, potential: { rank: "legendary", lines: ["Boss Damage +45%", "Critical Rate +13%", null] }, hammers: 0 }) } });
    expect(item(await board(id), "weapon").lines).toEqual(["Boss Damage +40%", "Critical Rate +12%", null]);
    // a line with no line of its kind left stays as saved (not dropped without a word)
    await db().gearSlot.update({ where: { characterId_slot: { characterId: id, slot: "weapon" } }, data: { details: JSON.stringify({ stars: 22, flames: {}, potential: { rank: "legendary", lines: ["Made-up Line +5%", null, null] }, hammers: 0 }) } });
    expect(item(await board(id), "weapon").lines).toEqual(["Made-up Line +5%", null, null]);
    expect((await api().put(`/api/gear/${id}/weapon/details`).send({ stars: 22, flames: {}, potential: { rank: "legendary", lines: ["Made-up Line +5%", null, null] }, hammers: 0 })).status).toBe(400);
    await db().gearSlot.update({ where: { characterId_slot: { characterId: id, slot: "weapon" } }, data: { details: JSON.stringify({ stars: 22, flames: {}, potential: { rank: "legendary", lines: ["Boss Damage +45%", "Critical Rate +13%", null] }, hammers: 0 }) } });
    expect((await ok(api().get("/api/gear?world=45"))).body.characters[0].details.weapon.potential.lines).toEqual(["Boss Damage +40%", "Critical Rate +12%", null]);
    // and it saves as it reads
    await potential(id, "weapon", "legendary", ["Boss Damage +40%", "Critical Rate +12%", null], 22);
  });

  it("a typed item of a kind that has potential counts, at its level", async () => {
    const id = await character();
    await wear(id, "hat", { other: "My hat" });
    await potential(id, "hat", "legendary", ["STR +12%", null, null], 0, { kind: "hat", level: 150, boss: true, att: 0, matt: 0 });
    const hat = item(await board(id), "hat");
    // Lv. 150: Korea's 12%, no +1
    expect([hat.name, hat.level, hat.score]).toEqual(["My hat", 150, 155.64]);
  });

  it("a job the item list doesn't know yet: no scores", async () => {
    const id = await character("Some New Job");
    await wear(id, "hat", { item: ARCANE_KNIGHT_HAT });
    expect(await board(id)).toMatchObject({ known: false, items: [] });
    const r = await api().get(`/api/gear/${id}/potential/hat`);
    expect([r.status, r.body.error]).toEqual([404, "No potential score for this job yet"]);
  });

  it("another owner's character can't be read", async () => {
    const id = await character("Ren", "someone else");
    expect((await api().get(`/api/gear/${id}/potential?budget=1`)).status).toBe(404);
  });
});

describe("GET /api/gear/:id/potential/:slot", () => {
  it("each cube's result for one cube (adding up to 1, rank-ups included) and its curves", async () => {
    const id = await character();
    await wear(id, "belt", { item: GOLLUX_BELT });
    await potential(id, "belt", "rare", ["STR +3%", null, null]);
    const g = (await ok(api().get(`/api/gear/${id}/potential/belt`))).body;
    for (const cube of ["glowing", "bright"]) {
      const d: [number, number][] = g.cubes[cube].distribution;
      expect(d.reduce((s, [, p]) => s + p, 0)).toBeCloseTo(1, 9);
      expect(d.map(([s]) => s)).toEqual([...d.map(([s]) => s)].sort((a, b) => a - b));
      // Epic lines (a 14% / 17% rank-up) reach higher than any Rare roll
      expect(d.at(-1)![0]).toBeGreaterThan(3 * 38.91);
      expect(g.cubes[cube].curves.length).toBe(151);
    }
    expect(g.target).toBeNull();
  });

  it("with a target: the cubes and meso to reach it with each cube (null where it can't be reached)", async () => {
    const id = await character();
    await wear(id, "hat", { item: ARCANE_KNIGHT_HAT });
    await potential(id, "hat", "legendary", ["STR +13%", "STR +10%", "STR +10%"]);
    const g = (await ok(api().get(`/api/gear/${id}/potential/hat?target=450&events=sale`))).body;
    expect(g.target.score).toBe(450);
    for (const cube of ["glowing", "bright"]) expect(g.target.cubes[cube].meso).toBeCloseTo(g.target.cubes[cube].cubes * (cube === "glowing" ? 9e6 : 16.5e6), 0);
    // above the best a hat can roll (3 × 13% STR = 505.83): never
    const never = (await ok(api().get(`/api/gear/${id}/potential/hat?target=506`))).body;
    expect(never.target.cubes).toEqual({ glowing: null, bright: null });
  });

  it("only an item that can have potential", async () => {
    const id = await character();
    await wear(id, "pocket", { item: STONE_OF_LIFE });
    for (const slot of ["pocket", "hat"]) {
      const r = await api().get(`/api/gear/${id}/potential/${slot}`);
      expect([r.status, r.body.error]).toEqual([404, "That slot has no item that can have potential"]);
    }
  });

  it("the item asked for, not another", async () => {
    const id = await character();
    await wear(id, "belt", { item: GOLLUX_BELT });
    await wear(id, "hat", { item: ARCANE_KNIGHT_HAT });
    await potential(id, "hat", "legendary", ["STR +13%", "STR +10%", "STR +10%"]);
    // the hat at Legendary: one cube's best roll is its best, 3 × STR 13% = 505.83
    const g = (await ok(api().get(`/api/gear/${id}/potential/hat`))).body;
    expect([g.cubes.glowing.distribution.at(-1)[0], g.cubes.bright.distribution.at(-1)[0]]).toEqual([505.83, 505.83]);
  });
});
