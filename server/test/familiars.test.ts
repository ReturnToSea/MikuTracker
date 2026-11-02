import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FAMILIAR_DEFAULTS, type FamiliarInput } from "@miku/shared";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../src/db";
import { BADGES, familiarLines } from "../src/gameFigures/familiars";
import { SOLE_OWNER } from "../src/owner";
import { api, ok } from "./api";
import { NOW, useDbTestSetup } from "./helpers";

useDbTestSetup();

let made = 0;
async function character(ownerId = SOLE_OWNER, worldId = 45) {
  const name = `Fam${++made}`;
  const c = await db().character.create({ data: { ownerId, worldId, name, nameKey: name.toLowerCase(), job: "Ren", level: 275, exp: 0n, worldRank: 1, sortOrder: made, addedAt: NOW, checkedAt: NOW } });
  return c.id;
}
const get = async (path: string) => (await ok(api().get(path))).body;
const save = (id: number, input: FamiliarInput) => ok(api().put(`/api/familiars/${id}`).send(input));
const fam = (rank: FamiliarInput["familiars"][number]["rank"], a: FamiliarInput["familiars"][number]["lines"][0], b: FamiliarInput["familiars"][number]["lines"][1] = null) => ({ rank, lines: [a, b] as FamiliarInput["familiars"][number]["lines"] });
const NONE = fam("common", null);
// The owner's example: Boss 50 / ATT 6, Boss 40 / IED 30, Boss 40 / Crit Rate 4.
const EXAMPLE: FamiliarInput = {
  familiars: [fam("legendary", { stat: "bossDmg", value: 50 }, { stat: "attPct", value: 6 }), fam("unique", { stat: "bossDmg", value: 40 }, { stat: "ied", value: 30 }), fam("unique", { stat: "bossDmg", value: 40 }, { stat: "critRate", value: 4 })],
  badges: ["crucible", "labyrinth"],
};
// (this run's own item-icons folder, from the test setup)
const iconDir = path.join(process.env.MIKU_DATA_DIR!, "item-icons");
afterEach(() => rmSync(iconDir, { recursive: true, force: true }));

const FAMILIAR_LINES = familiarLines();

describe("the familiar figures", () => {
  it("built on first use, afresh each time (nothing runs when the file loads)", () => {
    expect(familiarLines()).not.toBe(familiarLines());
    expect(familiarLines()).toEqual(FAMILIAR_LINES);
  });
  it("each rank's damage lines, as the wiki's tables list them (counted by hand)", () => {
    // Common: 4 flat stats, ATT, Magic ATT, All Stats, 4 stat %, ATT %, Magic ATT %, Crit Rate, Damage,
    // IED (16); Rare: the same and All Stats % (17); Epic: the same and Boss 20 / 30 (19); Unique: 4 stat %,
    // ATT %, Magic ATT %, Crit Rate, Crit DMG, Damage, All Stats %, IED 35 / 40, Boss 40 (13); Legendary:
    // the same with IED 45 / 50 and Boss 45 / 50 (14)
    expect(FAMILIAR_LINES.common).toHaveLength(16);
    expect(FAMILIAR_LINES.rare).toHaveLength(17);
    expect(FAMILIAR_LINES.epic).toHaveLength(19);
    expect(FAMILIAR_LINES.unique).toHaveLength(13);
    expect(FAMILIAR_LINES.legendary).toHaveLength(14);
    const values = (rank: keyof typeof FAMILIAR_LINES, stat: string) => FAMILIAR_LINES[rank].filter((l) => l.stat === stat).map((l) => l.value);
    // Boss DMG: Epic 20/30, Unique 40 only (since v.264), Legendary 45/50
    expect([values("common", "bossDmg"), values("rare", "bossDmg"), values("epic", "bossDmg"), values("unique", "bossDmg"), values("legendary", "bossDmg")]).toEqual([[], [], [20, 30], [40], [45, 50]]);
    expect(["common", "rare", "epic", "unique", "legendary"].map((r) => values(r as keyof typeof FAMILIAR_LINES, "ied"))).toEqual([[15], [15], [30], [35, 40], [45, 50]]);
    expect(["common", "rare", "epic", "unique", "legendary"].map((r) => values(r as keyof typeof FAMILIAR_LINES, "critRate"))).toEqual([[1], [2], [4], [8], [9]]);
    expect(["common", "rare", "epic", "unique", "legendary"].map((r) => values(r as keyof typeof FAMILIAR_LINES, "attPct"))).toEqual([[1], [2], [3], [6], [9]]);
    expect(["common", "rare", "epic", "unique", "legendary"].map((r) => values(r as keyof typeof FAMILIAR_LINES, "critDmg"))).toEqual([[], [], [], [3], [6]]);
    expect(["common", "rare", "epic", "unique", "legendary"].map((r) => values(r as keyof typeof FAMILIAR_LINES, "allStatPct"))).toEqual([[], [1], [2], [3], [6]]);
    expect(["common", "rare", "epic", "unique", "legendary"].map((r) => values(r as keyof typeof FAMILIAR_LINES, "str"))).toEqual([[6], [12], [24], [], []]);
    expect(["common", "rare", "epic", "unique", "legendary"].map((r) => values(r as keyof typeof FAMILIAR_LINES, "allStat"))).toEqual([[1], [3], [5], [], []]);
  });
  it("the wiki's 48 badges, their stats read from their effects (a few checked by hand)", () => {
    expect(BADGES).toHaveLength(48);
    const badge = (id: string) => BADGES.find((b) => b.id === id)!;
    expect(badge("crucible")).toEqual({ id: "crucible", name: "Crucible Badge", effects: ["Critical Damage: +1%", "Ignored Enemy Defense: +3%"], stats: { critDmg: 1, ied: 3 } });
    expect(badge("void").stats).toEqual({ mattPct: 1, matt: 2 });
    expect(badge("apocalypse").stats).toEqual({ attPct: 1, att: 2 });
    expect(badge("tyrant").stats).toEqual({ allStatPct: 1 });
    expect(badge("cloud").stats).toEqual({ allStat: 1, ied: 3 });
    expect(badge("mariner").stats).toEqual({ luk: 2 });
    // effects that aren't damage stats: shown, not counted
    expect(badge("hatching")).toMatchObject({ effects: ["All Skill Levels: +1 (except 5th Job Skills)"], stats: {} });
    expect(badge("starter").stats).toEqual({});
  });
});

describe("GET /api/familiars?world=", () => {
  it("isn't an address: the page's tabs are the character list's", async () => {
    expect((await api().get("/api/familiars?world=45")).status).toBe(404);
  });
});

describe("GET /api/familiars/:id", () => {
  it("a new character: the defaults, no totals, each rank's line choices and every badge", async () => {
    const id = await character();
    const b = await get(`/api/familiars/${id}`);
    expect(b.input).toEqual(FAMILIAR_DEFAULTS);
    expect(b.totals).toEqual([]);
    expect(b.bossCap).toBe(120);
    expect(b.choices.unique).toEqual({ first: FAMILIAR_LINES.unique, usual: FAMILIAR_LINES.epic, rare: FAMILIAR_LINES.unique });
    expect(b.choices.common.usual).toBeNull();
    expect(b.badges).toHaveLength(48);
    expect(b.badges.find((x: { id: string }) => x.id === "rebel")).toEqual({ id: "rebel", name: "Rebel Badge", effects: ["Critical Rate: +1%"], damage: true, icon: null });
    expect(b.badges.find((x: { id: string }) => x.id === "starter").damage).toBe(false);
    expect(b.source).toMatch(/wiki/i);
  });

  it("the totals of what's saved: Boss over the cap, IED combined, badges added", async () => {
    const id = await character();
    await save(id, EXAMPLE);
    const { totals } = await get(`/api/familiars/${id}`);
    // Crucible: Crit DMG 1, IED 3; Labyrinth: All Stats 1%, Damage 1%. IED: 1 − 0.7 × 0.97 = 32.1%
    expect(totals.map((t: { stat: string }) => t.stat)).toEqual(["bossDmg", "attPct", "ied", "critDmg", "dmg", "critRate", "allStatPct"]);
    expect(totals[0]).toEqual({ stat: "bossDmg", familiars: 130, badges: 0, total: 120, over: 130 });
    expect(totals[2].total).toBeCloseTo(32.1, 10);
    expect(totals[3]).toEqual({ stat: "critDmg", familiars: 0, badges: 1, total: 1, over: null });
    expect(totals[5]).toEqual({ stat: "critRate", familiars: 4, badges: 0, total: 4, over: null });
  });

  it("lines that aren't damage stats, and lines not entered, add nothing", async () => {
    const id = await character();
    await save(id, { familiars: [fam("rare", { stat: "other", value: 0 }, { stat: "dmg", value: 1 }), NONE, NONE], badges: [] });
    expect((await get(`/api/familiars/${id}`)).totals).toEqual([{ stat: "dmg", familiars: 1, badges: 0, total: 1, over: null }]);
  });

  it("a badge's picture, once downloaded", async () => {
    const id = await character();
    mkdirSync(path.join(iconDir, "familiars"), { recursive: true });
    writeFileSync(path.join(iconDir, "familiars", "rebel.png"), "png");
    const { badges } = await get(`/api/familiars/${id}`);
    expect(badges.find((x: { id: string }) => x.id === "rebel").icon).toBe("/item-icons/familiars/rebel.png");
    expect(badges.find((x: { id: string }) => x.id === "ocean").icon).toBeNull();
  });

  it("someone else's character: not found", async () => {
    const theirs = await character("someone-else");
    expect((await api().get(`/api/familiars/${theirs}`)).status).toBe(404);
    expect((await api().put(`/api/familiars/${theirs}`).send(FAMILIAR_DEFAULTS)).status).toBe(404);
    expect(await db().familiarPlan.count()).toBe(0);
  });

  it("a saved row that no longer passes the rules, or isn't JSON, reads as the defaults", async () => {
    const id = await character();
    await db().familiarPlan.create({ data: { characterId: id, data: JSON.stringify({ familiars: [] }) } });
    expect((await get(`/api/familiars/${id}`)).input).toEqual(FAMILIAR_DEFAULTS);
    await db().familiarPlan.update({ where: { characterId: id }, data: { data: '{"familiars":' } });
    expect((await get(`/api/familiars/${id}`)).input).toEqual(FAMILIAR_DEFAULTS);
  });

  it("after a patch, a saved line or badge the figures no longer have is dropped on its own: the rest kept", async () => {
    const id = await character();
    // (as if saved before a patch: a Unique Boss 35% line, gone since v.264, and a badge the wiki renamed)
    const old = { familiars: [fam("unique", { stat: "bossDmg", value: 35 }, { stat: "ied", value: 30 }), EXAMPLE.familiars[1], EXAMPLE.familiars[2]], badges: ["crucible", "renamed", "labyrinth"] };
    await db().familiarPlan.create({ data: { characterId: id, data: JSON.stringify(old) } });
    const b = await get(`/api/familiars/${id}`);
    expect(b.input).toEqual({ familiars: [fam("unique", null, { stat: "ied", value: 30 }), EXAMPLE.familiars[1], EXAMPLE.familiars[2]], badges: ["crucible", "labyrinth"] });
    // and the totals of what's kept
    expect(b.totals[0]).toEqual({ stat: "bossDmg", familiars: 80, badges: 0, total: 80, over: null });
  });
});

describe("PUT /api/familiars/:id", () => {
  it("saves what's typed; saving again replaces it; deleting the character deletes it", async () => {
    const id = await character();
    await save(id, EXAMPLE);
    const again = { ...EXAMPLE, badges: ["ocean"] };
    await save(id, again);
    expect((await get(`/api/familiars/${id}`)).input).toEqual(again);
    await ok(api().delete(`/api/characters/${id}`));
    expect(await db().familiarPlan.count()).toBe(0);
  });

  it("takes a 2nd line from the rank below or the familiar's own rank", async () => {
    const id = await character();
    const input: FamiliarInput = { familiars: [fam("legendary", { stat: "bossDmg", value: 45 }, { stat: "bossDmg", value: 40 }), fam("legendary", { stat: "ied", value: 50 }, { stat: "ied", value: 50 }), fam("common", { stat: "dmg", value: 1 }, { stat: "dmg", value: 1 })], badges: [] };
    await save(id, input);
    expect((await get(`/api/familiars/${id}`)).input).toEqual(input);
  });

  it("refuses a line the familiar's rank can't have, saying which", async () => {
    const id = await character();
    const wrong = async (familiars: FamiliarInput["familiars"]) => api().put(`/api/familiars/${id}`).send({ familiars, badges: [] });
    // a Unique 1st line of Boss 30% (Epic's), a 2nd line of Legendary's on a Unique familiar, Boss 35% on a Unique
    let res = await wrong([fam("unique", { stat: "bossDmg", value: 30 }), NONE, NONE]);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Familiar 1's line 1 isn't one unique familiars can have");
    res = await wrong([NONE, fam("unique", null, { stat: "bossDmg", value: 50 }), NONE]);
    expect(res.body.error).toBe("Familiar 2's line 2 isn't one unique familiars can have");
    res = await wrong([NONE, NONE, fam("unique", { stat: "bossDmg", value: 35 })]);
    expect(res.body.error).toBe("Familiar 3's line 1 isn't one unique familiars can have");
    // two ranks below
    expect((await wrong([fam("legendary", null, { stat: "bossDmg", value: 30 }), NONE, NONE])).status).toBe(400);
    expect(await db().familiarPlan.count()).toBe(0);
  });

  it("refuses badges that aren't listed, the same badge twice, more than 8, or a malformed input", async () => {
    const id = await character();
    const put = (body: object) => api().put(`/api/familiars/${id}`).send(body);
    let res = await put({ ...FAMILIAR_DEFAULTS, badges: ["rebel", "nope"] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('There\'s no badge "nope"');
    expect((await put({ ...FAMILIAR_DEFAULTS, badges: ["rebel", "rebel"] })).status).toBe(400);
    const nine = BADGES.slice(0, 9).map((b) => b.id);
    expect((await put({ ...FAMILIAR_DEFAULTS, badges: nine })).status).toBe(400);
    await save(id, { ...FAMILIAR_DEFAULTS, badges: nine.slice(0, 8) });
    expect((await put({ ...FAMILIAR_DEFAULTS, familiars: [NONE, NONE] })).status).toBe(400);
    expect((await put({ ...FAMILIAR_DEFAULTS, extra: 1 })).status).toBe(400);
    expect((await put({ familiars: [fam("mythic" as "common", null), NONE, NONE], badges: [] })).status).toBe(400);
    expect((await put({ familiars: [fam("rare", { stat: "dmg", value: 2.5 }), NONE, NONE], badges: [] })).status).toBe(400);
    // still the 8 saved before
    expect((await get(`/api/familiars/${id}`)).input.badges).toEqual(nine.slice(0, 8));
  });
});
