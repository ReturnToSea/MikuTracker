import { describe, expect, it } from "vitest";
import { db } from "../src/db";
import { SOLE_OWNER } from "../src/owner";
import { api, ok } from "./api";
import { NOW, useDbTestSetup } from "./helpers";

useDbTestSetup();

let made = 0;
async function character(name = `Char${++made}`, { worldId = 45, ownerId = SOLE_OWNER, sortOrder = made } = {}) {
  const c = await db().character.create({ data: { ownerId, worldId, name, nameKey: name.toLowerCase(), job: "Ren", level: 278, exp: 0n, worldRank: 1, sortOrder, addedAt: NOW, checkedAt: NOW } });
  return c.id;
}
const save = (id: number, symbol: string, body: Record<string, number>) => api().put(`/api/symbols/${id}/${symbol}`).send({ level: 1, held: 0, days: 7, weekly: 0, ...body });
const board = async (world = 45) => (await ok(api().get(`/api/symbols?world=${world}`))).body;

describe("GET /api/symbols", () => {
  it("every symbol with each level's cost and Force, and the world's characters with what they entered", async () => {
    const a = await character("First", { sortOrder: 0 });
    await character("Elsewhere", { worldId: 70 });
    await ok(save(a, "cernium", { level: 9, held: 300, days: 5 }));
    const b = await board();
    expect(b.patch).toBe("v.271");
    expect(b.symbols).toHaveLength(14);
    const vj = b.symbols[0];
    expect(vj).toMatchObject({ id: "vanishing-journey", name: "Vanishing Journey", kind: "arcane", grand: false, daily: 40, weeklyPerClear: 80, maxLevel: 20, selector: "arcane" });
    expect(vj.steps).toHaveLength(19);
    expect([vj.steps[0], vj.steps[18]]).toEqual([{ symbols: 12, meso: 970_000 }, { symbols: 372, meso: 36_820_000 }]);
    expect([vj.force.length, vj.force[0], vj.force[1], vj.force[20]]).toEqual([21, 0, 30, 220]);
    const geardock = b.symbols.at(-1);
    expect(geardock).toMatchObject({ grand: true, selector: null, maxLevel: 11, weeklyPerClear: null });
    expect([geardock.steps.length, geardock.steps[9].meso, geardock.force[11]]).toEqual([10, 4_708_000_000, 110]);
    expect(b.characters).toEqual([{ id: a, name: "First", job: "Ren", level: 278, avatar: null, symbols: { cernium: { level: 9, held: 300, days: 5, weekly: 0 } } }]);
  });

  it("refuses an unknown world", async () => {
    expect((await api().get("/api/symbols?world=1")).status).toBe(400);
  });
});

describe("PUT /api/symbols/:id/:symbol", () => {
  it("saves as typed, and replaces on the next save", async () => {
    const id = await character();
    const other = await character();
    await ok(save(id, "arcana", { level: 19, held: 200, days: 7, weekly: 3 }));
    await ok(save(other, "arcana", { level: 2 }));
    await ok(save(id, "arcana", { level: 20, held: 0, days: 0, weekly: 0 }));
    await ok(save(id, "odium", { level: 0, held: 0, days: 0 }));
    const b = await board();
    expect(b.characters[0].symbols).toEqual({ arcana: { level: 20, held: 0, days: 0, weekly: 0 }, odium: { level: 0, held: 0, days: 0, weekly: 0 } });
    expect(b.characters[1].symbols).toEqual({ arcana: { level: 2, held: 0, days: 7, weekly: 0 } });
  });

  it.each([
    ["cernium", { level: 12 }, "Cernium goes up to Lv. 11"],
    ["cernium", { level: 9, held: 909 }, "Cernium Lv. 9 holds at most 908 symbols"],
    ["arcana", { level: 1, held: 12 }, "Arcana Lv. 1 holds at most 11 symbols"],
    ["arcana", { level: 20, held: 1 }, "Arcana holds no symbols at Lv. 20"],
    ["odium", { level: 0, held: 5 }, "Odium holds no symbols at Lv. 0"],
    ["odium", { weekly: 1 }, "Odium has no weekly content"],
  ])("refuses what %s can't have (%j)", async (symbol, body, message) => {
    const id = await character();
    const res = await save(id, symbol, body);
    expect([res.status, res.body.error]).toEqual([400, message]);
    expect(await db().symbolState.count()).toBe(0);
  });

  it("the most a level can hold is fine", async () => {
    const id = await character();
    await ok(save(id, "cernium", { level: 9, held: 908 }));
    await ok(save(id, "arcana", { level: 1, held: 11, weekly: 3 }));
  });

  it("refuses bad fields", async () => {
    const id = await character();
    for (const body of [{ level: 21 }, { level: -1 }, { held: -1 }, { days: 8 }, { weekly: 4 }, { level: 1.5 }, { extra: 1 }]) {
      expect((await save(id, "arcana", body as unknown as Record<string, number>)).status).toBe(400);
    }
    expect((await api().put(`/api/symbols/${id}/arcana`).send({ level: 1 })).status).toBe(400);
  });

  it("an unknown symbol, another owner's character, or a missing one: not found", async () => {
    const id = await character();
    const theirs = await character("Theirs", { ownerId: "someone-else" });
    for (const res of [await save(id, "nobody", {}), await save(theirs, "arcana", {}), await save(99_999, "arcana", {})]) expect([res.status, res.body.error]).toEqual([404, "Not found"]);
  });

  it("deleting a character deletes its symbols", async () => {
    const id = await character();
    await ok(save(id, "arcana", { level: 3 }));
    await ok(api().delete(`/api/characters/${id}`));
    expect(await db().symbolState.count()).toBe(0);
  });
});
