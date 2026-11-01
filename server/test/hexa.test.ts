import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { HEXA_DEFAULTS, type HexaInput, type HexaStat } from "@miku/shared";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { statExpected } from "../src/calc/hexa";
import { forgetHexa } from "../src/services/hexa";
import { STAT_PRIMARY_CHANCE, STAT_RANK_COST } from "../src/gameFigures/hexa";
import { db } from "../src/db";
import { SOLE_OWNER } from "../src/owner";
import { api, ok } from "./api";
import { NOW, useDbTestSetup } from "./helpers";

useDbTestSetup();
// (each run works the jobs' figures and orders out afresh: kept from before, mutation testing's planted bugs wouldn't run)
beforeAll(forgetHexa);

let made = 0;
async function character(job = "Ren", ownerId = SOLE_OWNER, worldId = 45) {
  const name = `Char${++made}`;
  const c = await db().character.create({ data: { ownerId, worldId, name, nameKey: name.toLowerCase(), job, level: 275, exp: 0n, worldRank: 1, sortOrder: made, addedAt: NOW, checkedAt: NOW } });
  return c.id;
}
const get = async (path: string) => (await ok(api().get(path))).body;
const save = (id: number, input: HexaInput) => ok(api().put(`/api/hexa/${id}`).send(input));
// A HEXA Stat node as typed: its three lines' levels (and stats), unlocked or not.
const statNode = (levels: [number, number, number], unlocked = true, stats: (HexaStat | null)[] = [null, null, null]): HexaInput["stats"][number] => ({
  lines: levels.map((level, i) => ({ stat: stats[i]!, level })) as HexaInput["stats"][number]["lines"],
  unlocked,
});
const LOCKED = statNode([0, 0, 0], false);
// The expected fragments for a node's rank-ups from rank 0 to 20 (calc/hexa.test.ts checks it by simulation).
const FULL = statExpected(0, 0, 20, STAT_RANK_COST, STAT_PRIMARY_CHANCE);
// Every node's fragments and Sol Erda from 0 to 30 (Origin from 1), Sol Janus apart, worked out by hand
// from the wiki's tables: Origin 4,500 − 100 (145 Sol Erda), Ascent 4,500 (150), 4 Mastery 2,252 (83),
// 4 Boost 3,383 (123), Sol Hecate 6,268 (208), Lotus 4,035 (137).
const NODES_LEFT = { erda: 145 + 150 + 4 * 83 + 4 * 123 + 208 + 137, frags: 4400 + 4500 + 4 * 2252 + 4 * 3383 + 6268 + 4035 };
// (this run's own item-icons folder, from the test setup)
const iconDir = path.join(process.env.MIKU_DATA_DIR!, "item-icons");
afterEach(() => rmSync(iconDir, { recursive: true, force: true }));
const withLevels = (current: Partial<HexaInput["current"]>, more: Partial<HexaInput> = {}): HexaInput => ({ ...structuredClone(HEXA_DEFAULTS), ...more, current: { ...HEXA_DEFAULTS.current, ...current } });

describe("GET /api/hexa?world=", () => {
  it("the world's characters, in tab order, each saying whether its job is worked out (every job but the SHINE classes) and whether it's a SHINE class", async () => {
    await character("Ren");
    await character("Night Walker");
    await character("Sia Astelle");
    await character("Erel Light");
    await character("Jett");
    await character("Ren", SOLE_OWNER, 70);
    const tabs = await get("/api/hexa?world=45");
    expect(tabs.characters.map((c: { job: string; known: boolean; shine: boolean }) => [c.job, c.known, c.shine])).toEqual([
      ["Ren", true, false],
      ["Night Walker", true, false],
      ["Sia Astelle", false, true],
      ["Erel Light", false, true],
      ["Jett", false, false],
    ]);
    expect((await api().get("/api/hexa?world=3")).status).toBe(400);
  });
});

describe("GET /api/hexa/:id", () => {
  it("a Ren with nothing saved: Origin 1, everything wanted at 30; left: every node and every HEXA Stat node (its unlock, its rank-ups on average)", async () => {
    const id = await character();
    const b = await get(`/api/hexa/${id}`);
    expect(b.known).toBe(true);
    expect(b.input).toEqual(HEXA_DEFAULTS);
    expect(b.nodes[0]).toEqual({ key: "origin", name: "Rising Azure Dragon: Divided Heavens", group: "skill", icon: null, min: 1, max: 30 });
    // the fragments a week the page shows and adds up from what's typed
    expect(b.figures).toEqual({ erdaRequest: 90, dungeons: { none: 0, highMountain: 40, anglerCompany: 55, nightmareParadise: 70 } });
    // the wiki's names (Ren/Skills, "HEXA" dropped from the front)
    expect(b.nodes.map((n: { name: string }) => n.name)).toEqual([
      "Rising Azure Dragon: Divided Heavens",
      "Rising Azure Dragon: Heartbound Verse",
      "Plum Blossom Sword: Storm",
      "Imugi Spirit Sword: Spirit Strike",
      "Wish Unending",
      "Second Plum Blossom Sword: Raining Blossoms",
      "Final Plum Blossom Sword: Thousand Blossom Flurry",
      "Soul Immeasurable",
      "Final Plum Blossom Sword: Dancing Annihilation",
      "Final Imugi Spirit Sword: Blade of the Unbound Heart",
      "Sol Janus",
      "Sol Hecate",
      "Lotus Flower",
    ]);
    // nothing invested (Origin's first level is free)
    expect(b.invested).toEqual({ erda: 0, frags: 0, exact: true });
    // the unlocks: 5 + 10 + 15 Sol Erda, 10 + 200 + 350 fragments
    expect(b.left.erda).toBe(NODES_LEFT.erda + 30);
    expect(b.left.frags).toBeCloseTo(NODES_LEFT.frags + 560 + 3 * FULL, 6);
    expect(b.left.exact).toBe(false);
    // the built order starts as MapleScouter's (Wish Unending 0 → 1, +5.33%) and never lists Sol Janus
    expect(b.priority[0]).toMatchObject({ node: "mastery3", name: "Wish Unending", icon: null, from: 0, to: 1, cost: { erda: 3, frags: 50 }, total: { erda: 3, frags: 50 } });
    expect(b.priority[0].fd).toBeCloseTo(5.326667, 2);
    expect(b.priority.some((r: { node: string }) => r.node === "janus")).toBe(false);
    // the rows add up to everything wanted, which is everything left here
    expect(b.priority.at(-1).total.frags).toBeCloseTo(b.left.frags, 6);
    expect(b.fragments.needed).toBeCloseTo(b.left.frags, 6);
    expect(b.source).toMatch(/^MapleScouter's figures \(mapledoro's copy, read \d{4}-\d{2}-\d{2}\); the order built from them$/);
  });

  it("Sol Janus counts in the totals only when ticked (6,268 fragments and 208 Sol Erda more), never in the priority", async () => {
    const id = await character();
    const off = await get(`/api/hexa/${id}`);
    await save(id, { ...structuredClone(HEXA_DEFAULTS), janus: true });
    const on = await get(`/api/hexa/${id}`);
    expect([on.left.frags - off.left.frags, on.left.erda - off.left.erda]).toEqual([6268, 208]);
    expect(on.priority.length).toBe(off.priority.length);
    // still to get: the list's, and Sol Janus's
    expect(on.fragments.needed - off.fragments.needed).toBeCloseTo(6268, 6);
  });

  it("levels typed: invested from 0 (Origin from 1), left to 30; a level wanted below the level now is the level now", async () => {
    const id = await character();
    const input = withLevels({ origin: 10, mastery3: 1, janus: 5 }, { desired: { ...HEXA_DEFAULTS.desired, mastery1: 0, origin: 5 } });
    await save(id, input);
    const b = await get(`/api/hexa/${id}`);
    // Origin 1 → 10: 30+35+40+45+50+55+60+65+200 = 580 fragments, 1+1+1+2+2+2+3+3+10 = 25 Sol Erda; Wish Unending 0 → 1: 50 / 3; Sol Janus not counted
    expect(b.invested).toEqual({ erda: 28, frags: 630, exact: true });
    // nothing wanted for Plum Blossom (0) or Origin (below 10)
    expect(b.priority.some((r: { node: string }) => r.node === "mastery1" || r.node === "origin")).toBe(false);
    // still to get: everything left but Plum Blossom (2,252) and the rest of Origin (4,400 − 580)
    expect(b.fragments.needed).toBeCloseTo(b.left.frags - 2252 - (4400 - 580), 6);
  });

  it("HEXA Stat spent: the unlock, the main line's rank-ups exactly, the additional lines' on average (worked out separately)", async () => {
    const id = await character();
    const stats: HexaInput["stats"] = [statNode([6, 7, 7]), statNode([2, 1, 1]), LOCKED];
    await save(id, { ...structuredClone(HEXA_DEFAULTS), stats });
    const b = await get(`/api/hexa/${id}`);
    expect(b.stats.map((s: { rank: number; unlocked: boolean; needs: unknown }) => [s.rank, s.unlocked, s.needs])).toEqual([
      [20, true, null],
      [4, true, null],
      [0, false, null],
    ]);
    // I: 5 Sol Erda + 10 to unlock; the main line 0 → 6: 10+10+10+20+20+20 = 90; its 14 additional
    // rank-ups ≈ 237.03 (a separate program, summing every order they could have come in)
    expect(b.stats[0].spent.erda).toBe(5);
    expect(b.stats[0].spent.frags).toBeCloseTo(10 + 327.03447586465234, 9);
    // II: 10 + 200; every rank-up with the main line at 0–2 costs 10: exactly 40
    expect(b.stats[1].spent).toEqual({ erda: 10, frags: 240 });
    expect(b.stats[2].spent).toEqual({ erda: 0, frags: 0 });
    expect(b.invested.exact).toBe(false);
    // left: I nothing; II its rank-ups from 4 (main line at 2) on average; III its unlock and all 20 (an
    // average while any node isn't at 20, even with one that is)
    expect(b.left.exact).toBe(false);
    expect(b.stats[0].left).toEqual({ erda: 0, frags: 0 });
    expect(b.stats[1].left.frags).toBeCloseTo(statExpected(2, 4, 20, STAT_RANK_COST, STAT_PRIMARY_CHANCE), 9);
    expect(b.stats[2].left.erda).toBe(15);
    expect(b.stats[2].left.frags).toBeCloseTo(350 + FULL, 9);
    // in the priority, to 20 (I is done), each with what's still to come of its final damage
    const rows = b.priority.filter((r: { node: string }) => r.node.startsWith("stat"));
    expect(rows.map((r: { node: string; name: string; from: number; to: number; fd: number }) => [r.node, r.name, r.from, r.to, r.fd])).toEqual([
      ["stat2", "HEXA Stat II", 4, 20, b.stats[1].fdToCome],
      ["stat3", "HEXA Stat III", 0, 20, b.stats[2].fdToCome],
    ]);
    // every node at its main line 0–2 or nothing yet: exact
    await save(id, { ...structuredClone(HEXA_DEFAULTS), stats: [statNode([0, 10, 10]), statNode([2, 1, 1]), LOCKED] });
    const exact = await get(`/api/hexa/${id}`);
    expect(exact.stats[0].spent).toEqual({ erda: 5, frags: 210 });
    expect(exact.invested.exact).toBe(true);
  });

  it("HEXA Stat: a node with a level is unlocked even unticked; one ticked at rank 0 has its unlock spent, none left to pay", async () => {
    const id = await character();
    await save(id, { ...structuredClone(HEXA_DEFAULTS), stats: [statNode([1, 0, 0], false), statNode([0, 0, 0], true), LOCKED] });
    const b = await get(`/api/hexa/${id}`);
    expect(b.stats[0]).toMatchObject({ unlocked: true, spent: { erda: 5, frags: 20 } });
    expect(b.stats[1]).toMatchObject({ unlocked: true, spent: { erda: 10, frags: 200 } });
    expect(b.stats[1].left).toEqual({ erda: 0, frags: FULL });
  });

  it("HEXA Stat: a character below a node's level can't take it yet (not in the priority or still to get), but it's in what's left", async () => {
    const low = await db().character.create({ data: { ownerId: SOLE_OWNER, worldId: 45, name: "Low", nameKey: "low", job: "Ren", level: 262, exp: 0n, worldRank: 1, sortOrder: 99, addedAt: NOW, checkedAt: NOW } });
    const b = await get(`/api/hexa/${low.id}`);
    expect(b.stats.map((s: { needs: unknown }) => s.needs)).toEqual([null, 265, 270]);
    expect(b.priority.filter((r: { node: string }) => r.node.startsWith("stat")).map((r: { node: string; name: string }) => [r.node, r.name])).toEqual([["stat1", "HEXA Stat I"]]);
    expect(b.left.frags).toBeCloseTo(NODES_LEFT.frags + 560 + 3 * FULL, 6);
    expect(b.fragments.needed).toBeCloseTo(NODES_LEFT.frags + 10 + FULL, 6);
    // the full order's ready days count the same: the last step's is what's still to get, at 10 a day
    await save(low.id, { ...structuredClone(HEXA_DEFAULTS), perDay: 10 });
    const daily = await get(`/api/hexa/${low.id}`);
    expect(daily.order.at(-1).days).toBeCloseTo(daily.fragments.needed / 10, 6);
    // exactly at the level: it can (Lv. 265 for II); a node already unlocked needs nothing
    const at = await db().character.create({ data: { ownerId: SOLE_OWNER, worldId: 45, name: "At", nameKey: "at", job: "Ren", level: 265, exp: 0n, worldRank: 1, sortOrder: 98, addedAt: NOW, checkedAt: NOW } });
    await save(at.id, { ...structuredClone(HEXA_DEFAULTS), stats: [statNode([0, 0, 0]), LOCKED, statNode([1, 0, 0], false)] });
    expect((await get(`/api/hexa/${at.id}`)).stats.map((s: { needs: unknown }) => s.needs)).toEqual([null, null, null]);
  });

  it("fragments: Erda's Request 90 and the Epic Dungeon's a week, plus farming a day; the days until everything wanted, and per row", async () => {
    const id = await character();
    const input = withLevels({}, { owned: 1000, perDay: 30, erdaRequest: true, dungeon: "nightmareParadise" });
    await save(id, input);
    const b = await get(`/api/hexa/${id}`);
    expect(b.fragments.perWeek).toBe(160);
    const needed = b.left.frags - 1000;
    expect(b.fragments.needed).toBeCloseTo(needed, 6);
    expect(b.fragments.days).toBeCloseTo(needed / (30 + 160 / 7), 6);
    // the first rows are already affordable with 1,000 owned: 0 days; later ones wait
    expect(b.priority[0].days).toBe(0);
    const later = b.priority.find((r: { total: { frags: number } }) => r.total.frags > 1000);
    expect(later.days).toBeCloseTo((later.total.frags - 1000) / (30 + 160 / 7), 6);
    for (const [dungeon, week] of [["highMountain", 40], ["anglerCompany", 55], ["none", 0]] as const) {
      await save(id, { ...input, erdaRequest: false, dungeon });
      expect((await get(`/api/hexa/${id}`)).fragments.perWeek).toBe(week);
    }
    // nothing coming in: never
    await save(id, { ...input, perDay: 0, erdaRequest: false, dungeon: "none" });
    expect((await get(`/api/hexa/${id}`)).fragments.days).toBeNull();
  });

  it("everything done: nothing left (exact), nothing in the priority, no days; invested: everything", async () => {
    const id = await character();
    const max = Object.fromEntries(Object.keys(HEXA_DEFAULTS.current).map((k) => [k, 30])) as HexaInput["current"];
    await save(id, { ...structuredClone(HEXA_DEFAULTS), current: max, stats: [statNode([10, 5, 5]), statNode([6, 7, 7]), statNode([8, 6, 6])] });
    const b = await get(`/api/hexa/${id}`);
    expect([b.left, b.priority, b.fragments.days, b.fdToDesired]).toEqual([{ erda: 0, frags: 0, exact: true }, [], 0, 0]);
    // the nodes (Sol Janus not counted) and the three HEXA Stat nodes (unlocks 30 / 560; rank-ups
    // 518.90 + 327.03 + 405.24, from the separate program)
    expect(b.invested.erda).toBe(NODES_LEFT.erda + 30);
    expect(b.invested.frags).toBeCloseTo(NODES_LEFT.frags + 1811.1750161089592, 6);
    expect(b.order.every((s: { done: boolean }) => s.done)).toBe(true);
  });

  it("the final damage left: every row's gains together; the nodes' about +90% from scratch (MapleScouter's +89.97%), each HEXA Stat node's its own", async () => {
    const id = await character();
    const b = await get(`/api/hexa/${id}`);
    const together = (fds: number[]) => (fds.reduce((m, g) => m * (1 + g / 100), 1) - 1) * 100;
    expect(b.fdToDesired).toBeCloseTo(together(b.priority.map((r: { fd: number }) => r.fd)), 9);
    const nodes = together(b.priority.filter((r: { node: string }) => !r.node.startsWith("stat")).map((r: { fd: number }) => r.fd));
    expect(Math.abs(nodes - 89.97)).toBeLessThan(0.5);
    expect(b.priority.filter((r: { node: string }) => r.node.startsWith("stat")).map((r: { fd: number }) => r.fd)).toEqual(b.stats.map((s: { fdToCome: number }) => s.fdToCome));
  });

  it("the full order: every step, the same node several in a row joined; done, cost, and the days until each", async () => {
    const id = await character();
    await save(id, withLevels({ mastery3: 3, mastery1: 1 }, { owned: 100, perDay: 10, stats: [statNode([6, 7, 7]), LOCKED, LOCKED] }));
    const b = await get(`/api/hexa/${id}`);
    // every node to 30 and the three HEXA Stat nodes: never the same node twice in a row
    expect(b.order.every((s: { node: string }, i: number) => i === 0 || s.node !== b.order[i - 1].node)).toBe(true);
    // the nodes' gains are the same together as a new character's whole priority's (a joined step's multiply)
    const nodeFd = (steps: { node: string; fd: number }[]) => (steps.filter((s) => !s.node.startsWith("stat")).reduce((m, s) => m * (1 + s.fd / 100), 1) - 1) * 100;
    const fresh = await get(`/api/hexa/${await character()}`);
    expect(nodeFd(b.order)).toBeCloseTo(nodeFd(fresh.priority), 6);
    expect(b.order.slice(0, 3)).toMatchObject([
      { node: "mastery3", name: "Wish Unending", from: 0, to: 1, cost: { erda: 3, frags: 50 }, done: true, days: 0 },
      { node: "mastery1", from: 0, to: 1, done: true, days: 0 },
      { node: "mastery2", from: 0, to: 1, cost: { erda: 3, frags: 50 }, done: false, days: 0 },
    ]);
    // HEXA Stat steps: to 20, done when at 20; their cost: the unlock and every rank-up from 0, on average;
    // their final damage: from rank 0 to 20, on average (I with the stats it's worked out with, the
    // others assumed: both about +3 to 5%)
    const stat = b.order.filter((s: { node: string }) => s.node.startsWith("stat"));
    expect(stat.map((s: { node: string; to: number; done: boolean }) => [s.node, s.to, s.done])).toEqual([
      ["stat1", 20, true],
      ["stat2", 20, false],
      ["stat3", 20, false],
    ]);
    for (const s of stat) {
      expect(s.fd).toBeGreaterThan(3);
      expect(s.fd).toBeLessThan(5);
    }
    expect(stat[0].cost.frags).toBeCloseTo(10 + FULL, 9);
    expect(stat.map((x: { name: string }) => x.name)).toEqual(["HEXA Stat I", "HEXA Stat II", "HEXA Stat III"]);
    // a HEXA Stat step's day: the step before's, plus what it still costs (II: its unlock and all 20) at 10 a day
    const at = b.order.findIndex((x: { node: string }) => x.node === "stat2");
    expect(b.order[at].days).toBeCloseTo(b.order[at - 1].days + (200 + FULL) / 10, 6);
    // days: what's still owed up to each step, after the 100 owned, at 10 a day; the last one is everything
    expect(b.order.at(-1).days).toBeCloseTo((b.fragments.needed) / 10, 6);
    const third = 50; // Spirit Strike 0 → 1, the first step not done
    expect(b.order.find((s: { done: boolean; days: number }) => !s.done && s.days > 0).days).toBeGreaterThan((third - 100) / 10);
  });

  it("another job (Night Walker): the wiki's names, MapleScouter's icons, its own order", async () => {
    const id = await character("Night Walker");
    mkdirSync(path.join(iconDir, "hexa"), { recursive: true });
    for (const f of ["NightWalker_1", "NightWalker_10", "NightWalker_11"]) writeFileSync(path.join(iconDir, "hexa", `${f}.png`), "PNG bytes");
    const b = await get(`/api/hexa/${id}`);
    expect(b.known).toBe(true);
    expect(b.nodes.map((n: { name: string }) => n.name)).toEqual(["Silence", "Stygian Command", "Quintuple Star", "Shadow Bat", "Dark Omen", "Dominion", "Shadow Spear", "Greater Dark Servant", "Shadow Bite", "Rapid Throw", "Sol Janus", "Sol Hecate", "Phalanx Charge"]);
    expect(b.nodes.filter((n: { icon: string | null }) => n.icon).map((n: { key: string; icon: string }) => [n.key, n.icon])).toEqual([
      ["origin", "/item-icons/hexa/NightWalker_1.png"],
      ["ascent", "/item-icons/hexa/NightWalker_10.png"],
      ["common3", "/item-icons/hexa/NightWalker_11.png"],
    ]);
    // not Ren's order: it starts with Shadow Bat (Mastery 2)
    expect(b.priority[0]).toMatchObject({ node: "mastery2", from: 0, to: 1 });
    expect(b.priority.some((r: { node: string }) => r.node === "janus")).toBe(false);
  });

  it("HEXA Stat's damage: each line's amount × what 1 of its stat is worth (the character's stat values) × final damage per main stat", async () => {
    const id = await character();
    // made-up stat values: 1 ATT = 4 main stat, 1% boss = 12, 1% crit damage 40, 1% IED 15 (300%) / 20 (380%), 1 flat main stat 0.3; 1% final damage per 100
    await db().statValues.create({ data: { characterId: id, att: 4, allStat: 14, secRatio: 0.1, bossDmg: 12, fdPer100: 1, attPct: 50, mainFlat: 0.3, critDmg: 40, ied300: 15, ied380: 20, bossDef: 300, cdMin: 0 } });
    await save(id, { ...structuredClone(HEXA_DEFAULTS), stats: [statNode([10, 5, 5], true, ["att", "mainStat", "critDmg"]), statNode([0, 0, 0], true, ["ied", "dmg", "bossDmg"]), LOCKED] });
    const b = await get(`/api/hexa/${id}`);
    // I: ATT main 10 → 100 ATT × 4; main stat additional 5 → 500 × 0.3; crit additional 5 → 1.75% × 40: 619 main stat, 6.19% final damage; at 20: nothing to come
    expect(b.stats[0]).toMatchObject({ worked: ["att", "mainStat", "critDmg"], assumed: false, fdToCome: 0 });
    expect(b.stats[0].fdNow).toBeCloseTo((400 + 150 + 70) / 100, 12);
    // II: nothing yet; at 20 its IED (300% bosses: 15 each), damage and boss lines on average
    expect(b.stats[1]).toMatchObject({ worked: ["ied", "dmg", "bossDmg"], assumed: false, fdNow: 0 });
    expect(b.stats[1].fdToCome).toBeGreaterThan(0);
    // 380% bosses: IED worth more, so II's to come more
    await db().statValues.update({ where: { characterId: id }, data: { bossDef: 380 } });
    expect((await get(`/api/hexa/${id}`)).stats[1].fdToCome).toBeGreaterThan(b.stats[1].fdToCome);
    // III: no stats picked: the best for the character, its main line not I's or II's (ATT, IED)
    expect(b.stats[2].assumed).toBe(true);
    expect(["att", "ied"]).not.toContain(b.stats[2].worked[0]);
    expect(new Set(b.stats[2].worked).size).toBe(3);
  });

  it("HEXA Stat's assumed stats: each node's main line skips the main lines of the others, picked or assumed before it", async () => {
    const id = await character();
    // ATT worth most (1 flat main stat almost nothing): the best main line
    await db().statValues.create({ data: { characterId: id, att: 4, allStat: 14, secRatio: 0.1, bossDmg: 12, fdPer100: 1, attPct: 50, mainFlat: 0.01, critDmg: 40, ied300: 15, ied380: 20, bossDef: 380, cdMin: 0 } });
    const b = await get(`/api/hexa/${id}`);
    // none picked: three different main lines, the best first (ATT 100 × 4 = 400, IED 20 × 20, crit 7 × 40, boss 20 × 12)
    expect(b.stats.map((s: { worked: string[] }) => s.worked[0])).toEqual(["att", "ied", "critDmg"]);
    // ATT picked as III's main line: I and II skip it
    await save(id, { ...structuredClone(HEXA_DEFAULTS), stats: [LOCKED, LOCKED, statNode([0, 0, 0], false, ["att", null, null])] });
    const picked = await get(`/api/hexa/${id}`);
    expect(picked.stats.map((s: { worked: string[] }) => s.worked[0])).toEqual(["ied", "critDmg", "att"]);
  });

  it("HEXA Stat's place in the order: by its damage per fragment, among the nodes' steps (Ren's first comes after a few steps, before most)", async () => {
    const b = await get(`/api/hexa/${await character()}`);
    const at = b.priority.findIndex((r: { node: string }) => r.node === "stat1");
    expect(at).toBeGreaterThan(3);
    expect(at).toBeLessThan(b.priority.length / 4);
  });

  it("HEXA Stat's damage: a Xenon's main stat line isn't worked out (All Stats, not main stat): nothing", async () => {
    const id = await character("Xenon");
    await save(id, { ...structuredClone(HEXA_DEFAULTS), stats: [statNode([10, 5, 5], true, ["mainStat", "att", "critDmg"]), LOCKED, LOCKED] });
    const x = await get(`/api/hexa/${id}`);
    const ren = await character();
    await save(ren, { ...structuredClone(HEXA_DEFAULTS), stats: [statNode([10, 5, 5], true, ["mainStat", "att", "critDmg"]), LOCKED, LOCKED] });
    const r = await get(`/api/hexa/${ren}`);
    // the defaults: 1 flat main stat 0.29, 1 ATT 4, 1% crit damage 42.38, 0.785% final damage per 100
    expect(x.stats[0].fdNow).toBeCloseTo(((25 * 4 + 1.75 * 42.38) * 0.785) / 100, 12);
    expect(r.stats[0].fdNow).toBeCloseTo(((2000 * 0.29 + 25 * 4 + 1.75 * 42.38) * 0.785) / 100, 12);
  });

  it("icons: none until downloaded into the data folder's item-icons/hexa/, then their addresses, served", async () => {
    const id = await character();
    const none = await get(`/api/hexa/${id}`);
    expect([none.nodes[0].icon, none.icons]).toEqual([null, { stat: null, erda: null, frags: null }]);
    mkdirSync(path.join(iconDir, "hexa"), { recursive: true });
    for (const f of ["Len_1", "General_1_0", "Len_8", "hexa-stat", "sol-erda", "sol-erda-fragment"]) writeFileSync(path.join(iconDir, "hexa", `${f}.png`), "PNG bytes");
    const b = await get(`/api/hexa/${id}`);
    expect(b.nodes.filter((n: { icon: string | null }) => n.icon).map((n: { key: string; icon: string }) => [n.key, n.icon])).toEqual([
      ["origin", "/item-icons/hexa/Len_1.png"],
      ["mastery3", "/item-icons/hexa/Len_8.png"],
      ["janus", "/item-icons/hexa/General_1_0.png"],
    ]);
    expect(b.icons).toEqual({ stat: "/item-icons/hexa/hexa-stat.png", erda: "/item-icons/hexa/sol-erda.png", frags: "/item-icons/hexa/sol-erda-fragment.png" });
    expect(b.priority[0].icon).toBe("/item-icons/hexa/Len_8.png");
    expect(b.order.find((s: { node: string }) => s.node === "stat1").icon).toBe("/item-icons/hexa/hexa-stat.png");
    expect((await api().get("/item-icons/hexa/Len_1.png")).status).toBe(200);
    // Mo Xuan: MapleScouter has no icons for it, so none, whatever's in the folder
    writeFileSync(path.join(iconDir, "hexa", "null.png"), "PNG bytes");
    const mo = await get(`/api/hexa/${await character("Mo Xuan")}`);
    expect(mo.nodes.filter((n: { icon: string | null }) => n.icon).map((n: { key: string }) => n.key)).toEqual(["janus"]);
  });

  it("a job not worked out (a SHINE class, one the figures don't have): known false, nothing else; another owner's character: 404", async () => {
    const nw = await character("Sia Astelle");
    await save(nw, withLevels({}, { erdaRequest: true, dungeon: "anglerCompany" }));
    const b = await get(`/api/hexa/${nw}`);
    const none = { erda: 0, frags: 0, exact: true };
    expect(b).toEqual({ known: false, input: withLevels({}, { erdaRequest: true, dungeon: "anglerCompany" }), nodes: [], invested: none, left: none, stats: [], priority: [], fdToDesired: 0, fragments: { perWeek: 145, needed: 0, days: 0 }, order: [], icons: { stat: null, erda: null, frags: null }, figures: { erdaRequest: 90, dungeons: { none: 0, highMountain: 40, anglerCompany: 55, nightmareParadise: 70 } }, source: "" });
    const theirs = await character("Ren", "someone-else");
    expect((await api().get(`/api/hexa/${theirs}`)).status).toBe(404);
    expect((await api().put(`/api/hexa/${theirs}`).send(HEXA_DEFAULTS)).status).toBe(404);
  });

  it("a saved row that no longer passes the rules reads as the defaults", async () => {
    const id = await character();
    await db().hexaPlan.create({ data: { characterId: id, data: JSON.stringify({ current: { origin: 99 } }) } });
    expect((await get(`/api/hexa/${id}`)).input).toEqual(HEXA_DEFAULTS);
    // or isn't JSON at all
    await db().hexaPlan.update({ where: { characterId: id }, data: { data: '{"current":' } });
    expect((await get(`/api/hexa/${id}`)).input).toEqual(HEXA_DEFAULTS);
  });
});

describe("PUT /api/hexa/:id", () => {
  it("saves what's typed; saving again replaces it; deleting the character deletes it", async () => {
    const id = await character();
    const a = withLevels({ ascent: 3 }, { owned: 5 });
    await save(id, a);
    await save(id, { ...a, owned: 7 });
    expect((await get(`/api/hexa/${id}`)).input).toEqual({ ...a, owned: 7 });
    await ok(api().delete(`/api/characters/${id}`));
    expect(await db().hexaPlan.count()).toBe(0);
  });

  it("takes a stat in another node's additional lines, or as another node's additional line what's one node's main", async () => {
    const id = await character();
    const stats: HexaInput["stats"] = [statNode([1, 0, 0], true, ["att", "bossDmg", "mainStat"]), statNode([0, 0, 0], true, ["bossDmg", "att", "mainStat"]), statNode([0, 0, 0], false, ["critDmg", "att", null])];
    await save(id, { ...structuredClone(HEXA_DEFAULTS), stats });
    expect((await get(`/api/hexa/${id}`)).input.stats).toEqual(stats);
  });

  it.each([
    ["Origin below 1", { current: { ...HEXA_DEFAULTS.current, origin: 0 } }],
    ["a level past 30", { current: { ...HEXA_DEFAULTS.current, ascent: 31 } }],
    ["a node missing", { current: { origin: 1 } }],
    ["a HEXA Stat node past 20 in all", { stats: [statNode([10, 10, 1]), LOCKED, LOCKED] }],
    ["a HEXA Stat line past 10", { stats: [statNode([11, 0, 0]), LOCKED, LOCKED] }],
    ["the same stat twice in a node", { stats: [statNode([0, 0, 0], true, ["att", null, "att"]), LOCKED, LOCKED] }],
    ["the same main line in two nodes", { stats: [statNode([0, 0, 0], true, ["att", null, null]), LOCKED, statNode([0, 0, 0], false, ["att", null, null])] }],
    ["a stat it doesn't know", { stats: [statNode([0, 0, 0], true, ["luck" as HexaStat, null, null]), LOCKED, LOCKED] }],
    ["a HEXA Stat line as a number", { stats: [{ lines: [0, 0, 0], unlocked: true }, LOCKED, LOCKED] }],
    ["an Epic Dungeon it doesn't know", { dungeon: "lachelein" }],
    ["fragments owned below 0", { owned: -1 }],
    ["something extra", { extra: 1 }],
    ["a HEXA Stat node without its unlocked tick", { stats: [{ lines: LOCKED.lines }, LOCKED, LOCKED] }],
  ])("refuses %s", async (_, change) => {
    const id = await character();
    expect((await api().put(`/api/hexa/${id}`).send({ ...HEXA_DEFAULTS, ...change })).status).toBe(400);
  });
});
