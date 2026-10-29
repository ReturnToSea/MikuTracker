import { describe, expect, it } from "vitest";
import { db } from "../src/db";
import { SOLE_OWNER } from "../src/owner";
import { api, ok } from "./api";
import { NOW, useDbTestSetup } from "./helpers";

useDbTestSetup();

// Real items from gear-items.json.
const ARCANE_KNIGHT_HAT = "1004808"; // Lv. 200 boss hat, 22★ at most
const GENESIS_SWORD = "1215024"; // Lv. 200 weapon, fixed at 22★ (no Star Force)
const GOLLUX_BELT = "1132246"; // Lv. 150 belt

let made = 0;
async function character(job = "Ren", ownerId = SOLE_OWNER) {
  const name = `Char${++made}`;
  const c = await db().character.create({ data: { ownerId, worldId: 45, name, nameKey: name.toLowerCase(), job, level: 270, exp: 0n, worldRank: 1, sortOrder: made, addedAt: NOW, checkedAt: NOW } });
  return c.id;
}
const wear = (id: number, slot: string, body: object) => ok(api().put(`/api/gear/${id}/${slot}`).send(body));
const details = (id: number, slot: string, d: object) => ok(api().put(`/api/gear/${id}/${slot}/details`).send({ stars: 0, flames: {}, potential: null, hammers: 0, ...d }));
const get = async (path: string) => (await ok(api().get(path))).body;
type Step = { system: string; slot: string; name: string; step: string; perFd: number; cost: number; fd: number; chance: number; boom: number | null; now: Record<string, unknown> };

async function geared() {
  const id = await character();
  await wear(id, "hat", { item: ARCANE_KNIGHT_HAT });
  await details(id, "hat", { stars: 17, flames: { STR: 5, "All Stats %": 4 }, potential: { rank: "unique", lines: ["STR +10%", "STR +7%", null] } });
  await wear(id, "weapon", { item: GENESIS_SWORD });
  await details(id, "weapon", { stars: 22, flames: { ATT: 5, "Boss damage %": 6 }, potential: { rank: "legendary", lines: ["ATT +13%", "Boss Damage +40%", "Ignore Enemy DEF +35%"] } });
  await wear(id, "belt", { item: GOLLUX_BELT });
  return id;
}

describe("GET /api/gear/:id/upgrades", () => {
  it("each item's next step in each system, as its own page works it out, cheapest per 1% final damage first", async () => {
    const id = await geared();
    const b = await get(`/api/gear/${id}/upgrades`);
    expect([b.known, b.blackFlamePrice, b.mvp, b.prices]).toEqual([true, 3_000_000, "none", { glowing: 12_000_000, bright: 22_000_000 }]);
    const steps: Step[] = b.steps;
    const per = steps.map((s) => s.perFd);
    expect(per).toEqual([...per].sort((x, y) => x - y));
    // the three pages' own figures
    const flames = await get(`/api/gear/${id}/flames?budget=0`);
    const stars = await get(`/api/gear/${id}/starforce?events=&budget=0`);
    const potential = await get(`/api/gear/${id}/potential?events=&budget=0`);
    const fd = (score: number) => (score * 0.785) / 100;
    for (const f of flames.items) {
      const s = steps.find((x) => x.system === "flames" && x.slot === f.slot)!;
      // the whole step: the meso to any better roll (Black Flame price ÷ the chance of better), not one flame
      expect(s).toMatchObject({ step: "Black Flame", perFd: f.metrics.mesoPerFd, cost: f.metrics.mesoToBetter, chance: f.metrics.better, boom: null, now: { score: f.score, best: f.best } });
      expect(s.cost).toBeCloseTo(3_000_000 / f.metrics.better, 0);
      expect(s.cost).toBeGreaterThan(3_000_000);
      expect(s.fd).toBeCloseTo(fd(f.metrics.gainIfBetter), 12);
    }
    for (const t of stars.items) {
      expect(steps.find((x) => x.system === "starforce" && x.slot === t.slot)).toMatchObject({ step: `${t.best.from}→${t.best.to}★`, perFd: t.best.perFd, cost: t.best.cost, fd: t.best.fd, chance: t.next.success, boom: t.next.boom, now: { star: t.star, boomCost: t.boomCost } });
    }
    for (const p of potential.items) {
      const m = p.cubes[p.cheaper];
      const s = steps.find((x) => x.system === "potential" && x.slot === p.slot)!;
      const other = p.cubes[p.cheaper === "glowing" ? "bright" : "glowing"];
      expect(s).toMatchObject({ step: p.cheaper === "glowing" ? "Glowing Cube" : "Bright Cube", perFd: m.mesoPerFd, cost: m.mesoToBetter, chance: m.better, now: { rank: p.rank, cube: p.cheaper, otherPerFd: other.mesoPerFd } });
      expect(other.mesoPerFd).not.toBe(m.mesoPerFd);
      expect(s.fd).toBeCloseTo(fd(m.gainIfBetter), 12);
    }
    // the hat, the weapon and the belt in flames and potential; Star Force: the hat and the belt (a Genesis weapon is fixed)
    expect(steps.map((s) => `${s.system} ${s.slot}`).sort()).toEqual(["flames belt", "flames hat", "flames weapon", "potential belt", "potential hat", "potential weapon", "starforce belt", "starforce hat"]);
  });

  it("a step that adds nothing isn't listed: the best flames, the best lines, the last star", async () => {
    const id = await character();
    await wear(id, "hat", { item: ARCANE_KNIGHT_HAT });
    // 30★ (its last), the 4 best flames for a Ren at tier 7 (all stats 102.55, STR 77, STR+DEX 47.25, STR+INT 42:
    // more than ATT's 28), 3 × STR 13% (the best a Ren's hat can roll)
    await details(id, "hat", { stars: 30, flames: { STR: 7, "STR+DEX": 7, "STR+INT": 7, "All Stats %": 7 }, potential: { rank: "legendary", lines: ["STR +13%", "STR +13%", "STR +13%"] } });
    expect((await get(`/api/gear/${id}/upgrades`)).steps.map((s: Step) => `${s.system} ${s.step}`)).toEqual([]);
  });

  it("stars that add nothing the job uses aren't a step (a Demon Avenger's Lv. 100 eye accessory: stats, no HP, no attack yet)", async () => {
    const id = await character("Demon Avenger");
    await wear(id, "eye", { other: "My eye accessory" });
    await details(id, "eye", { other: { kind: "eye", level: 100, boss: false, att: 0, matt: 0 } });
    const sf = await get(`/api/gear/${id}/starforce?events=&budget=0`);
    expect(sf.items.map((i: { best: { perFd: number | null } }) => i.best.perFd)).toEqual([null]);
    expect((await get(`/api/gear/${id}/upgrades`)).steps.filter((s: Step) => s.system === "starforce")).toEqual([]);
  });

  it("each page's events change its rows: a cube sale, Star Force's 30% off", async () => {
    const id = await geared();
    const plain: Step[] = (await get(`/api/gear/${id}/upgrades`)).steps;
    const on = await get(`/api/gear/${id}/upgrades?sf=thirtyOff&cubes=sale`);
    expect(on.prices).toEqual({ glowing: 9_000_000, bright: 16_500_000 });
    const was = (sys: string, slot: string) => plain.find((s) => s.system === sys && s.slot === slot)!;
    for (const s of on.steps as Step[]) {
      if (s.system === "potential") expect(s.cost).toBeCloseTo(was(s.system, s.slot).cost * 0.75, 0);
      if (s.system === "flames") expect(s.cost).toBe(was(s.system, s.slot).cost);
    }
    // 30% off (and no MVP): the hat's 17→18★ costs less
    expect(on.steps.find((s: Step) => s.system === "starforce" && s.slot === "hat").cost).toBeLessThan(was("starforce", "hat").cost);
    expect((await api().get(`/api/gear/${id}/upgrades?sf=halfOff`)).status).toBe(400);
    expect((await api().get(`/api/gear/${id}/upgrades?cubes=free`)).status).toBe(400);
  });

  it("a job the item list doesn't know yet: nothing; another owner's character: 404", async () => {
    const id = await character("Some New Job");
    await wear(id, "hat", { item: ARCANE_KNIGHT_HAT });
    expect(await get(`/api/gear/${id}/upgrades`)).toMatchObject({ known: false, steps: [] });
    const theirs = await character("Ren", "someone else");
    expect((await api().get(`/api/gear/${theirs}/upgrades`)).status).toBe(404);
  });
});
