import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { HEXA_DEFAULTS, STATS_DEFAULTS, type StatsInput } from "@miku/shared";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { coreAttAt } from "../src/calc/hexa";
import { type CoreKey, hexaDamage } from "../src/calc/hexaDamage";
import { statsScore } from "../src/calc/stats";
import { db } from "../src/db";
import { CORE_OF, hexaJob } from "../src/gameFigures/hexa";
import { SYMBOLS } from "../src/gameFigures/symbols";
import { cooldownRefs, statLinks, statsJob } from "../src/gameFigures/stats";
import { SOLE_OWNER } from "../src/owner";
import { forgetHexa } from "../src/services/hexa";
import { api, ok } from "./api";
import { NOW, useDbTestSetup } from "./helpers";

useDbTestSetup();
beforeAll(forgetHexa);

let made = 0;
async function character(job = "Mercedes", level = 286, ownerId = SOLE_OWNER, worldId = 45) {
  const name = `Stat${++made}`;
  const c = await db().character.create({ data: { ownerId, worldId, name, nameKey: name.toLowerCase(), job, level, exp: 0n, worldRank: 1, sortOrder: made, addedAt: NOW, checkedAt: NOW } });
  return c.id;
}
const get = async (p: string) => (await ok(api().get(p))).body;
const save = (id: number, input: StatsInput) => ok(api().put(`/api/stats/${id}`).send(input));
// The owner's screenshot of MapleScouter: a Mercedes, Lv. 286, Liberated, Decent Combat Orders.
const SCREENSHOT: StatsInput = {
  ...structuredClone(STATS_DEFAULTS),
  stats: { ...STATS_DEFAULTS.stats, main: { base: 7812, per: 784, abs: 28770 }, sub: { base: 4388, per: 205, abs: 710 }, atk: { base: 4293, per: 129, abs: 0 }, dmg: 120, boss: 544, ied: 97.2644, critRate: 213, critDmg: 132.9, cdSec: 5, cdPct: 6, cdSkip: 7.5, buffDuration: 65, statusDmg: 14, elemResist: 5, summon: 10, arcane: 1380, sacred: 660 },
  liberation: true,
  wildHunter: 212,
  artifact: { extraTarget: true, finalAttack: 30 },
  rings: { restraint: 5, continuous: 4, weapon: 5 },
};
const iconDir = path.join(process.env.MIKU_DATA_DIR!, "item-icons");
afterEach(() => rmSync(iconDir, { recursive: true, force: true }));

describe("GET /api/stats/:id", () => {
  it("a new Mercedes: the defaults, its rows (DEX, STR, Attack), its level, Heroic, its HEXA levels from the HEXA page", async () => {
    const id = await character();
    const b = await get(`/api/stats/${id}`);
    expect([b.known, b.shine, b.sacred]).toEqual([true, false, false]);
    expect(b.input).toEqual(STATS_DEFAULTS);
    expect(b.labels).toEqual({ main: "DEX", sub: "STR", third: null, atk: "Attack" });
    expect(b.options).toEqual({ ruinShield: false, oneHanded: false, magic: false });
    expect([b.level, b.heroic]).toEqual([286, true]);
    // every node but Sol Janus, Origin at 1 (the 6th job's)
    expect(b.hexa).toHaveLength(12);
    expect(b.hexa[0]).toMatchObject({ node: "origin", level: 1 });
    expect(b.hexa.some((n: { node: string }) => n.node === "janus")).toBe(false);
    expect(b.out).toMatchObject({ generalRange: 0, atkTotal: 0 });
    expect(b.source).toMatch(/MapleScouter/);
  });

  it("the screenshot's sheet: Final Damage 139.35%, General Range 272,801,300 and ATT 9,830 (MapleScouter's boxes), and the score", async () => {
    const id = await character();
    await save(id, SCREENSHOT);
    const { out } = await get(`/api/stats/${id}`);
    expect(out.finalDamage.toFixed(2)).toBe("139.35");
    expect(out.generalRange).toBe(272_801_300);
    expect(out.atkTotal).toBe(9_830);
    // the score: the formula (checked against mapledoro's engine in calc/stats.test.ts) with this
    // character's level and HEXA levels (Origin 1, the rest 0)
    const job = hexaJob("Mercedes")!;
    const levels = HEXA_DEFAULTS.current;
    const cores = Object.fromEntries(Object.entries(CORE_OF).map(([n, c]) => [c, levels[n as keyof typeof levels]])) as Record<CoreKey, number>;
    const expected = statsScore(statsJob("Mercedes")!, SCREENSHOT, { level: 286, heroic: true, cores: hexaDamage(job.model, cores), coreAtt: coreAttAt(job.att!.points, levels.common3), sacred: false }, statLinks(), cooldownRefs());
    expect([out.score380, out.score300]).toEqual([expected.score380, expected.score300]);
    expect(out.score380).toBeGreaterThan(10_000);
  });

  it("HEXA levels typed on the HEXA page raise the score; the level from the rankings counts", async () => {
    const id = await character();
    await save(id, SCREENSHOT);
    const before = (await get(`/api/stats/${id}`)).out.score380;
    await ok(api().put(`/api/hexa/${id}`).send({ ...structuredClone(HEXA_DEFAULTS), current: { ...HEXA_DEFAULTS.current, origin: 30, mastery1: 20 } }));
    const after = (await get(`/api/stats/${id}`)).out.score380;
    expect(after).toBeGreaterThan(before);
    // Lv. 259: everything 3% less; the Heroic bonus 35% (under 250: Final Damage lower too)
    await db().character.update({ where: { id }, data: { level: 249 } });
    const low = await get(`/api/stats/${id}`);
    expect(low.out.score380).toBeLessThan(after);
    expect(low.out.finalDamage).toBeCloseTo((1.500642 * 1.1 * 1.35 - 1) * 100, 9);
  });

  it("the sacred symbol buff: on once every Sacred symbol (Grand ones too) is maxed on the Symbols page; +20% damage at 380% only", async () => {
    const id = await character();
    await save(id, SCREENSHOT);
    const before = await get(`/api/stats/${id}`);
    expect(before.sacred).toBe(false);
    const sacredOnes = SYMBOLS.filter((y) => y.kind === "sacred");
    // all but the last maxed: still off
    await db().symbolState.createMany({ data: sacredOnes.map((y, i) => ({ characterId: id, symbol: y.id, level: i === sacredOnes.length - 1 ? 10 : 11, held: 0, days: 0, weekly: 0 })) });
    expect((await get(`/api/stats/${id}`)).sacred).toBe(false);
    await db().symbolState.update({ where: { characterId_symbol: { characterId: id, symbol: sacredOnes.at(-1)!.id } }, data: { level: 11 } });
    const after = await get(`/api/stats/${id}`);
    expect(after.sacred).toBe(true);
    expect(after.out.score380).toBeGreaterThan(before.out.score380);
    expect(after.out.score300).toBe(before.out.score300);
    // (the Arcane ones don't matter)
    expect(sacredOnes.length).toBe(8);
  });

  it("each job's rows: Demon Avenger HP and STR; Xenon STR, DEX, LUK; the LUK thieves LUK, DEX, STR; a magician's Magic ATT", async () => {
    const labels = async (job: string) => (await get(`/api/stats/${await character(job)}`)).labels;
    expect(await labels("Demon Avenger")).toEqual({ main: "HP", sub: "STR", third: null, atk: "Attack" });
    expect(await labels("Xenon")).toEqual({ main: "STR", sub: "DEX", third: "LUK", atk: "Attack" });
    expect(await labels("Shadower")).toEqual({ main: "LUK", sub: "DEX", third: "STR", atk: "Attack" });
    expect(await labels("Kanna")).toEqual({ main: "INT", sub: "LUK", third: null, atk: "Magic ATT" });
    expect(await labels("Night Walker")).toEqual({ main: "LUK", sub: "DEX", third: null, atk: "Attack" });
  });

  it("each job's options: the Ruin Force Shield for the Demon jobs, one- or two-handed for Hero, Paladin, Dawn Warrior", async () => {
    const options = async (job: string) => (await get(`/api/stats/${await character(job)}`)).options;
    expect(await options("Demon Slayer")).toEqual({ ruinShield: true, oneHanded: false, magic: false });
    expect(await options("Demon Avenger")).toMatchObject({ ruinShield: true });
    expect(await options("Hero")).toEqual({ ruinShield: false, oneHanded: true, magic: false });
    expect(await options("Bishop")).toEqual({ ruinShield: false, oneHanded: false, magic: true });
  });

  it("a SHINE class, or a job the figures don't have: not worked out, saying which", async () => {
    const sia = await get(`/api/stats/${await character("Sia Astelle")}`);
    expect([sia.known, sia.shine, sia.hexa, sia.out.score380]).toEqual([false, true, [], null]);
    const jett = await get(`/api/stats/${await character("Jett")}`);
    expect(jett).toMatchObject({
      known: false,
      shine: false,
      labels: { main: "Main stat", sub: "Secondary stat", third: null, atk: "Attack" },
      options: { ruinShield: false, oneHanded: false, magic: false },
      sacred: false,
      hexa: [],
      icons: {},
      out: { finalDamage: 0, generalRange: 0, atkTotal: 0, score380: null, score300: null },
    });
    expect(jett.input).toEqual(STATS_DEFAULTS);
  });

  it("the Oz rings', HEXA nodes' and buffs' pictures, once downloaded", async () => {
    const id = await character();
    mkdirSync(path.join(iconDir, "hexa"), { recursive: true });
    writeFileSync(path.join(iconDir, "1113098.png"), "png");
    writeFileSync(path.join(iconDir, "hexa", "Mercedes_1.png"), "png");
    mkdirSync(path.join(iconDir, "stats"), { recursive: true });
    writeFileSync(path.join(iconDir, "stats", "sayramElixir.png"), "png");
    writeFileSync(path.join(iconDir, "stats", "notes.txt"), "not a picture");
    const b = await get(`/api/stats/${id}`);
    expect(b.rings).toEqual({ restraint: "/item-icons/1113098.png", continuous: null, weapon: null });
    expect(b.hexa[0].icon).toBe("/item-icons/hexa/Mercedes_1.png");
    expect(b.hexa[1].icon).toBeNull();
    expect(b.icons).toEqual({ sayramElixir: "/item-icons/stats/sayramElixir.png" });
  });

  it("someone else's character: not found", async () => {
    const theirs = await character("Mercedes", 286, "someone-else");
    expect((await api().get(`/api/stats/${theirs}`)).status).toBe(404);
    expect((await api().put(`/api/stats/${theirs}`).send(STATS_DEFAULTS)).status).toBe(404);
    expect(await db().statSheet.count()).toBe(0);
  });

  it("a saved sheet from before a change to the input: what still fits kept, the rest (added, changed, gone) falls back on its own", async () => {
    const id = await character();
    const old = JSON.parse(JSON.stringify(SCREENSHOT));
    delete old.events; // (as if added since)
    old.statPotion = 10; // (a field whose kind changed)
    old.buffs.oldBuff = true; // (one since removed)
    await db().statSheet.create({ data: { characterId: id, data: JSON.stringify(old) } });
    const { input } = await get(`/api/stats/${id}`);
    expect(input.stats).toEqual(SCREENSHOT.stats);
    expect(input.events).toEqual(STATS_DEFAULTS.events);
    expect(input.statPotion).toBe(false);
    expect(input.buffs).toEqual(STATS_DEFAULTS.buffs);
    expect(input.liberation).toBe(true);
  });

  it("what a job can't have doesn't count, whatever's saved: a Mercedes's Ruin Force Shield or one-handed weapon, a Kanna's ATT-only food", async () => {
    const mercedes = await character();
    await save(mercedes, SCREENSHOT);
    const plain = (await get(`/api/stats/${mercedes}`)).out;
    await save(mercedes, { ...SCREENSHOT, ruinShield: true, oneHanded: true });
    expect((await get(`/api/stats/${mercedes}`)).out).toEqual(plain);
    const kanna = await character("Kanna");
    const sheet = { ...SCREENSHOT, stats: { ...SCREENSHOT.stats, atk: { base: 3000, per: 100, abs: 0 } } };
    await save(kanna, sheet);
    const none = (await get(`/api/stats/${kanna}`)).out;
    await save(kanna, { ...sheet, buffB: "energizerDrink" });
    expect((await get(`/api/stats/${kanna}`)).out).toEqual(none);
    // its Magic ATT one counts
    await save(kanna, { ...sheet, buffB: "energizerDrinkMagic" });
    expect((await get(`/api/stats/${kanna}`)).out.score380).toBeGreaterThan(none.score380);
    // (and a Demon Slayer's Ruin Force Shield does)
    const ds = await character("Demon Slayer");
    await save(ds, sheet);
    const without = (await get(`/api/stats/${ds}`)).out.finalDamage;
    await save(ds, { ...sheet, ruinShield: true });
    expect((1 + (await get(`/api/stats/${ds}`)).out.finalDamage / 100) / (1 + without / 100)).toBeCloseTo(1.1, 12);
  });

  it("each job's range shape, through the page (Lv. 286, Heroic: × 1.45; by hand)", async () => {
    const range = async (job: string, main: number, sub: number, third: number, oneHanded = false) => {
      const id = await character(job);
      await save(id, { ...STATS_DEFAULTS, oneHanded, stats: { ...STATS_DEFAULTS.stats, main: { base: main, per: 0, abs: 0 }, sub: { base: sub, per: 0, abs: 0 }, third: { base: third, per: 0, abs: 0 }, atk: { base: 2000, per: 0, abs: 0 } } });
      return (await get(`/api/stats/${id}`)).out.generalRange;
    };
    // Demon Avenger: pure HP 545 + 90 × 286 = 26,285 → 7,510; the rest 73,715 / 3.5 → 21,061 × 0.8 = 16,848.8; + STR 1,000
    expect(await range("Demon Avenger", 100_000, 1000, 0)).toBe(Math.floor(Math.round((1.3 * 25_358.8 * 2000) / 100) * 1.19 * 1.45));
    // Xenon: 4 × (1,000 + 1,000 + 1,000)
    expect(await range("Xenon", 1000, 1000, 1000)).toBe(Math.floor(Math.round((1.3125 * 12_000 * 2000) / 100) * 1.17 * 1.45));
    // Shadower: 4 × LUK 1,000 + DEX 100 + STR 50 (Decent Combat Orders: 58.1372%)
    expect(await range("Shadower", 1000, 100, 50)).toBe(Math.floor(Math.round((1.3 * 4150 * 2000) / 100) * 1.581372 * 1.45));
    // Hero: 4 × 1,000 + 100; one-handed 1.34, two-handed 1.44
    expect(await range("Hero", 1000, 100, 0, true)).toBe(Math.floor(Math.round((1.34 * 4100 * 2000) / 100) * 1.375 * 1.45));
    expect(await range("Hero", 1000, 100, 0)).toBe(Math.floor(Math.round((1.44 * 4100 * 2000) / 100) * 1.375 * 1.45));
  });

  it("only this character's Sacred symbols count", async () => {
    const id = await character();
    const other = await character();
    await db().symbolState.createMany({ data: SYMBOLS.filter((y) => y.kind === "sacred").map((y) => ({ characterId: other, symbol: y.id, level: 11, held: 0, days: 0, weekly: 0 })) });
    expect([(await get(`/api/stats/${id}`)).sacred, (await get(`/api/stats/${other}`)).sacred]).toEqual([false, true]);
  });

  it("a food any job can have counts for a magician and for the others alike", async () => {
    const sheet = { ...SCREENSHOT, stats: { ...SCREENSHOT.stats, atk: { base: 3000, per: 100, abs: 0 } } };
    for (const job of ["Kanna", "Mercedes"]) {
      const id = await character(job);
      await save(id, sheet);
      const none = (await get(`/api/stats/${id}`)).out.score380;
      await save(id, { ...sheet, buffB: "onyxApple" });
      expect((await get(`/api/stats/${id}`)).out.score380, job).toBeGreaterThan(none);
    }
  });

  it("Mo Xuan's nodes have no pictures (MapleScouter has none), even with a file named null.png", async () => {
    const id = await character("Mo Xuan");
    mkdirSync(path.join(iconDir, "hexa"), { recursive: true });
    writeFileSync(path.join(iconDir, "hexa", "null.png"), "png");
    expect((await get(`/api/stats/${id}`)).hexa.every((n: { icon: string | null }) => n.icon === null)).toBe(true);
  });

  it("a saved row that no longer passes the rules, or isn't JSON, reads as the defaults", async () => {
    const id = await character();
    await db().statSheet.create({ data: { characterId: id, data: JSON.stringify({ stats: {} }) } });
    expect((await get(`/api/stats/${id}`)).input).toEqual(STATS_DEFAULTS);
    await db().statSheet.update({ where: { characterId: id }, data: { data: '{"stats":' } });
    expect((await get(`/api/stats/${id}`)).input).toEqual(STATS_DEFAULTS);
  });
});

describe("PUT /api/stats/:id", () => {
  it("saves what's typed; saving again replaces it; deleting the character deletes it", async () => {
    const id = await character();
    await save(id, SCREENSHOT);
    const again = { ...SCREENSHOT, eventOn: false };
    await save(id, again);
    expect((await get(`/api/stats/${id}`)).input).toEqual(again);
    await ok(api().delete(`/api/characters/${id}`));
    expect(await db().statSheet.count()).toBe(0);
  });

  it("refuses what the rules don't allow: a link past its level, IED over 100%, an Oz ring past 6, an unknown field", async () => {
    const id = await character();
    const put = (body: object) => api().put(`/api/stats/${id}`).send(body);
    expect((await put({ ...STATS_DEFAULTS, links: { ...STATS_DEFAULTS.links, kain: 4 } })).status).toBe(400);
    await save(id, { ...STATS_DEFAULTS, links: { ...STATS_DEFAULTS.links, kain: 3, thief: 9, magician: 9 } });
    expect((await put({ ...STATS_DEFAULTS, stats: { ...STATS_DEFAULTS.stats, ied: 101 } })).status).toBe(400);
    expect((await put({ ...STATS_DEFAULTS, rings: { restraint: 7, continuous: 0, weapon: 0 } })).status).toBe(400);
    expect((await put({ ...STATS_DEFAULTS, extra: 1 })).status).toBe(400);
    expect((await put({ ...STATS_DEFAULTS, buffs: { ...STATS_DEFAULTS.buffs, nope: true } })).status).toBe(400);
    expect((await put({ ...STATS_DEFAULTS, combatOrders: "maybe" })).status).toBe(400);
    expect((await get(`/api/stats/${id}`)).input.links.kain).toBe(3);
  });
});
