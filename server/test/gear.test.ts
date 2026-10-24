import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getConfig } from "../src/config";
import { db } from "../src/db";
import { gearFile } from "../src/gameFigures/gear";
import { SOLE_OWNER } from "../src/owner";
import { api, ok } from "./api";
import { NOW, useDbTestSetup } from "./helpers";

useDbTestSetup();

// This test run's own item-icons folder, from the test setup (not from the code under test).
const iconDir = path.join(process.env.MIKU_DATA_DIR!, "item-icons");
afterEach(() => rmSync(iconDir, { recursive: true, force: true }));

// Real items from gear-items.json (ids as the wiki gives them).
const ROYAL_ASSASSIN_HOOD = "1003800"; // Thief hat
const ROYAL_WARRIOR_HELM = "1003797"; // Warrior hat
const ABSOLAB_REVENGE_GUARD = "1472261"; // Thief claw
const ABSOLAB_FURIOUS_SWORD = "1215021"; // Ren's sword
const EREVE_BRILLIANCE = "1352972"; // Cygnus Knights' secondary
const VIOLET_IMUGI_GEM = "1354043"; // Ren's secondary
const OATH_OF_DEATH = "1122447"; // a pendant anyone wears
const RESTRAINT = (lv: number) => `1113098-${lv}`;
const CONTINUOUS = (lv: number) => `1113329-${lv}`;
const WEAPON_JUMP_L = (lv: number) => `1113116-${lv}`;
let JOHNS_RING = "";
// (a broken gearFile leaves it empty, so the tests fail rather than the whole file)
beforeAll(() => {
  JOHNS_RING = String(gearFile()?.items.find((i) => i.name === "Treasure Hunter John's Ring")?.id);
});

let made = 0;
async function character(job = "Night Walker", { name = `Char${++made}`, worldId = 45, ownerId = SOLE_OWNER, sortOrder = made } = {}) {
  const c = await db().character.create({ data: { ownerId, worldId, name, nameKey: name.toLowerCase(), job, level: 270, exp: 0n, worldRank: 1, sortOrder, addedAt: NOW, checkedAt: NOW } });
  return c.id;
}
const put = (id: number, slot: string, body: object) => api().put(`/api/gear/${id}/${slot}`).send(body);
const board = async (world = 45) => (await ok(api().get(`/api/gear?world=${world}`))).body;
const equipped = async (id: number) => (await board()).characters.find((c: { id: number }) => c.id === id).equipped;

describe("GET /api/gear", () => {
  it("the window's slots, every item, the jobs, and the world's characters with what each can wear and has on", async () => {
    const nw = await character("Night Walker", { name: "Walker", sortOrder: 0 });
    const ren = await character("Ren", { name: "Imugi", sortOrder: 1 });
    await character("Ren", { worldId: 70 });
    await ok(put(nw, "hat", { item: ROYAL_ASSASSIN_HOOD }));
    await ok(put(nw, "pocket", { other: "Pink Holy Cup (event)" }));
    const b = await board();
    // 25 window slots (5 columns, 6 rows, with gaps), the passive ring slot, 3 totems
    expect(b.slots).toHaveLength(29);
    expect(b.slots.filter((s: { kind: string }) => s.kind === "ring").map((s: { key: string }) => s.key)).toEqual(["ring1", "ring2", "ring3", "ring4", "ringP"]);
    expect(b.items.length).toBeGreaterThan(600);
    expect(b.items.find((i: { key: string }) => i.key === OATH_OF_DEATH)).toEqual({ id: 1122447, key: OATH_OF_DEATH, name: "Oath of Death", slot: "pendant", jobs: null, level: 250, set: "Brilliant Boss", group: "Brilliant Boss", icon: null });
    expect(b.items.find((i: { key: string }) => i.key === RESTRAINT(4))).toMatchObject({ name: "Ring of Restraint Lv. 4", slot: "ring", oz: { kind: "active", level: 4 } });
    expect(b.jobs["Night Walker"]).toEqual({ branches: ["Thief"], weapons: ["Claw"] });
    expect(b.characters.map((c: { name: string }) => c.name)).toEqual(["Walker", "Imugi"]);
    const [walker, imugi] = b.characters;
    expect(walker).toMatchObject({ id: nw, job: "Night Walker", level: 270, avatar: null, knownJob: true, equipped: { hat: { item: ROYAL_ASSASSIN_HOOD }, pocket: { other: "Pink Holy Cup (event)" } } });
    expect(imugi.equipped).toEqual({});
    // Each wears its own class's armor, its own weapon type and secondary, and the shared items.
    expect([ROYAL_ASSASSIN_HOOD, ABSOLAB_REVENGE_GUARD, EREVE_BRILLIANCE, OATH_OF_DEATH].every((k) => walker.fits.includes(k))).toBe(true);
    expect([ROYAL_WARRIOR_HELM, ABSOLAB_FURIOUS_SWORD, VIOLET_IMUGI_GEM].some((k) => walker.fits.includes(k))).toBe(false);
    expect([ROYAL_WARRIOR_HELM, ABSOLAB_FURIOUS_SWORD, VIOLET_IMUGI_GEM, OATH_OF_DEATH].every((k) => imugi.fits.includes(k))).toBe(true);
    expect([ROYAL_ASSASSIN_HOOD, ABSOLAB_REVENGE_GUARD, EREVE_BRILLIANCE].some((k) => imugi.fits.includes(k))).toBe(false);
    // Night Walker: 4 secondaries (shop, Frozen, Princess No, Astra) and 6 claws
    const fitting = (c: { fits: string[] }, slot: string) => b.items.filter((i: { key: string; slot: string }) => i.slot === slot && c.fits.includes(i.key));
    expect(fitting(walker, "secondary").map((i: { name: string }) => i.name).sort()).toEqual(["Astra Obsidian", "Ereve Brilliance", "Frozen Ereve Brilliance", "Princess No's Floral Jewel"]);
    expect(fitting(walker, "weapon")).toHaveLength(6);
  });

  it.each(["Some New Job", "constructor", "toString"])("a job the list doesn't know (%s) is offered every item", async (job) => {
    const id = await character(job);
    const b = await board();
    const c = b.characters.find((x: { id: number }) => x.id === id);
    expect(c.knownJob).toBe(false);
    expect(c.fits).toHaveLength(b.items.length);
    await ok(put(id, "hat", { item: ROYAL_WARRIOR_HELM }));
  });

  it("an item's icon is its address when the data folder has the picture, and the picture is served", async () => {
    expect(getConfig().itemIconDir).toBe(iconDir);
    mkdirSync(iconDir, { recursive: true });
    writeFileSync(path.join(iconDir, "1122447.png"), "PNG bytes");
    const { items } = await board();
    expect(items.find((i: { key: string }) => i.key === OATH_OF_DEATH).icon).toBe("/item-icons/1122447.png");
    expect(items.filter((i: { icon: string | null }) => i.icon !== null)).toHaveLength(1);
    const file = await api().get("/item-icons/1122447.png");
    expect([file.status, file.headers["cache-control"]]).toEqual([200, "public, max-age=2592000"]);
  });

  it("refuses an unknown world", async () => {
    expect((await api().get("/api/gear?world=1")).status).toBe(400);
  });
});

describe("PUT /api/gear/:id/:slot", () => {
  it("puts an item in, replaces it with a typed one and back, and empties the slot", async () => {
    const id = await character();
    const other = await character();
    await ok(put(id, "pendant1", { item: OATH_OF_DEATH }));
    await ok(put(other, "pendant1", { item: OATH_OF_DEATH }));
    expect(await equipped(id)).toEqual({ pendant1: { item: OATH_OF_DEATH } });
    await ok(put(id, "pendant1", { other: "  Dominator Pendant (event)  " }));
    expect(await equipped(id)).toEqual({ pendant1: { other: "Dominator Pendant (event)" } });
    await ok(put(id, "pendant1", { item: OATH_OF_DEATH }));
    expect(await equipped(id)).toEqual({ pendant1: { item: OATH_OF_DEATH } });
    await ok(put(id, "pendant1", { clear: true }));
    await ok(put(id, "pendant2", { clear: true })); // emptying an empty slot is fine
    expect(await equipped(id)).toEqual({});
    expect(await equipped(other)).toEqual({ pendant1: { item: OATH_OF_DEATH } });
  });

  it.each([
    ["hat", { item: OATH_OF_DEATH }, 400, "Oath of Death doesn't go in the hat slot"],
    ["hat", { item: ROYAL_WARRIOR_HELM }, 400, "Walker (Night Walker) can't wear Royal Warrior Helm"],
    ["weapon", { item: ABSOLAB_FURIOUS_SWORD }, 400, "Walker (Night Walker) can't wear AbsoLab Furious Sword"],
    ["secondary", { item: VIOLET_IMUGI_GEM }, 400, "Walker (Night Walker) can't wear Violet Imugi Gem"],
    ["hat", { item: "1234567" }, 400, "Unknown item"],
  ])("refuses %s %j", async (slot, body, status, error) => {
    const id = await character("Night Walker", { name: "Walker" });
    const res = await put(id, slot, body);
    expect([res.status, res.body.error]).toEqual([status, error]);
    expect(await equipped(id)).toEqual({});
  });

  it.each([
    [{ item: "hat" }, "Unknown item"],
    [{ item: "1003800-12" }, "Unknown item"],
    [{ other: "   " }, "Type the item's name"],
    [{ other: "x".repeat(61) }, null],
    [{ clear: false }, null],
    [{}, "Choose an item, type one, or empty the slot"],
    [{ item: OATH_OF_DEATH, other: "both" }, "Choose an item, type one, or empty the slot"],
    [{ item: OATH_OF_DEATH, size: 1 }, null],
  ])("refuses the input %j", async (body, error) => {
    const id = await character();
    const res = await put(id, "pendant1", body);
    expect(res.status).toBe(400);
    if (error) expect(res.body.issues[0].message).toBe(error);
  });

  it("refuses an unknown slot, and someone else's or a missing character", async () => {
    const id = await character();
    const theirs = await character("Night Walker", { ownerId: "someone-else" });
    const unknown = await put(id, "tail", { item: OATH_OF_DEATH });
    expect([unknown.status, unknown.body.error]).toEqual([404, "Not found"]);
    expect((await put(theirs, "pendant1", { item: OATH_OF_DEATH })).status).toBe(404);
    expect((await put(999_999, "pendant1", { item: OATH_OF_DEATH })).status).toBe(404);
    expect((await put(id, "pendant1", { clear: true })).status).toBe(204);
    expect(await db().gearSlot.count()).toBe(0);
  });

  it("only one special skill ring in the four ring slots; it can be swapped in its own slot", async () => {
    const id = await character();
    await ok(put(id, "ring2", { item: RESTRAINT(4) }));
    for (const [slot, item] of [["ring1", CONTINUOUS(4)], ["ring3", WEAPON_JUMP_L(3)], ["ring4", RESTRAINT(6)]]) {
      const res = await put(id, slot!, { item });
      expect([res.status, res.body.error]).toEqual([409, "Only one special skill ring can be in the ring slots (Ring of Restraint Lv. 4 is already in one)."]);
    }
    await ok(put(id, "ring2", { item: CONTINUOUS(5) })); // its own slot: a swap
    await ok(put(id, "ring1", { other: "Some event ring" })); // a typed ring isn't checked
    expect(await equipped(id)).toEqual({ ring2: { item: CONTINUOUS(5) }, ring1: { other: "Some event ring" } });
  });

  it("rings that aren't special skill rings sit beside the opener, in any slot order, and aren't passive rings", async () => {
    const id = await character();
    await ok(put(id, "ring1", { item: JOHNS_RING }));
    await ok(put(id, "ring2", { item: RESTRAINT(4) }));
    await ok(put(id, "ring3", { item: JOHNS_RING }));
    await ok(put(id, "pendant1", { item: OATH_OF_DEATH }));
    await ok(put(id, "ringP", { item: WEAPON_JUMP_L(4) }));
    const notOz = await put(id, "ringP", { item: JOHNS_RING });
    expect([notOz.status, notOz.body.error]).toEqual([400, "Treasure Hunter John's Ring isn't a passive special skill ring"]);
  });

  it("only this character's rings open its passive slot", async () => {
    const id = await character();
    const other = await character();
    await ok(put(other, "ring1", { item: RESTRAINT(4) }));
    expect((await put(id, "ringP", { item: WEAPON_JUMP_L(4) })).status).toBe(409);
  });

  it("the passive ring slot opens with Restraint or Continuous at Lv. 4+, and takes a passive ring or another Continuous", async () => {
    const id = await character();
    const closed = "The passive ring slot opens with a Ring of Restraint or Continuous Ring at Lv. 4 or higher.";
    expect((await put(id, "ringP", { item: WEAPON_JUMP_L(4) })).body.error).toBe(closed);
    expect((await put(id, "ringP", { other: "anything" })).body.error).toBe(closed);
    await ok(put(id, "ring1", { item: RESTRAINT(3) }));
    expect((await put(id, "ringP", { item: WEAPON_JUMP_L(4) })).status).toBe(409); // Lv. 3 doesn't open it
    await ok(put(id, "ring1", { item: RESTRAINT(4) }));
    await ok(put(id, "ringP", { item: WEAPON_JUMP_L(4) }));
    await ok(put(id, "ringP", { item: CONTINUOUS(4) })); // Continuous can be the passive one too
    const typed = await put(id, "ringP", { other: "Some ring" });
    expect([typed.status, typed.body.error]).toEqual([400, "The passive ring slot only takes a special skill ring from the list"]);
    const notPassive = await put(id, "ringP", { item: RESTRAINT(5) });
    expect([notPassive.status, notPassive.body.error]).toEqual([400, "Ring of Restraint Lv. 5 isn't a passive special skill ring"]);
    expect((await put(id, "ringP", { item: OATH_OF_DEATH })).body.error).toBe("Oath of Death doesn't go in the passive ring slot");
    // With Continuous as the active ring, the passive one can't be Continuous as well.
    await ok(put(id, "ringP", { item: WEAPON_JUMP_L(3) }));
    await ok(put(id, "ring1", { item: CONTINUOUS(6) }));
    const twice = await put(id, "ringP", { item: CONTINUOUS(4) });
    expect([twice.status, twice.body.error]).toEqual([400, "The Continuous Ring is already the active ring."]);
    // Taking the opener off keeps the passive ring saved (the page shows it faded).
    await ok(put(id, "ring1", { clear: true }));
    expect(await equipped(id)).toEqual({ ringP: { item: WEAPON_JUMP_L(3) } });
  });

  it("an overall leaves a saved bottom alone (the page greys it out)", async () => {
    const id = await character();
    await ok(put(id, "bottom", { item: "1062288" })); // Eternal Thief Pants
    await ok(put(id, "top", { item: "1052889" })); // AbsoLab Bandit Suit, an overall
    expect(await equipped(id)).toEqual({ bottom: { item: "1062288" }, top: { item: "1052889" } });
  });

  it("deleting a character deletes its gear", async () => {
    const id = await character();
    await ok(put(id, "pendant1", { item: OATH_OF_DEATH }));
    await ok(api().delete(`/api/characters/${id}`));
    expect(await db().gearSlot.count()).toBe(0);
  });
});
