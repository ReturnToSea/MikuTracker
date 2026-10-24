import { describe, expect, it } from "vitest";
import { db } from "../src/db";
import { SOLE_OWNER } from "../src/owner";
import { api, ok } from "./api";
import { NOW, useDbTestSetup } from "./helpers";

useDbTestSetup();

// Real items from gear-items.json.
const ARCANE_KNIGHT_HAT = "1004808"; // Lv. 200 boss hat
const GENESIS_SWORD = "1215024"; // Lv. 200 boss weapon, ATT 340, comes with 22★
const ARCANE_KNIGHT_SUIT = "1053063"; // an overall
const ETERNAL_KNIGHT_PANTS = "1062285"; // Lv. 250 boss bottom
const GOLLUX_BELT = "1132246"; // Lv. 150, not a boss item
const SILVER_BLOSSOM_RING = "1113149"; // rings can't have flames
const ETERNAL_KNIGHT_ARMOR = "1042433"; // a normal top (not an overall)
const GENESIS_LAZULI = "1572010"; // Zero's weapon

let made = 0;
async function character(job = "Ren", ownerId = SOLE_OWNER) {
  const name = `Char${++made}`;
  const c = await db().character.create({ data: { ownerId, worldId: 45, name, nameKey: name.toLowerCase(), job, level: 270, exp: 0n, worldRank: 1, sortOrder: made, addedAt: NOW, checkedAt: NOW } });
  return c.id;
}
const wear = (id: number, slot: string, body: object) => ok(api().put(`/api/gear/${id}/${slot}`).send(body));
const details = (id: number, slot: string, f: Record<string, number>, stars = 0, other?: object) => ok(api().put(`/api/gear/${id}/${slot}/details`).send({ stars, flames: f, potential: null, hammers: 0, ...(other ? { other } : {}) }));
const board = async (id: number, budget = 10e9) => (await ok(api().get(`/api/gear/${id}/flames?budget=${budget}`))).body;
type Item = { slot: string; name: string; icon: string | null; boss: boolean; weights: Record<string, number>; starMin: number; score: number; best: number; metrics: { mesoPerFd: number | null; better: number; mesoToBetter: number | null }; stop: { score: number; reached: boolean; flames: number; meso: number } | null };

describe("GET /api/gear/:id/flames", () => {
  it("only the items that can have flames, with their saved flames' score and best, cheapest per 1% final damage first", async () => {
    const id = await character();
    await wear(id, "hat", { item: ARCANE_KNIGHT_HAT });
    await wear(id, "weapon", { item: GENESIS_SWORD });
    await wear(id, "belt", { item: GOLLUX_BELT });
    await wear(id, "ring1", { item: SILVER_BLOSSOM_RING });
    await wear(id, "pocket", { other: "Typed pocket, no details yet" });
    // the hat: STR T6 66 + STR+DEX T5 30 × 1.125 + ATT T5 5 × 4 + all stat T4 4 × 10 = 159.75
    await details(id, "hat", { STR: 6, "STR+DEX": 5, ATT: 5, "All Stats %": 4 });
    // the belt: nothing saved yet, so 0 (and almost any flame beats it)
    const b = await board(id);
    expect([b.known, b.price, b.budget]).toEqual([true, 3_000_000, 10e9]);
    const items: Item[] = b.items;
    expect(items.map((i) => i.slot).sort()).toEqual(["belt", "hat", "weapon"]);
    const hat = items.find((i) => i.slot === "hat")!;
    expect([hat.name, hat.score, hat.best]).toEqual(["Arcane Umbra Knight Hat", 159.75, 236.25]);
    // a Genesis weapon comes with 22★ (where saving its flames starts, if nothing's saved yet)
    expect([hat.starMin, items.find((i) => i.slot === "weapon")!.starMin]).toEqual([0, 22]);
    expect(items.find((i) => i.slot === "belt")!.score).toBe(0);
    // the weapon's 4 best lines: ATT T7 210 × 4 = 840, boss T7 14 × 12 = 168, damage T7 7 × 12 = 84, STR T7 77
    expect(items.find((i) => i.slot === "weapon")!.best).toBe(1169);
    const costs = items.map((i) => i.metrics.mesoPerFd ?? Infinity);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
    expect(items[0]!.slot).not.toBe("hat");
  });

  it("an item whose flames can't be improved goes last (no cost at all)", async () => {
    const id = await character();
    await wear(id, "hat", { item: ARCANE_KNIGHT_HAT });
    await wear(id, "belt", { item: GOLLUX_BELT });
    // the belt's best: STR T5 40, all stat T5 50, STR+DEX T5 20 × 1.125, STR+INT T5 20
    await details(id, "belt", { STR: 5, "All Stats %": 5, "STR+DEX": 5, "STR+INT": 5 });
    const items: Item[] = (await board(id)).items;
    expect(items.map((i) => i.slot)).toEqual(["hat", "belt"]);
    expect([items[1]!.score, items[1]!.best, items[1]!.metrics.mesoPerFd, items[1]!.metrics.better]).toEqual([132.5, 132.5, null, 0]);
  });

  it("a bottom under an overall doesn't count; a typed item counts once its kind, level and boss tick are given", async () => {
    const id = await character();
    await wear(id, "top", { item: ARCANE_KNIGHT_SUIT });
    await wear(id, "bottom", { item: ETERNAL_KNIGHT_PANTS });
    await wear(id, "eye", { other: "Mystery Eye" });
    await details(id, "eye", { STR: 3 }, 0, { kind: "eye", level: 160, boss: false, att: 0, matt: 0 });
    const items: Item[] = (await board(id)).items;
    expect(items.map((i) => i.slot).sort()).toEqual(["eye", "top"]);
    // Lv. 160 eye: STR 9 a tier → T3 27
    expect(items.find((i) => i.slot === "eye")).toMatchObject({ name: "Mystery Eye", score: 27, icon: null });
  });

  it("the price (one for the whole site) and the character's own stat values change the numbers", async () => {
    const id = await character();
    const other = await character();
    for (const c of [id, other]) await wear(c, "hat", { item: ARCANE_KNIGHT_HAT });
    for (const c of [id, other]) await details(c, "hat", { STR: 6, ATT: 5 });
    const before: Item = (await board(id)).items[0];
    await ok(api().put("/api/settings").send({ blackFlamePrice: 6_000_000 }));
    const doubled: Item = (await board(id)).items[0];
    expect(doubled.metrics.mesoToBetter).toBeCloseTo(before.metrics.mesoToBetter! * 2, 0);
    expect(doubled.metrics.better).toBe(before.metrics.better);
    // ATT worth 3 to this character only: 66 + 15 = 81, the other still 66 + 20 = 86
    await ok(api().put(`/api/gear/${id}/stat-values`).send({ att: 3, allStat: 10, secRatio: 0.125, bossDmg: 12, fdPer100: 0.785 }));
    expect([(await board(id)).items[0].score, (await board(other)).items[0].score]).toEqual([81, 86]);
  });

  it("stop scores for the budget: reached or not; a bigger budget stops higher", async () => {
    const id = await character();
    await wear(id, "hat", { item: ARCANE_KNIGHT_HAT });
    await details(id, "hat", { STR: 6, "STR+DEX": 5, ATT: 5, "All Stats %": 4 });
    const at10: Item = (await board(id, 10e9)).items[0];
    const at40: Item = (await board(id, 40e9)).items[0];
    expect(at40.stop!.score).toBeGreaterThan(at10.stop!.score);
    // 159.75 is past where a 10B budget stops, so it's reached; a tiny budget stops even lower
    expect(at10.stop!.reached).toBe(true);
    expect(at10.stop!.score).toBeLessThan(159.75);
    const tiny: Item = (await board(id, 1e6)).items[0];
    expect(tiny.stop).toMatchObject({ score: 0, reached: true });
    // no budget: no stop score
    expect((await board(id, 0)).items[0].stop).toBeNull();
  });

  it("only the character's own items; a bottom under a normal top counts; each item's icon and whether it's a boss item", async () => {
    const id = await character();
    const other = await character();
    await wear(other, "cape", { other: "Someone else's cape" });
    await details(other, "cape", {}, 0, { kind: "cape", level: 150, boss: true, att: 0, matt: 0 });
    await wear(id, "top", { item: ETERNAL_KNIGHT_ARMOR });
    await wear(id, "bottom", { item: ETERNAL_KNIGHT_PANTS });
    await wear(id, "belt", { item: GOLLUX_BELT });
    const items: Item[] = (await board(id)).items;
    expect(items.map((i) => i.slot).sort()).toEqual(["belt", "bottom", "top"]);
    expect(items.map((i) => [i.slot, i.icon, i.boss]).sort()).toEqual([["belt", "/item-icons/1132246.png", false], ["bottom", "/item-icons/1062285.png", true], ["top", "/item-icons/1042433.png", true]]);
  });

  it("Zero: boss and damage % count twice on its weapon, once elsewhere", async () => {
    const id = await character("Zero");
    await wear(id, "weapon", { item: GENESIS_LAZULI });
    await wear(id, "top", { item: ETERNAL_KNIGHT_ARMOR });
    const items: Item[] = (await board(id)).items;
    expect(items.find((i) => i.slot === "weapon")!.weights["Boss damage %"]).toBe(24);
    expect(items.find((i) => i.slot === "top")!.weights["Boss damage %"]).toBe(12);
  });

  it("the flames and meso to reach the stop score; reached only once the score gets there", async () => {
    const id = await character();
    await wear(id, "hat", { item: ARCANE_KNIGHT_HAT });
    await wear(id, "belt", { item: GOLLUX_BELT });
    await details(id, "hat", { STR: 6 });
    // a tiny budget: stop at 0, which every roll reaches (the belt, with nothing saved, is there already)
    const tiny: Item[] = (await board(id, 1e6)).items;
    const belt = tiny.find((i) => i.slot === "belt")!.stop!;
    expect([belt.score, belt.reached]).toEqual([0, true]);
    expect(belt.flames).toBeCloseTo(1, 9);
    expect(belt.meso).toBeCloseTo(3_000_000, 3);
    // 10B: the hat's 66 is short of its stop score; each flame has the chance of at least that
    const hat: Item = (await board(id)).items.find((i: Item) => i.slot === "hat");
    expect(hat.stop!.reached).toBe(false);
    expect(hat.stop!.score).toBeGreaterThan(66);
    const g = (await ok(api().get(`/api/gear/${id}/flames/hat`))).body;
    const atLeast = g.distribution.filter(([s]: [number, number]) => s >= Math.round(hat.stop!.score * 100) / 100).reduce((a: number, [, p]: [number, number]) => a + p, 0);
    expect(hat.stop!.flames).toBeCloseTo(1 / atLeast, 6);
    expect(hat.stop!.meso).toBeCloseTo(3_000_000 / atLeast, 0);
  });

  it("a job the list doesn't know: no scores", async () => {
    const id = await character("Brand New Job");
    await wear(id, "hat", { other: "Some hat" });
    expect(await board(id)).toEqual({ known: false, price: 3_000_000, budget: 10e9, items: [] });
  });

  it("only the owner's own characters, and a sensible budget", async () => {
    const theirs = await character("Ren", "someone-else");
    expect((await api().get(`/api/gear/${theirs}/flames?budget=1`)).status).toBe(404);
    const id = await character();
    expect((await api().get(`/api/gear/${id}/flames`)).status).toBe(400);
    expect((await api().get(`/api/gear/${id}/flames?budget=-1`)).status).toBe(400);
  });
});

describe("GET /api/gear/:id/flames/:slot", () => {
  it("every score one flame can give, with its chance (adding up to 1), and the curves", async () => {
    const id = await character();
    await wear(id, "hat", { item: ARCANE_KNIGHT_HAT });
    const g = (await ok(api().get(`/api/gear/${id}/flames/hat`))).body;
    expect(g.distribution).toHaveLength(1477);
    expect(g.distribution.at(-1)[0]).toBe(236.25);
    expect(g.distribution.reduce((a: number, [, p]: [number, number]) => a + p, 0)).toBeCloseTo(1, 10);
    expect(g.curves).toHaveLength(151);
    expect(g.curves[0]).toMatchObject({ score: 0 });
    expect(g.curves[0].mesoPerScore).toBeCloseTo(3_000_000 / g.curves[0].gain, 3);
  });

  it("the item asked for, not another", async () => {
    const id = await character();
    await wear(id, "hat", { item: ARCANE_KNIGHT_HAT });
    await wear(id, "belt", { item: GOLLUX_BELT });
    const g = (await ok(api().get(`/api/gear/${id}/flames/belt`))).body;
    // the Lv. 150 belt that isn't a boss item: 250 possible scores, the best 132.5
    expect([g.distribution.length, g.distribution.at(-1)[0]]).toEqual([250, 132.5]);
  });

  it("404 for a slot with nothing flameable, a job the list doesn't know, or someone else's character", async () => {
    const id = await character();
    await wear(id, "ring1", { item: SILVER_BLOSSOM_RING });
    const ring = await api().get(`/api/gear/${id}/flames/ring1`);
    expect([ring.status, ring.body.error]).toEqual([404, "That slot has no item that can have flames"]);
    expect((await api().get(`/api/gear/${id}/flames/hat`)).status).toBe(404);
    const unknown = await character("Brand New Job");
    await wear(unknown, "hat", { item: ARCANE_KNIGHT_HAT });
    const job = await api().get(`/api/gear/${unknown}/flames/hat`);
    expect([job.status, job.body.error]).toEqual([404, "No flame score for this job yet"]);
    const theirs = await character("Ren", "someone-else");
    expect((await api().get(`/api/gear/${theirs}/flames/hat`)).status).toBe(404);
  });
});
