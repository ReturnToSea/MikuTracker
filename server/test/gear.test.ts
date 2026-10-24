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
    expect(b.items.find((i: { key: string }) => i.key === OATH_OF_DEATH)).toEqual({
      id: 1122447, key: OATH_OF_DEATH, name: "Oath of Death", slot: "pendant", jobs: null, level: 250, set: "Brilliant Boss", group: "Brilliant Boss", icon: null,
      type: "Pendant", stats: { str: 15, dex: 15, int: 15, luk: 15, hpPct: 5, att: 5, matt: 5, def: 300 }, starMax: 30, flames: "boss", potential: "pendant",
    });
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

// ── v2.0.0: stars, flames, potential, hammers, stat values ──────────────────────────────────────
const AU_KNIGHT_HAT = "1004808"; // Arcane Umbra Knight Hat: Lv. 200, Warrior, boss flames, 30★
const IMMORTAL_LEGACY = "1143471"; // medal: boss flames, 3 hammers, no stars or potential
const GOLLUX_EARRINGS = "1032222"; // Reinforced Gollux Earrings: Lv. 140, normal flames
const GENESIS_GUARDS = "1472274"; // Thief claw, fixed 22★
const GUARDIAN_ANGEL = "1113313"; // Guardian Angel Ring: one only
const blankDetails = { stars: 0, flames: {}, potential: null, hammers: 0 };
const putDetails = (id: number, slot: string, body: object) => api().put(`/api/gear/${id}/${slot}/details`).send({ ...blankDetails, ...body });
const details = async (id: number) => (await board()).characters.find((c: { id: number }) => c.id === id).details;

describe("GET /api/gear/options", () => {
  it("a listed item: its star range with what each count adds, its flame grid, potential and hammers", async () => {
    const o = (await ok(api().get(`/api/gear/options?item=${AU_KNIGHT_HAT}`))).body;
    expect([o.stars.min, o.stars.max, o.stars.gains.length, o.stars.unconfirmedFrom]).toEqual([0, 30, 31, null]);
    expect(o.stars.gains[22]).toEqual({ str: 145, dex: 145, int: 0, luk: 0, hp: 260, mp: 0, att: 106, matt: 106, speed: 0, jump: 0 });
    expect(o.flames.find((r: { stat: string }) => r.stat === "STR").values).toEqual([null, null, 33, 44, 55, 66, 77]);
    expect(o.hammers).toBeNull();
    expect(Object.keys(o.potential).sort()).toEqual(["epic", "legendary", "rare", "unique"]);
    const medal = (await ok(api().get(`/api/gear/options?item=${IMMORTAL_LEGACY}`))).body;
    expect([medal.stars.max, medal.potential, medal.hammers.count, medal.flames.length > 0]).toEqual([0, null, 3, true]);
    const genesis = (await ok(api().get(`/api/gear/options?item=${GENESIS_GUARDS}`))).body;
    expect([genesis.stars.min, genesis.stars.max]).toEqual([22, 22]);
  });

  it("where unconfirmed weapon figures start: Lv. 200 weapons at 26★, Lv. 250 (Destiny) at 16★", async () => {
    const items = gearFile().items;
    const key = (name: string) => String(items.find((i) => i.name === name)!.id);
    const arcane = (await ok(api().get(`/api/gear/options?item=${key("Arcane Umbra Illusory Sword")}`))).body;
    const destiny = (await ok(api().get(`/api/gear/options?item=${key("Destiny Sword (Stage 2)")}`))).body;
    expect([arcane.stars.unconfirmedFrom, destiny.stars.unconfirmedFrom, destiny.stars.min, destiny.stars.max]).toEqual([26, 16, 22, 25]);
  });

  it("a typed boss weapon: tiers 3–7, its attack flame from the attack given", async () => {
    const o = (await ok(api().get("/api/gear/options?kind=weapon&level=200&boss=1&att=250&matt=0"))).body;
    const att = o.flames.find((r: { stat: string }) => r.stat === "ATT").values;
    expect(att).toEqual([null, null, 45, 66, 91, 120, 154]); // 18%, 26.4%, 36.3%, 47.916%, 61.4922% of 250, rounded up
  });

  it("a typed item, from what it is", async () => {
    const o = (await ok(api().get("/api/gear/options?kind=pendant&level=160&boss=0&att=0&matt=0"))).body;
    // its own stats aren't known: 16★ adds 13 to all four stats (Lv. 160–199)
    const g16 = o.stars.gains[16];
    const g15 = o.stars.gains[15];
    expect([g16.str - g15.str, g16.dex - g15.dex, g16.int - g15.int, g16.luk - g15.luk]).toEqual([13, 13, 13, 13]);
    expect([o.stars.max, o.flames[0].values]).toEqual([30, [9, 18, 27, 36, 45, null, null]]);
    const emblem = (await ok(api().get("/api/gear/options?kind=emblem&level=200&boss=1&att=0&matt=0"))).body;
    expect([emblem.stars.max, emblem.flames, emblem.potential === null]).toEqual([0, [], false]);
  });

  it("error messages", async () => {
    expect((await api().get("/api/gear/options?item=1234567")).body.error).toBe("Unknown item");
    expect((await api().get("/api/gear/options?kind=tail&level=200&boss=1&att=0&matt=0")).body.error).toBe("Unknown kind of item");
  });

  it.each([
    ["item=1234567", 404],
    ["item=hat", 400],
    ["kind=tail&level=200&boss=1&att=0&matt=0", 400],
    ["kind=hat&level=301&boss=1&att=0&matt=0", 400],
    ["kind=hat&level=200&boss=2&att=0&matt=0", 400],
    ["", 400],
  ])("refuses %s", async (query, status) => {
    expect((await api().get(`/api/gear/options?${query}`)).status).toBe(status);
  });
});

describe("PUT /api/gear/:id/:slot/details", () => {
  it("saves an item's stars, flames and hammers, shown on the board", async () => {
    const id = await character("Hero");
    await ok(put(id, "hat", { item: AU_KNIGHT_HAT }));
    await ok(put(id, "medal", { item: IMMORTAL_LEGACY }));
    await ok(putDetails(id, "hat", { stars: 22, flames: { STR: 6, "STR+DEX": 5, ATT: 5, "All Stats %": 4 } }));
    await ok(putDetails(id, "medal", { hammers: 3, flames: { "Max HP": 7 } }));
    expect(await details(id)).toEqual({
      hat: { ...blankDetails, stars: 22, flames: { STR: 6, "STR+DEX": 5, ATT: 5, "All Stats %": 4 } },
      medal: { ...blankDetails, hammers: 3, flames: { "Max HP": 7 } },
    });
  });

  it("each character's details are its own", async () => {
    const a = await character("Hero");
    const b = await character("Hero");
    await ok(put(a, "hat", { item: AU_KNIGHT_HAT }));
    await ok(put(b, "hat", { item: AU_KNIGHT_HAT }));
    await ok(putDetails(a, "hat", { stars: 5 }));
    await ok(putDetails(b, "hat", { stars: 7 }));
    expect([(await details(a)).hat.stars, (await details(b)).hat.stars]).toEqual([5, 7]);
  });

  it("the same ring in another slot starts blank; a typed item renamed to the same name keeps its details", async () => {
    const id = await character();
    await ok(put(id, "ring1", { item: GUARDIAN_ANGEL }));
    await ok(putDetails(id, "ring1", { stars: 5 }));
    await ok(put(id, "ring1", { clear: true }));
    await ok(put(id, "ring2", { item: GUARDIAN_ANGEL }));
    expect(await details(id)).toEqual({});
    await ok(put(id, "ring2", { item: OATH_OF_DEATH.replace("1122447", "1113341") }));
    await ok(put(id, "ring3", { item: GUARDIAN_ANGEL }));
    await ok(putDetails(id, "ring3", { stars: 6 }));
    await ok(put(id, "ring4", { item: OATH_OF_DEATH.replace("1122447", "1113360") })); // Blissful Nightmare
    expect(Object.keys(await details(id))).toEqual(["ring3"]);
    await ok(put(id, "pocket", { other: "Cup" }));
    await ok(putDetails(id, "pocket", { other: { kind: "pocket", level: 140, boss: false, att: 0, matt: 0 } }));
    await ok(put(id, "pocket", { other: "Cup" }));
    expect((await details(id)).pocket.other.level).toBe(140);
  });

  it("details stay with their slot: the same ring in two slots, the same typed name in two slots", async () => {
    const id = await character();
    const whisper = OATH_OF_DEATH.replace("1122447", "1113341"); // Whisper of the Source
    await ok(put(id, "ring1", { item: whisper }));
    await ok(putDetails(id, "ring1", { stars: 4 }));
    await ok(put(id, "ring2", { item: whisper }));
    await ok(put(id, "pocket", { other: "Cup" }));
    await ok(putDetails(id, "pocket", { other: { kind: "pocket", level: 140, boss: false, att: 0, matt: 0 } }));
    await ok(put(id, "totem1", { other: "Cup" })); // (sorts after "pocket", so a wrong match would find pocket's details)
    expect(Object.keys(await details(id)).sort()).toEqual(["pocket", "ring1"]);
    // into a slot holding something else: still blank
    await ok(put(id, "ring3", { item: OATH_OF_DEATH.replace("1122447", "1113360") })); // Blissful Nightmare
    await ok(put(id, "ring3", { item: whisper }));
    await ok(put(id, "face", { other: "Mug" }));
    await ok(put(id, "face", { other: "Cup" }));
    expect(Object.keys(await details(id)).sort()).toEqual(["pocket", "ring1"]);
  });

  it("changing the item clears its details; picking the same item keeps them", async () => {
    const id = await character("Hero");
    await ok(put(id, "hat", { item: AU_KNIGHT_HAT }));
    await ok(putDetails(id, "hat", { stars: 10 }));
    await ok(put(id, "hat", { item: AU_KNIGHT_HAT }));
    expect((await details(id)).hat.stars).toBe(10);
    await ok(put(id, "hat", { item: ROYAL_WARRIOR_HELM }));
    expect(await details(id)).toEqual({});
  });

  it.each([
    [{ stars: 31 }, 400, null],
    [{ stars: 23 }, 400, "Stars go from 22 to 22 on this item", GENESIS_GUARDS, "weapon"],
    [{ stars: 21 }, 400, "Stars go from 22 to 22 on this item", GENESIS_GUARDS, "weapon"],
    [{ flames: { STR: 3 } }, 400, "This item can't have flames", GUARDIAN_ANGEL, "ring1"],
    [{ potential: { rank: "legendary", lines: [null, null, "STR +10%"] } }, 204, null],
    [{ potential: { rank: "legendary", lines: ["STR +10%", null, null] } }, 400, 'Line 1 can\'t be "STR +10%" on this item'],
    [{ stars: 5 }, 400, "This item can't take stars", IMMORTAL_LEGACY, "medal"],
    [{ flames: { STR: 2 } }, 400, "This item can't roll STR at tier 2"],
    [{ flames: { "Boss damage %": 3 } }, 400, "This item can't roll Boss damage % at tier 3"],
    [{ flames: { STR: 3, DEX: 3, LUK: 3, INT: 3, ATT: 3 } }, 400, null],
    [{ hammers: 1 }, 400, "This item can't take Exceptional Hammers"],
    [{ hammers: 4 }, 400, null, IMMORTAL_LEGACY, "medal"], // past the input rule's 3
    [{ hammers: 2 }, 400, "Exceptional Hammers on this item: at most 1", "1032316", "earrings"], // Commanding Force Earring
    [{ potential: { rank: "legendary", lines: ["Nonsense +99%", null, null] } }, 400, 'Line 1 can\'t be "Nonsense +99%" on this item'],
    [{ potential: { rank: "unique", lines: [null, null, null] } }, 400, "This item can't have potential", IMMORTAL_LEGACY, "medal"],
    [{ other: { kind: "hat", level: 200, boss: true, att: 0, matt: 0 } }, 400, "Only a typed item says what it is"],
  ])("refuses %j", async (body, status, error, item = AU_KNIGHT_HAT, slot = "hat") => {
    const id = await character("Night Walker");
    await db().gearSlot.create({ data: { characterId: id, slot, item } }); // straight in: the job check isn't what's tested
    const res = await putDetails(id, slot, body);
    expect(res.status).toBe(status);
    if (error) expect(res.body.error).toBe(error);
    if (status !== 204) expect(await details(id)).toEqual({});
  });

  it("Gollux earrings roll normal flames (tiers 1–5)", async () => {
    const id = await character();
    await ok(put(id, "earrings", { item: GOLLUX_EARRINGS }));
    await ok(putDetails(id, "earrings", { flames: { LUK: 1, "DEX+LUK": 5 } }));
    expect((await putDetails(id, "earrings", { flames: { LUK: 6 } })).body.error).toBe("This item can't roll LUK at tier 6");
  });

  it("a typed item needs what it is, and is checked against it", async () => {
    const id = await character();
    await ok(put(id, "pocket", { other: "Pink Holy Cup (event)" }));
    expect((await putDetails(id, "pocket", { stars: 0 })).body.error).toBe("Say what kind of item it is, its level, and whether it's a boss item");
    const other = { kind: "pocket", level: 140, boss: false, att: 0, matt: 0 };
    expect((await putDetails(id, "pocket", { stars: 1, other })).body.error).toBe("This item can't take stars");
    expect((await putDetails(id, "pocket", { other: { ...other, kind: "weapon" } })).body.error).toBe("A typed item is the kind of its slot");
    await ok(putDetails(id, "pocket", { flames: { LUK: 5 }, other }));
    expect((await details(id)).pocket).toEqual({ ...blankDetails, flames: { LUK: 5 }, other });
    // renaming it is a different item: blank again
    await ok(put(id, "pocket", { other: "Another cup" }));
    expect(await details(id)).toEqual({});
  });

  it("refuses an empty slot, someone else's character, and bad input", async () => {
    const id = await character();
    expect((await putDetails(id, "hat", {})).body.error).toBe("Nothing is in that slot");
    const theirs = await character("Night Walker", { ownerId: "someone-else" });
    expect((await putDetails(theirs, "hat", {})).status).toBe(404);
    await ok(put(id, "pendant1", { item: OATH_OF_DEATH }));
    expect((await putDetails(id, "pendant1", { flames: { STR: 0 } })).status).toBe(400);
    expect((await putDetails(id, "pendant1", { extra: 1 })).status).toBe(400);
    expect((await putDetails(id, "pendant1", { potential: { rank: "mythic", lines: [null, null, null] } })).status).toBe(400);
    expect((await putDetails(id, "pendant1", { potential: { rank: "unique", lines: [null, null] } })).status).toBe(400);
  });
});

describe("one Guardian Angel Ring", () => {
  it("can't be worn twice; a different ring beside it is fine; its own slot can be re-picked", async () => {
    const id = await character();
    await ok(put(id, "ring1", { item: GUARDIAN_ANGEL }));
    const twice = await put(id, "ring2", { item: GUARDIAN_ANGEL });
    expect([twice.status, twice.body.error]).toEqual([409, "Only one Guardian Angel Ring can be worn."]);
    await ok(put(id, "ring1", { item: GUARDIAN_ANGEL }));
    await ok(put(id, "ring2", { item: OATH_OF_DEATH.replace("1122447", "1113341") })); // Whisper of the Source
  });
});

describe("PUT /api/gear/:id/stat-values", () => {
  it("the defaults until changed, then what was saved, per character", async () => {
    const a = await character();
    const b = await character();
    const defaults = { att: 2.44, allStat: 12.21, secRatio: 0.08, bossDmg: 10.12, hp: 0.014, fdPer100: 0.785 };
    expect((await board()).characters.map((c: { statValues: object }) => c.statValues)).toEqual([defaults, defaults]);
    const mine = { ...defaults, att: 2.6, fdPer100: 0.9 };
    await ok(api().put(`/api/gear/${a}/stat-values`).send(mine));
    await ok(api().put(`/api/gear/${a}/stat-values`).send({ ...mine, att: 2.7 }));
    const values = (await board()).characters.map((c: { statValues: object }) => c.statValues);
    expect(values).toEqual([{ ...mine, att: 2.7 }, defaults]);
    expect(b).toBeGreaterThan(a);
  });

  it.each([[{ att: -1 }], [{ att: "2" }], [{ extra: 1 }], [{}]])("refuses %j", async (change) => {
    const id = await character();
    const body = Object.keys(change).length ? { att: 2.44, allStat: 12.21, secRatio: 0.08, bossDmg: 10.12, hp: 0.014, fdPer100: 0.785, ...change } : {};
    expect((await api().put(`/api/gear/${id}/stat-values`).send(body)).status).toBe(400);
  });

  it("deleting a character deletes its stat values", async () => {
    const id = await character();
    await ok(api().put(`/api/gear/${id}/stat-values`).send({ att: 3, allStat: 12, secRatio: 0.1, bossDmg: 10, hp: 0.01, fdPer100: 0.8 }));
    await ok(api().delete(`/api/characters/${id}`));
    expect(await db().statValues.count()).toBe(0);
  });
});
