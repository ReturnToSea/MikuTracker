import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { HEXA_DEFAULTS, STATS_DEFAULTS, type StatsInput } from "@miku/shared";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { coreAttAt } from "../src/calc/hexa";
import { type CoreKey, hexaDamage } from "../src/calc/hexaDamage";
import { statsScore } from "../src/calc/stats";
import { db } from "../src/db";
import { bossFigures } from "../src/gameFigures/bossClear";
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
    // in MapleScouter's order (v4.1.0)
    expect(b.hexa.map((n: { node: string }) => n.node)).toEqual(["mastery1", "mastery2", "mastery3", "mastery4", "origin", "ascent", "boost1", "boost2", "boost3", "boost4", "hecate", "common3"]);
    expect(b.hexa[4]).toMatchObject({ node: "origin", level: 1 });
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
    const expected = statsScore(statsJob("Mercedes")!, SCREENSHOT, { level: 286, heroic: true, cores: hexaDamage(job.model!, cores), coreAtt: coreAttAt(job.att!.points, levels.common3), sacred: false }, statLinks(), cooldownRefs());
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
      out: { finalDamage: 0, generalRange: 0, atkTotal: 0, score380: null, score300: null, normal380: null, normal300: null },
      efficiency: null,
      bosses: [],
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
    const icon = (node: string) => b.hexa.find((n: { node: string }) => n.node === node).icon;
    expect(icon("origin")).toBe("/item-icons/hexa/Mercedes_1.png");
    expect(icon("ascent")).toBeNull();
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

// ── v4.1.0 ─────────────────────────────────────────────────────────────────────────────────────
type Boss = { key: string; boss: string; difficulty: string; rate: number; shown: number; tag: string; icon: string | null; phases: { name: string; hp: number[] }[] | null; gaps: { kind: string; you: number; boss: number; full: number; loss: number }[]; need: number; bossStat: number; loss: number };
const bossOf = (b: { bosses: Boss[] }, difficulty: string, boss: string) => b.bosses.find((x) => x.difficulty === difficulty && x.boss === boss)!;

describe("GET /api/stats/:id: the boss clears (v4.1.0)", () => {
  it("every boss of the figures, in their order (MapleScouter's), with its gaps from the character's level and the sheet's Force", async () => {
    const id = await character("Mercedes", 278);
    await save(id, SCREENSHOT);
    const b = await get(`/api/stats/${id}`);
    expect(b.bosses.map((x: Boss) => `${x.difficulty} ${x.boss}`)).toEqual(bossFigures().map((x) => `${x.difficulty} ${x.name}`));
    // Normal Kalos: level 280, Sacred 300 (the figures); the screenshot's Sacred Force 660
    const kalos = bossOf(b, "Normal", "kalos");
    expect(kalos.key).toBe("normal_kalos");
    expect(kalos.gaps).toEqual([
      { kind: "level", you: 278, boss: 280, full: 285, loss: expect.closeTo(1 - 1.007 / 1.2, 9) },
      { kind: "sacred", you: 660, boss: 300, full: 350, loss: 0 },
    ]);
    // Hard Black Mage: Arcane 1320, its best at 110% (1,452); 1,380 is 104%: 100% damage
    expect(bossOf(b, "Hard", "blackMage").gaps.find((g) => g.kind === "arcane")).toEqual({ kind: "arcane", you: 1380, boss: 1320, full: 1452, loss: expect.closeTo(1 - 1 / 1.1, 9) });
  });

  it("the event Arcane and Sacred Power count while the event stats are on, and only for the boss clears", async () => {
    const id = await character();
    const withEvent = { ...SCREENSHOT, eventStats: { ...SCREENSHOT.eventStats, arcane: 50, sacred: 30 } };
    await save(id, withEvent);
    const on = await get(`/api/stats/${id}`);
    expect(bossOf(on, "Hard", "blackMage").gaps.find((g) => g.kind === "arcane")!.you).toBe(1430);
    expect(bossOf(on, "Normal", "kalos").gaps.find((g) => g.kind === "sacred")!.you).toBe(690);
    await save(id, { ...withEvent, eventOn: false });
    const off = await get(`/api/stats/${id}`);
    expect(bossOf(off, "Hard", "blackMage").gaps.find((g) => g.kind === "arcane")!.you).toBe(1380);
    expect(off.out.score380).toBe(on.out.score380);
  });

  it("a boss's own Sacred symbol: maxed, its +20% counts against that boss only", async () => {
    const id = await character();
    await save(id, SCREENSHOT);
    const before = await get(`/api/stats/${id}`);
    await db().symbolState.create({ data: { characterId: id, symbol: "cernium", level: 11, held: 0, days: 0, weekly: 0 } });
    const after = await get(`/api/stats/${id}`);
    // (Seren's damage up by the symbol's +20% damage: 2.3% with this sheet's 664% damage; Kalos's untouched)
    expect(bossOf(after, "Hard", "seren").rate).toBeGreaterThan(bossOf(before, "Hard", "seren").rate * 1.02);
    expect(bossOf(after, "Hard", "seren").bossStat).toBeGreaterThan(bossOf(before, "Hard", "seren").bossStat);
    expect(bossOf(after, "Normal", "kalos").rate).toBe(bossOf(before, "Normal", "kalos").rate);
  });

  it("the Genesis Pass's buff: +150 Arcane Power and more damage against its bosses (Lucid), none against the others (Seren)", async () => {
    const id = await character();
    await save(id, SCREENSHOT);
    const before = await get(`/api/stats/${id}`);
    await save(id, { ...SCREENSHOT, buffs: { ...SCREENSHOT.buffs, genepass: true } });
    const after = await get(`/api/stats/${id}`);
    expect(bossOf(after, "Hard", "lucid").gaps.find((g) => g.kind === "arcane")!.you).toBe(1530);
    expect(bossOf(after, "Hard", "lucid").rate).toBeGreaterThan(bossOf(before, "Hard", "lucid").rate);
    expect(bossOf(after, "Hard", "seren").rate).toBe(bossOf(before, "Hard", "seren").rate);
  });

  it("each boss's picture once downloaded; its phases (a Champion: the difficulty it's built on)", async () => {
    const id = await character();
    await save(id, SCREENSHOT);
    mkdirSync(path.join(iconDir, "bosses"), { recursive: true });
    writeFileSync(path.join(iconDir, "bosses", "hard_seren.png"), "png");
    const b = await get(`/api/stats/${id}`);
    expect(bossOf(b, "Hard", "seren").icon).toBe("/item-icons/bosses/hard_seren.png");
    expect(bossOf(b, "Normal", "seren").icon).toBeNull();
    expect(bossOf(b, "Champion", "seren").phases).toEqual(bossOf(b, "Hard", "seren").phases);
    expect(bossOf(b, "Hard", "verusHilla").phases).toEqual([{ name: "Phase 1", hp: [30184e9, 30184e9, 30184e9, 30184e9] }]);
  });

  it("MapleScouter's \"Normal\": with every HEXA core at 30, the same as the score once every core is at 30 (and Lv. 260+)", async () => {
    const id = await character();
    await save(id, SCREENSHOT);
    const b = await get(`/api/stats/${id}`);
    expect(b.out.normal380).toBeGreaterThan(b.out.score380);
    const all30 = Object.fromEntries(Object.keys(HEXA_DEFAULTS.current).map((n) => [n, 30]));
    await ok(api().put(`/api/hexa/${id}`).send({ ...structuredClone(HEXA_DEFAULTS), current: all30, desired: all30 }));
    const maxed = await get(`/api/stats/${id}`);
    expect([maxed.out.score380, maxed.out.score300]).toEqual([maxed.out.normal380, maxed.out.normal300]);
    expect(maxed.out.normal380).toBe(b.out.normal380);
  });

  it("stat efficiency, worked out from the sheet (calc/statEfficiency.ts)", async () => {
    const id = await character();
    await save(id, SCREENSHOT);
    const { efficiency } = await get(`/api/stats/${id}`);
    expect(efficiency.third).toBeNull();
    expect(efficiency.att).toBeGreaterThan(0);
    expect(efficiency.allStatPct).toBeCloseTo(efficiency.mainPct + efficiency.subPct, 9);
  });

  it("stat efficiency's rows by job: a Shadower's third stat (STR) counts; a Demon Avenger's all stats % leaves out its HP", async () => {
    const shadower = await character("Shadower");
    await save(shadower, SCREENSHOT);
    const s = (await get(`/api/stats/${shadower}`)).efficiency;
    expect(s.third).toBeGreaterThan(0);
    expect(s.allStatPct).toBeCloseTo(s.mainPct + s.subPct + s.thirdPct, 9);
    const da = await character("Demon Avenger");
    await save(da, SCREENSHOT);
    const d = (await get(`/api/stats/${da}`)).efficiency;
    expect(d.third).toBeNull();
    expect(d.allStatPct).toBeCloseTo(d.subPct, 9);
  });

  it("a sheet whose defense leaves nothing at 380% (no IED): no score, no stat efficiency, no boss clears", async () => {
    const id = await character();
    await save(id, { ...SCREENSHOT, stats: { ...SCREENSHOT.stats, ied: 0 } });
    const b = await get(`/api/stats/${id}`);
    expect([b.out.score380, b.efficiency, b.bosses]).toEqual([null, null, []]);
  });
});

describe("POST /api/stats/:id/try (test mode, v4.1.0)", () => {
  const all = (n: number) => Object.fromEntries(Object.keys(HEXA_DEFAULTS.current).map((k) => [k, n]));
  it("the page for a sheet, level and HEXA levels as typed; nothing saved", async () => {
    const id = await character("Mercedes", 286);
    await save(id, SCREENSHOT);
    const saved = await get(`/api/stats/${id}`);
    const tried = (await ok(api().post(`/api/stats/${id}/try`).send({ input: SCREENSHOT, level: 286, hexa: HEXA_DEFAULTS.current }))).body;
    expect(tried.out).toEqual(saved.out);
    expect(tried.bosses).toEqual(saved.bosses);
    // a higher level: the level gaps; maxed HEXA: a higher score; another sheet
    const t = (await ok(api().post(`/api/stats/${id}/try`).send({ input: { ...SCREENSHOT, stats: { ...SCREENSHOT.stats, boss: 600 } }, level: 290, hexa: all(30) }))).body;
    expect(t.level).toBe(290);
    expect(bossOf(t, "Normal", "kalos").gaps[0]!.you).toBe(290);
    expect(t.out.score380).toBeGreaterThan(saved.out.score380);
    expect(t.hexa.every((n: { level: number }) => n.level === 30)).toBe(true);
    // nothing saved
    expect((await get(`/api/stats/${id}`)).input).toEqual(SCREENSHOT);
    expect(await db().hexaPlan.count()).toBe(0);
    expect((await db().character.findUniqueOrThrow({ where: { id } })).level).toBe(286);
  });

  it("under Lv. 260 everything does 3% less, but MapleScouter's \"Normal\" leaves that out", async () => {
    const id = await character("Mercedes", 255);
    // (every core at 30: the score and Normal differ only by the cut)
    const t = (await ok(api().post(`/api/stats/${id}/try`).send({ input: SCREENSHOT, level: 255, hexa: all(30) }))).body;
    expect(t.out.normal380).toBeGreaterThan(t.out.score380);
    const at260 = (await ok(api().post(`/api/stats/${id}/try`).send({ input: SCREENSHOT, level: 260, hexa: all(30) }))).body;
    expect(at260.out.normal380).toBe(at260.out.score380);
  });

  it("the Ascent core at 0: no timer bonus, so a boss with no gaps sees the score itself (Hard Lucid, whatever the other cores)", async () => {
    const id = await character("Mercedes", 290);
    const t = (await ok(api().post(`/api/stats/${id}/try`).send({ input: SCREENSHOT, level: 290, hexa: { ...all(30), ascent: 0 } }))).body;
    const lucid = bossOf(t, "Hard", "lucid");
    expect(lucid.loss).toBeCloseTo(0, 12);
    expect(lucid.bossStat).toBe(t.out.score300);
    // (with Ascent, Hard Lucid's fight is timed short enough for a bonus)
    const a = (await ok(api().post(`/api/stats/${id}/try`).send({ input: SCREENSHOT, level: 290, hexa: all(30) }))).body;
    expect(bossOf(a, "Hard", "lucid").bossStat).toBeGreaterThan(a.out.score300);
  });

  it("refuses a level outside 1–300, a HEXA level past 30 or missing, a sheet that doesn't pass; someone else's character: not found", async () => {
    const id = await character();
    const tryIt = (body: object) => api().post(`/api/stats/${id}/try`).send(body);
    const good = { input: STATS_DEFAULTS, level: 280, hexa: HEXA_DEFAULTS.current };
    expect((await tryIt(good)).status).toBe(200);
    for (const bad of [{ ...good, level: 0 }, { ...good, level: 301 }, { ...good, level: 280.5 }, { ...good, hexa: { ...good.hexa, origin: 31 } }, { input: STATS_DEFAULTS, level: 280 }, { ...good, input: { ...STATS_DEFAULTS, extra: 1 } }]) expect((await tryIt(bad)).status).toBe(400);
    const theirs = await character("Mercedes", 286, "someone-else");
    expect((await api().post(`/api/stats/${theirs}/try`).send(good)).status).toBe(404);
  });
});

describe("the gear pages' stat values, worked out from the Stats page (v4.1.0)", () => {
  const values = async () => (await get("/api/gear?world=45")).characters[0].statValues;
  it("no Stats page: nothing worked out (the defaults); once one is saved: its stat efficiency, what's typed still winning", async () => {
    const id = await character("Mercedes", 286);
    expect((await values()).worked).toBeNull();
    await save(id, SCREENSHOT);
    const { efficiency } = await get(`/api/stats/${id}`);
    const v = await values();
    // a Mercedes: DEX main, STR secondary
    expect(v.worked).toMatchObject({ att: efficiency.att, allStat: efficiency.allStatPct, secRatio: efficiency.sub, bossDmg: efficiency.bossDmg, fdPer100: efficiency.fdPer100, attPct: efficiency.attPct, mainFlat: efficiency.mainFlat, critDmg: efficiency.critDmg, ied300: efficiency.ied300, ied380: efficiency.ied380, dexPct: efficiency.mainPct, strPct: efficiency.subPct, lukPct: null, intPct: null, hpPct: null, cd2: efficiency.cooldown[2], cd6: efficiency.cooldown[6] });
    expect(v.values.att).toBe(efficiency.att);
    await ok(api().put(`/api/gear/${id}/stat-values`).send({ ...v.typed, att: 9 }));
    const typed = await values();
    expect([typed.values.att, typed.values.bossDmg]).toEqual([9, efficiency.bossDmg]);
  });

  it("by job: a Shadower's STR % is its third stat's; a Demon Avenger's HP % its main's and all stats % without it", async () => {
    const shadower = await character("Shadower", 286);
    await save(shadower, SCREENSHOT);
    const s = (await get(`/api/stats/${shadower}`)).efficiency;
    let v = (await get("/api/gear?world=45")).characters.find((c: { id: number }) => c.id === shadower).statValues.worked;
    expect(v).toMatchObject({ lukPct: s.mainPct, dexPct: s.subPct, strPct: s.thirdPct, allStat: s.allStatPct, intPct: null, hpPct: null });
    const da = await character("Demon Avenger", 286);
    await save(da, SCREENSHOT);
    const d = (await get(`/api/stats/${da}`)).efficiency;
    v = (await get("/api/gear?world=45")).characters.find((c: { id: number }) => c.id === da).statValues.worked;
    expect(v).toMatchObject({ hpPct: d.mainPct, strPct: d.subPct, allStat: d.allStatPct, lukPct: null });
    expect(v.allStat).toBeCloseTo(d.subPct, 9);
  });

  it("typed before v4.1.0 (the migration's mark): gives way where the sheet works values out, counts where it doesn't; saving a box clears the mark", async () => {
    const id = await character("Mercedes", 286);
    await db().statValues.create({ data: { characterId: id, att: 9, critDmg: 50, bossDef: 300, typedBefore: true } });
    // (a sheet with no IED works nothing out: what was typed counts)
    await save(id, { ...SCREENSHOT, stats: { ...SCREENSHOT.stats, ied: 0 } });
    let v = await values();
    expect([v.worked, v.typed.att, v.values.att, v.values.critDmg]).toEqual([null, 9, 9, 50]);
    await save(id, SCREENSHOT);
    v = await values();
    expect([v.typed.att, v.typed.critDmg, v.typed.bossDef]).toEqual([null, null, 300]);
    expect(v.values.att).toBe(v.worked.att);
    // a box typed now: saved as typed (the mark gone, so it stays)
    await ok(api().put(`/api/gear/${id}/stat-values`).send({ ...v.typed, att: 7 }));
    v = await values();
    expect([v.typed.att, v.values.att]).toEqual([7, 7]);
    expect((await db().statValues.findUniqueOrThrow({ where: { characterId: id } })).typedBefore).toBe(false);
  });

  it("a SHINE class with a sheet saved: nothing worked out", async () => {
    const id = await character("Sia Astelle", 286);
    await save(id, SCREENSHOT);
    expect((await values()).worked).toBeNull();
  });

  it("follow the HEXA levels (the cores change what each stat is worth)", async () => {
    const id = await character("Mercedes", 286);
    await save(id, SCREENSHOT);
    const before = (await values()).worked.att;
    await ok(api().put(`/api/hexa/${id}`).send({ ...structuredClone(HEXA_DEFAULTS), current: { ...HEXA_DEFAULTS.current, common3: 30 } }));
    expect((await values()).worked.att).not.toBe(before);
  });
});

describe("the cooldown values: what a hat's seconds add, from the sheet's cooldown without the equipped hat's (review, v4.1.0)", () => {
  it("a −2 s hat equipped: the values are worked out from 2 s less than the sheet's (as if no hat)", async () => {
    const id = await character("Mercedes", 286);
    // the screenshot's sheet: 5 s of Cooldown Reduction in all
    await save(id, SCREENSHOT);
    const without = (await get(`/api/stats/${id}`)).efficiency.cooldown;
    // the same sheet with 3 s: what the values would be with nothing on the hat
    await save(id, { ...SCREENSHOT, stats: { ...SCREENSHOT.stats, cdSec: 3 } });
    const from3 = (await get(`/api/stats/${id}`)).efficiency.cooldown;
    await save(id, SCREENSHOT);
    await ok(api().put(`/api/gear/${id}/hat`).send({ item: "1004810" })); // (Arcane Umbra Archer Hat)
    await ok(api().put(`/api/gear/${id}/hat/details`).send({ stars: 0, flames: {}, potential: { rank: "legendary", lines: ["DEX +13%", "DEX +10%", "Skill Cooldown -2 sec"] }, hammers: 0 }));
    const withHat = (await get(`/api/stats/${id}`)).efficiency.cooldown;
    expect(withHat).toEqual(from3);
    expect(withHat).not.toEqual(without);
  });

  it("only the hat's: another slot's cooldown lines, a hat without details or without potential count nothing", async () => {
    const id = await character("Mercedes", 286);
    await save(id, SCREENSHOT);
    const without = (await get(`/api/stats/${id}`)).efficiency.cooldown;
    // (a hat's lines on the top: its potential kind still allows them)
    const details = { stars: 0, flames: {}, potential: { rank: "legendary", lines: ["Skill Cooldown -2 sec", null, null] }, hammers: 0 };
    await db().gearSlot.create({ data: { characterId: id, slot: "top", item: "1004810", details: JSON.stringify(details) } });
    expect((await get(`/api/stats/${id}`)).efficiency.cooldown).toEqual(without);
    await ok(api().put(`/api/gear/${id}/hat`).send({ item: "1004810" }));
    expect((await get(`/api/stats/${id}`)).efficiency.cooldown).toEqual(without);
    await ok(api().put(`/api/gear/${id}/hat/details`).send({ ...details, potential: null }));
    expect((await get(`/api/stats/${id}`)).efficiency.cooldown).toEqual(without);
  });
});
