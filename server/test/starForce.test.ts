import { describe, expect, it } from "vitest";
import { tapCost } from "../src/gameFigures/starForceCosts";
import { db } from "../src/db";
import { SOLE_OWNER } from "../src/owner";
import { api, ok } from "./api";
import { NOW, useDbTestSetup } from "./helpers";

useDbTestSetup();

// Real items from gear-items.json.
const ARCANE_KNIGHT_HAT = "1004808"; // Lv. 200, Warrior (STR, DEX), up to 30★
const GENESIS_SWORD = "1215024"; // fixed at 22★
const GOLLUX_BELT = "1132246"; // Lv. 150, anyone's
const OATH_OF_DEATH = "1122447"; // Lv. 250 pendant, anyone's
const ARCANE_MAGE_HAT = "1004809"; // Lv. 200, Magician (INT, LUK)
const ARCANE_ARCHER_HAT = "1004810"; // Lv. 200, Bowman (DEX, STR)
const FAIRY_HEART = "1672073"; // Lv. 100: up to 8★

let made = 0;
async function character(job = "Ren", ownerId = SOLE_OWNER) {
  const name = `Char${++made}`;
  const c = await db().character.create({ data: { ownerId, worldId: 45, name, nameKey: name.toLowerCase(), job, level: 270, exp: 0n, worldRank: 1, sortOrder: made, addedAt: NOW, checkedAt: NOW } });
  return c.id;
}
const wear = (id: number, slot: string, item: string) => ok(api().put(`/api/gear/${id}/${slot}`).send({ item }));
const details = (id: number, slot: string, extra: object) => ok(api().put(`/api/gear/${id}/${slot}/details`).send({ stars: 0, flames: {}, potential: null, hammers: 0, ...extra }));
const board = async (id: number, events = "", budget = 10e9) => (await ok(api().get(`/api/gear/${id}/starforce?events=${events}&budget=${budget}`))).body;
const detail = async (id: number, slot: string, target: number, events = "") => (await ok(api().get(`/api/gear/${id}/starforce/${slot}?events=${events}&target=${target}`))).body;
type Item = { slot: string; star: number; min: number; max: number; boomCost: number; safety: string | null; next: { pick: string; success: number; boom: number }; best: { from: number; to: number; cost: number; fd: number; perFd: number | null }; stop: { star: number; cost: number; fd: number } };

// A Lv. 200 Warrior hat's 18★: +15 STR, +15 DEX, +14 ATT (the Lv. 200 armor table: 16★ +12, 17★ +13,
// 18★ +14). A Ren with the default values: 15 × 1 + 15 × 0.125 + 14 × 4 = 72.875 main stat, × 0.785 ÷
// 100 = 0.57206875% final damage.
const HAT_18 = 0.57206875;

describe("GET /api/gear/:id/starforce", () => {
  it("the items that can take more stars (not fixed ones, not ones at their limit), at their saved stars, cheapest per 1% FD first", async () => {
    const id = await character();
    await wear(id, "hat", ARCANE_KNIGHT_HAT);
    await details(id, "hat", { stars: 17 });
    await wear(id, "weapon", GENESIS_SWORD);
    await wear(id, "belt", GOLLUX_BELT);
    await wear(id, "pendant1", OATH_OF_DEATH);
    await details(id, "pendant1", { stars: 30 });
    const b = await board(id);
    expect([b.known, b.mvp, b.events, b.budget]).toEqual([true, "none", [], 10e9]);
    const items: Item[] = b.items;
    expect(items.map((i) => i.slot).sort()).toEqual(["belt", "hat"]);
    // the belt has nothing saved: it starts at 0★
    expect(items.find((i) => i.slot === "belt")).toMatchObject({ star: 0, min: 0, max: 30, boomCost: 0, safety: null });
    const per = items.map((i) => i.best.perFd ?? Infinity);
    expect(per).toEqual([...per].sort((a, b) => a - b));
  });

  it("the hat at 17★: its next tap, and its best jump (17→18★: the average cost ÷ 0.57206875%)", async () => {
    const id = await character();
    await wear(id, "hat", ARCANE_KNIGHT_HAT);
    await details(id, "hat", { stars: 17 });
    const hat: Item = (await board(id)).items[0];
    expect(hat.next).toEqual({ pick: "Mode 1", success: 0.1575, boom: 0.0674 });
    const d = await detail(id, "hat", 18);
    expect(d.rows[0]).toMatchObject({ from: 17, to: 18, pick: "Mode 1", success: 0.1575, boom: 0.0674, tapCost: tapCost(17, 200) });
    expect(d.rows[0].fd).toBeCloseTo(HAT_18, 10);
    expect([hat.best.from, hat.best.to]).toEqual([17, 18]);
    expect(hat.best.perFd).toBeCloseTo(d.rows[0].avgCost / HAT_18, 0);
  });

  it("each class's stars: a mage's INT, LUK and Magic ATT; a Bowman's DEX and secondary STR; a Demon Avenger's HP", async () => {
    const at17 = async (job: string, hat: string) => {
      const id = await character(job);
      await wear(id, "hat", hat);
      await details(id, "hat", { stars: 17 });
      return (await detail(id, "hat", 18)).rows[0].fd;
    };
    // Bishop: INT +15 × 1, LUK +15 × 0.125, Magic ATT +14 × 4 (ATT +14 counts nothing) = 72.875
    expect(await at17("Bishop", ARCANE_MAGE_HAT)).toBeCloseTo(HAT_18, 10);
    // Wind Archer: DEX +15 × 1, STR +15 × 0.125, ATT +14 × 4 = 72.875
    expect(await at17("Wind Archer", ARCANE_ARCHER_HAT)).toBeCloseTo(HAT_18, 10);
    // Demon Avenger, 3→4★ on a Warrior hat: +2 STR, +2 DEX (worth nothing), +10 HP (its main stat; 20 HP
    // already from 1–3★): 10 × 0.785 ÷ 100
    const da = await character("Demon Avenger");
    await wear(da, "hat", ARCANE_KNIGHT_HAT);
    await details(da, "hat", { stars: 3 });
    expect((await detail(da, "hat", 4)).rows[0].fd).toBeCloseTo(0.0785, 10);
  });

  it("cheapest first, not in the order they're saved (the belt at 21★ dearer than the hat at 0★)", async () => {
    const id = await character();
    await wear(id, "belt", GOLLUX_BELT);
    await details(id, "belt", { stars: 21 });
    await wear(id, "hat", ARCANE_KNIGHT_HAT);
    expect((await board(id)).items.map((i: Item) => i.slot)).toEqual(["hat", "belt"]);
  });

  it("the MVP tier (a setting) and the events lower the costs", async () => {
    const id = await character();
    await wear(id, "hat", ARCANE_KNIGHT_HAT);
    await details(id, "hat", { stars: 16 });
    const plain = (await detail(id, "hat", 17)).rows[0].tapCost;
    expect(plain).toBe(tapCost(16, 200));
    await ok(api().put("/api/settings").send({ mvp: "diamond" }));
    expect((await board(id)).mvp).toBe("diamond");
    expect((await detail(id, "hat", 17)).rows[0].tapCost).toBe(Math.round(tapCost(16, 200) * 0.9));
    expect((await detail(id, "hat", 17, "thirtyOff")).rows[0].tapCost).toBe(Math.round(tapCost(16, 200) * 0.7 * 0.9));
    expect((await board(id, "thirtyOff,fewerBooms")).events).toEqual(["thirtyOff", "fewerBooms"]);
  });

  it("an MVP tier the list doesn't know (a hand-edited database) counts as none", async () => {
    const id = await character();
    await wear(id, "hat", ARCANE_KNIGHT_HAT);
    await details(id, "hat", { stars: 16 });
    await board(id);
    await db().settings.update({ where: { ownerId: SOLE_OWNER }, data: { mvp: "red" } });
    expect((await detail(id, "hat", 17)).rows[0].tapCost).toBe(tapCost(16, 200));
    expect((await board(id)).items[0].best.perFd).toBeGreaterThan(0);
  });

  it("an item's boom cost and boxes are saved with it and used: 4 4 4 4 picks Safeguard at 15★", async () => {
    const id = await character();
    await wear(id, "hat", ARCANE_KNIGHT_HAT);
    await details(id, "hat", { stars: 15, boomCost: 1_500_000_000, safety: "4444" });
    const hat: Item = (await board(id)).items[0];
    expect([hat.boomCost, hat.safety, hat.next.pick, hat.next.boom]).toEqual([1_500_000_000, "4444", "Safeguard", 0]);
    expect((await detail(id, "hat", 22)).summary).toMatchObject({ canBoom: false, anyBoom: 0, medianBooms: 0, averageBooms: 0 });
    // the Equipment page's details keep them
    const g = (await ok(api().get("/api/gear?world=45"))).body;
    expect(g.characters.find((c: { id: number }) => c.id === id).details.hat).toMatchObject({ stars: 15, boomCost: 1_500_000_000, safety: "4444" });
  });

  it("Targets: the star to stop at for the budget, and what getting there costs and adds", async () => {
    const id = await character();
    await wear(id, "hat", ARCANE_KNIGHT_HAT);
    await details(id, "hat", { stars: 17 });
    const tiny: Item = (await board(id, "", 1)).items[0];
    expect(tiny.stop).toEqual({ star: 17, cost: 0, fd: 0 });
    // the biggest budget allowed (1,000 trillion per 1%) stops short of 29→30★, which alone costs about
    // 2,850 trillion per 1%
    const big: Item = (await board(id, "", 1e15)).items[0];
    // (the table's rows always run to the limit, whatever the target: a short one keeps it quick)
    const d = await detail(id, "hat", 18);
    expect(d.rows.at(-1).perFd).toBeGreaterThan(1e15);
    expect(big.stop.star).toBe(29);
    expect(big.stop.cost).toBeCloseTo(d.rows.at(-2).costFrom, 0);
    expect(big.stop.fd).toBeCloseTo(d.rows.at(-2).fdFrom, 10);
  });

  it("a job the list doesn't know: nothing", async () => {
    const id = await character("Brand New Job");
    await wear(id, "hat", ARCANE_KNIGHT_HAT);
    expect(await board(id)).toEqual({ known: false, mvp: "none", events: [], budget: 10e9, items: [] });
  });

  it("refuses events it doesn't know, a missing budget, and someone else's character", async () => {
    const id = await character();
    expect((await api().get(`/api/gear/${id}/starforce?events=halfOff&budget=1`)).status).toBe(400);
    expect((await api().get(`/api/gear/${id}/starforce?events=`)).status).toBe(400);
    const theirs = await character("Ren", "someone-else");
    expect((await api().get(`/api/gear/${theirs}/starforce?budget=1`)).status).toBe(404);
  });
});

describe("GET /api/gear/:id/starforce/:slot", () => {
  it("every row to the limit with running totals; the summary for the target (averages exact)", async () => {
    const id = await character();
    await wear(id, "hat", ARCANE_KNIGHT_HAT);
    await details(id, "hat", { stars: 17 });
    const d = await detail(id, "hat", 22);
    expect(d.target).toBe(22);
    expect(d.rows.map((r: { from: number }) => r.from)).toEqual([17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);
    const toTarget = d.rows.slice(0, 5);
    const sumOf = (k: string) => toTarget.reduce((a: number, r: Record<string, number>) => a + r[k]!, 0);
    expect(d.summary.average).toBeCloseTo(sumOf("avgCost"), 0);
    expect(d.summary.average).toBeCloseTo(toTarget.at(-1).costFrom, 0);
    expect(d.summary.fd).toBeCloseTo(sumOf("fd"), 10);
    expect(d.summary.perFd).toBeCloseTo(d.summary.average / d.summary.fd, 0);
    // tadeucci's engine: Lv. 200 17→22★, Mode 1 throughout: 7.246026 booms on average
    expect(d.summary.averageBooms).toBeCloseTo(7.246026, 5);
    // simulated: the median below the average (a long tail), the unlucky costs in order, booms likely
    expect(d.summary.median).toBeLessThan(d.summary.average);
    const [p75, p90, p99] = d.summary.unlucky;
    expect(d.summary.median <= p75 && p75 <= p90 && p90 <= p99).toBe(true);
    expect(d.summary.anyBoom).toBeGreaterThan(0.8);
    expect(d.summary.anyBoom).toBeLessThanOrEqual(1);
    // each row's own meso per 1% FD
    expect(d.rows[0].perFd).toBeCloseTo(d.rows[0].avgCost / d.rows[0].fd, 0);
    expect(d.summary.canBoom).toBe(true);
    // the graphs: the shares add up to 1; one bar per row to the target
    expect(d.graphs.cost.bins.reduce((a: number, b: number) => a + b, 0)).toBeCloseTo(1, 6);
    // 61 ranges up to where 99.5% end: the runs spread over them (none piled into the first or the last)
    expect(d.graphs.cost.bins).toHaveLength(61);
    expect(d.graphs.cost.bins[0]).toBeLessThan(0.5);
    expect(d.graphs.cost.bins[60]).toBeLessThan(0.05);
    expect(d.graphs.cost.width * 60).toBeGreaterThan(p99);
    expect(d.graphs.cost.marks).toEqual({ median: d.summary.median, p75, p90, p99 });
    // some run booms more than 99.5% of the others
    expect(d.graphs.booms.more).toBe(true);
    expect(d.graphs.booms.counts.reduce((a: number, b: number) => a + b, 0)).toBeCloseTo(1, 6);
    expect(d.graphs.perStar.map((p: { to: number }) => p.to)).toEqual([18, 19, 20, 21, 22]);
    expect(d.jumps[0]).toMatchObject({ from: 17 });
  });

  // (a long climb is slow under mutation testing's instrumented code: a longer time limit)
  it("a long climb's boom counts come in ranges (17→26★ booms into the thousands), about 100 of them", { timeout: 30000 }, async () => {
    const id = await character();
    await wear(id, "hat", ARCANE_KNIGHT_HAT);
    await details(id, "hat", { stars: 17 });
    const d = await detail(id, "hat", 26);
    expect(d.graphs.booms.width).toBeGreaterThan(1);
    expect(d.graphs.booms.counts.length).toBeLessThanOrEqual(101);
    expect(d.graphs.booms.counts.length).toBeGreaterThan(50);
    expect(d.graphs.booms.counts.reduce((a: number, b: number) => a + b, 0)).toBeCloseTo(1, 6);
    // a short one: one bar per count
    const short = await detail(id, "hat", 19);
    expect(short.graphs.booms.width).toBe(1);
    expect(short.graphs.booms.counts.length).toBeLessThanOrEqual(101);
  });

  it("the same answer every time (the runs are seeded)", async () => {
    const id = await character();
    await wear(id, "hat", ARCANE_KNIGHT_HAT);
    await details(id, "hat", { stars: 17 });
    expect((await detail(id, "hat", 21)).summary).toEqual((await detail(id, "hat", 21)).summary);
  });

  it("a target a run can't stop at moves to the next one (+1: 9→11★); nothing booms below 15★", async () => {
    const id = await character();
    await wear(id, "belt", GOLLUX_BELT);
    await details(id, "belt", { stars: 9 });
    const d = await detail(id, "belt", 10, "plusOne");
    expect(d.target).toBe(11);
    expect(d.rows[0]).toMatchObject({ from: 9, to: 11 });
    expect(d.summary).toMatchObject({ canBoom: false, anyBoom: 0 });
    // nothing can boom: one bar, and nothing past it
    expect([d.graphs.booms.width, d.graphs.booms.counts.length, d.graphs.booms.more]).toEqual([1, 1, false]);
    expect(d.graphs.booms.counts[0]).toBeCloseTo(1, 9);
    // a target past the limit: the limit
    expect((await detail(id, "belt", 30)).target).toBe(30);
    const heart = await character();
    await wear(heart, "heart", FAIRY_HEART);
    expect((await detail(heart, "heart", 30)).target).toBe(8);
  });

  it("only the last row can boom (15→16★): a boom is possible", async () => {
    const id = await character();
    await wear(id, "belt", GOLLUX_BELT);
    await details(id, "belt", { stars: 15 });
    expect((await detail(id, "belt", 16)).summary.canBoom).toBe(true);
  });

  it("the item asked for, not another", async () => {
    const id = await character();
    await wear(id, "hat", ARCANE_KNIGHT_HAT);
    await details(id, "hat", { stars: 17 });
    await wear(id, "belt", GOLLUX_BELT);
    await details(id, "belt", { stars: 3 });
    expect((await detail(id, "belt", 4)).rows[0].from).toBe(3);
    expect((await detail(id, "hat", 18)).rows[0].from).toBe(17);
  });

  it("404 for an item that can't take more stars, a job the list doesn't know, or someone else's", async () => {
    const id = await character();
    await wear(id, "weapon", GENESIS_SWORD);
    const fixed = await api().get(`/api/gear/${id}/starforce/weapon?target=23`);
    expect([fixed.status, fixed.body.error]).toEqual([404, "That slot has no item that can take more stars"]);
    const unknown = await character("Brand New Job");
    await wear(unknown, "hat", ARCANE_KNIGHT_HAT);
    const job = await api().get(`/api/gear/${unknown}/starforce/hat?target=18`);
    expect([job.status, job.body.error]).toEqual([404, "No final damage for this job yet"]);
    expect((await api().get(`/api/gear/${id}/starforce/hat?target=0`)).status).toBe(400);
  });
});

describe("saving an item's boom cost and boxes", () => {
  it("refuses a negative boom cost, a fraction, or boxes it doesn't know", async () => {
    const id = await character();
    await wear(id, "hat", ARCANE_KNIGHT_HAT);
    for (const bad of [{ boomCost: -1 }, { boomCost: 1.5 }, { safety: "1111" }]) {
      expect((await api().put(`/api/gear/${id}/hat/details`).send({ stars: 0, flames: {}, potential: null, hammers: 0, ...bad })).status).toBe(400);
    }
  });
});
