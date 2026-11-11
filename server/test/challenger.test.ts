import { CLASSES, STATS_DEFAULTS, type StatsInput } from "@miku/shared";
import { describe, expect, it, vi } from "vitest";
import { Prisma } from "../src/generated/prisma/client";
import { SOLE_OWNER } from "../src/owner";
import gear from "../src/gameFigures/gear-items.json";
import hexa from "../src/gameFigures/hexa-jobs.json";
import stats from "../src/gameFigures/stats-jobs.json";
import { totalExp } from "../src/calc/exp";
import { db } from "../src/db";
import { refreshAll } from "../src/services/refresh";
import { api, ok } from "./api";
import { answer, CHARACTERS, fakeNexon } from "./fixtures/nexon";
import { NOW, useDbTestSetup } from "./helpers";

// Challenger (v4.2.0): a world whose characters are added and kept up to date by hand, never looked up.
useDbTestSetup();

const CHALLENGER = 900;
function setup() {
  const nexon = fakeNexon((url) => answer(url, CHARACTERS));
  const call = () => api({ nexon: () => nexon.client });
  return { nexon, call };
}
type Call = ReturnType<typeof setup>["call"];
const addByHand = (call: Call, body: Record<string, unknown>) => call().post("/api/characters").send({ world: CHALLENGER, name: "Mikurin", job: "Ren", level: 200, ...body });
const edit = (call: Call, id: number, body: Record<string, unknown>) => call().patch(`/api/characters/${id}`).send(body);
// What a refused request says: its rule's message (input rules), or its error.
const problem = (res: { body: { error: string; issues?: { message: string }[] } }) => res.body.issues?.map((i) => i.message).join("; ") ?? res.body.error;
const days = async (id: number) => (await db().snapshot.findMany({ where: { characterId: id }, orderBy: { day: "asc" } })).map((s) => [s.day, s.level]);

describe("adding a Challenger character", () => {
  it("takes its name, class and level as typed, without asking Nexon, and selects it", async () => {
    const { nexon, call } = setup();
    const res = await addByHand(call, {});
    expect(res.status).toBe(201);
    const id = res.body.id;
    expect(res.body).toEqual({
      id,
      worldId: CHALLENGER,
      name: "Mikurin",
      job: "Ren",
      level: 200,
      exp: 0,
      expToNext: expect.any(Number),
      byHand: true,
      worldRank: null,
      overallRank: null,
      legion: null,
      avatar: null,
      addedAt: NOW.toISOString(),
      checkedAt: NOW.toISOString(),
      missingSince: null,
    });
    expect(nexon.requests).toEqual([]);
    expect((await ok(call().get(`/api/characters?world=${CHALLENGER}`))).body).toEqual({ characters: [res.body], selectedId: id });
    // Its level history starts with today's level (no EXP: a level's start).
    const [s] = await db().snapshot.findMany({ where: { characterId: id } });
    expect(s).toMatchObject({ day: "2026-10-20", level: 200, exp: 0n, gained: 0n, totalExp: BigInt(totalExp(200, 0)) });
  });

  it("goes at the end of its world's tabs (another world's don't count), takes any class, Lethe included, and is selected", async () => {
    const { call } = setup();
    await ok(call().post("/api/characters").send({ world: 45, name: "MikuBeam" }));
    await ok(addByHand(call, {}));
    const second = (await ok(addByHand(call, { name: "Leekspin", job: "Lethe", level: 260 }))).body;
    expect(second).toMatchObject({ name: "Leekspin", job: "Lethe", level: 260 });
    expect((await ok(call().get(`/api/characters?world=${CHALLENGER}`))).body.selectedId).toBe(second.id);
    const rows = await db().character.findMany({ where: { worldId: CHALLENGER }, orderBy: { sortOrder: "asc" } });
    expect(rows.map((c) => [c.name, c.sortOrder])).toEqual([["Mikurin", 0], ["Leekspin", 1]]);
  });

  it.each([
    [{ job: "Lethe Mage" }, "Pick a class from the list"],
    [{ job: "ren" }, "Pick a class from the list"],
    [{ level: 0 }, null],
    [{ level: 301 }, null],
    [{ level: 250.5 }, null],
    [{ name: "Miku Rin" }, "Names are 1–12 letters and numbers"],
    [{ job: undefined }, null],
    [{ level: undefined }, null],
  ])("refuses %j", async (over, message) => {
    const { call } = setup();
    const res = await addByHand(call, over);
    expect(res.status).toBe(400);
    if (message) expect(problem(res)).toContain(message);
    expect(await db().character.count()).toBe(0);
  });

  it.each([
    [CHALLENGER, { job: "Ren" }, "Challenger characters aren't in Nexon's rankings: add them with their class and level"],
    [CHALLENGER, { level: 200 }, "Challenger characters aren't in Nexon's rankings: add them with their class and level"],
    [45, { job: "Kanna" }, "Only Challenger characters are added by hand"],
    [45, { level: 285 }, "Only Challenger characters are added by hand"],
  ])("on world %i, %j alone is refused", async (world, extra, message) => {
    const { nexon, call } = setup();
    const res = await call().post("/api/characters").send({ world, name: "MikuBeam", ...extra });
    expect([res.status, problem(res)]).toEqual([400, message]);
    expect(nexon.requests).toEqual([]);
  });

  it("refuses a Challenger character by name only (Nexon doesn't list them), and a Kronos one by hand", async () => {
    const { nexon, call } = setup();
    const byName = await call().post("/api/characters").send({ world: CHALLENGER, name: "MikuBeam" });
    expect(byName.status).toBe(400);
    expect(problem(byName)).toBe("Challenger characters aren't in Nexon's rankings: add them with their class and level");
    const kronos = await call().post("/api/characters").send({ world: 45, name: "MikuBeam", job: "Kanna", level: 285 });
    expect([kronos.status, problem(kronos)]).toEqual([400, "Only Challenger characters are added by hand"]);
    expect(nexon.requests).toEqual([]);
    expect(await db().character.count()).toBe(0);
  });

  it("refuses a name already on Challenger (capitals ignored), but not one on Kronos", async () => {
    const { call } = setup();
    await ok(call().post("/api/characters").send({ world: 45, name: "MikuBeam" }));
    await ok(addByHand(call, { name: "MikuBeam" }));
    const again = await addByHand(call, { name: "mikubeam", job: "Hero" });
    expect([again.status, again.body.error]).toEqual([409, "MikuBeam is already added on Challenger."]);
  });

  it("searching Nexon on Challenger is refused (never sent)", async () => {
    const { nexon, call } = setup();
    const res = await call().get(`/api/search?world=${CHALLENGER}&name=MikuBeam`);
    expect(res.status).toBe(400);
    expect(nexon.requests).toEqual([]);
  });
});

describe("changing a Challenger character", () => {
  it("sets today's level (a second change that day replaces it) and adds a day for the next", async () => {
    const { call } = setup();
    const id = (await ok(addByHand(call, {}))).body.id;
    expect((await ok(edit(call, id, { level: 214 }))).body).toMatchObject({ level: 214, name: "Mikurin" });
    expect(await days(id)).toEqual([["2026-10-20", 214]]);
    // the level it already has, on another day: no change, no day marked as typed
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 20, 23)));
    await ok(edit(call, id, { level: 214 }));
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 22)));
    await ok(edit(call, id, { level: 214 }));
    expect(await days(id)).toEqual([["2026-10-20", 214]]);
    expect((await db().character.findUnique({ where: { id } }))!.checkedAt).toEqual(NOW);
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 21, 0, 0, 1)));
    await ok(edit(call, id, { level: 220 }));
    await ok(edit(call, id, { level: 219 })); // a typo fixed: lower is allowed (the page asks first)
    expect(await days(id)).toEqual([["2026-10-20", 214], ["2026-10-21", 219]]);
    expect(await db().character.findUnique({ where: { id } })).toMatchObject({ level: 219, checkedAt: new Date(Date.UTC(2026, 9, 21, 0, 0, 1)) });
  });

  it("renames it (keeping its level and history: no day added), case changes included; the answer is that character", async () => {
    const { call } = setup();
    await ok(addByHand(call, { name: "First" }));
    const id = (await ok(addByHand(call, {}))).body.id;
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 22, 12)));
    expect((await ok(edit(call, id, { name: "MIKURIN" }))).body).toMatchObject({ id, name: "MIKURIN", level: 200 });
    expect(await days(id)).toEqual([["2026-10-20", 200]]); // a rename alone types no level
    expect((await db().character.findUnique({ where: { id } }))!.checkedAt).toEqual(NOW); // nor changes when it last was
    expect((await ok(edit(call, id, { name: "Hatsune", level: 205 }))).body).toMatchObject({ id, name: "Hatsune", level: 205 });
    expect(await db().character.findUnique({ where: { id } })).toMatchObject({ name: "Hatsune", nameKey: "hatsune" });
    expect(await days(id)).toEqual([["2026-10-20", 200], ["2026-10-22", 205]]);
  });

  it("adding or renaming at the same moment as another request takes the name: refused as a duplicate (the database's check)", async () => {
    const { call } = setup();
    const taken = () => new Prisma.PrismaClientKnownRequestError("Unique constraint", { code: "P2002", clientVersion: "test" });
    vi.spyOn(db(), "$transaction").mockRejectedValueOnce(taken());
    const added = await addByHand(call, {});
    expect([added.status, added.body.error]).toEqual([409, "Mikurin is already added on Challenger."]);
    const other = (await ok(addByHand(call, { name: "Other" }))).body.id;
    vi.spyOn(db(), "$transaction").mockRejectedValueOnce(taken());
    const renamed = await edit(call, other, { name: "Mikurin" });
    expect([renamed.status, renamed.body.error]).toEqual([409, "Mikurin is already added on Challenger."]);
  });

  it("an error that isn't the duplicate one while saving is passed on as it is", async () => {
    const { addByHand: byHand, editCharacter } = await import("../src/services/characters");
    const thrown = new RangeError("Something else broke");
    vi.spyOn(db(), "$transaction").mockRejectedValueOnce(thrown);
    await expect(byHand(SOLE_OWNER, CHALLENGER, "Mikurin", "Ren", 200)).rejects.toBe(thrown);
    const c = await byHand(SOLE_OWNER, CHALLENGER, "Mikurin", "Ren", 200);
    vi.spyOn(db(), "$transaction").mockRejectedValueOnce(thrown);
    await expect(editCharacter(SOLE_OWNER, c.id, { level: 201 })).rejects.toBe(thrown);
  });

  it("refuses a name another Challenger character has, nothing to change, and bad levels", async () => {
    const { call } = setup();
    const id = (await ok(addByHand(call, {}))).body.id;
    await ok(addByHand(call, { name: "Leekspin" }));
    const taken = await edit(call, id, { name: "leekspin" });
    expect([taken.status, taken.body.error]).toEqual([409, "Leekspin is already added on Challenger."]);
    for (const body of [{}, { level: 0 }, { level: 301 }, { name: "" }, { job: "Hero" }]) expect((await edit(call, id, body)).status).toBe(400);
    expect(await db().character.findUnique({ where: { id } })).toMatchObject({ name: "Mikurin", level: 200 });
  });

  it("refuses a character from Nexon's rankings (it changes with the refresh), and another owner's", async () => {
    const { call } = setup();
    const kronos = (await ok(call().post("/api/characters").send({ world: 45, name: "MikuBeam" }))).body;
    const res = await edit(call, kronos.id, { level: 290 });
    expect([res.status, res.body.error]).toEqual([400, "MikuBeam is from Nexon's rankings: it changes with the refresh, not by hand."]);
    const theirs = await db().character.create({ data: { ownerId: "someone-else", worldId: CHALLENGER, name: "Theirs", nameKey: "theirs", job: "Ren", level: 200, exp: 0n, worldRank: 0, sortOrder: 0, checkedAt: NOW } });
    expect((await edit(call, theirs.id, { level: 201 })).status).toBe(404);
    expect((await db().character.findUnique({ where: { id: kronos.id } }))!.level).toBe(285);
  });
});

describe("the refresh", () => {
  it("never looks a Challenger character up (nor marks it missing), and still refreshes the others", async () => {
    const { nexon, call } = setup();
    await ok(call().post("/api/characters").send({ world: 45, name: "MikuBeam" }));
    const id = (await ok(addByHand(call, {}))).body.id;
    const before = nexon.requests.length;
    const run = await refreshAll(nexon.client);
    expect(run).toMatchObject({ checked: 1, updated: 1, missing: 0, failed: 0 });
    expect(nexon.requests.slice(before).some((r) => r.url.includes("Mikurin"))).toBe(false);
    expect(await db().character.findUnique({ where: { id } })).toMatchObject({ missingSince: null, level: 200, checkedAt: NOW });
  });
});

describe("Home's level graph", () => {
  it("is the levels typed, each day carrying the last one, from the day it was added; no EXP", async () => {
    const { call } = setup();
    const id = (await ok(addByHand(call, {}))).body.id;
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 22, 12)));
    await ok(edit(call, id, { level: 210 }));
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 23, 12)));
    const p = (await ok(call().get(`/api/characters/${id}/progress`))).body;
    expect(p.typed).toEqual([
      { day: "2026-10-20", level: 200, typed: true },
      { day: "2026-10-21", level: 200, typed: false },
      { day: "2026-10-22", level: 210, typed: true },
      { day: "2026-10-23", level: 210, typed: false },
    ]);
    expect(p.levels).toEqual([]);
    expect(p.bars.every((b: { gained: number | null }) => !b.gained)).toBe(true);
  });

  it("is null for a character from Nexon's rankings", async () => {
    const { call } = setup();
    const id = (await ok(call().post("/api/characters").send({ world: 45, name: "MikuBeam" }))).body.id;
    expect((await ok(call().get(`/api/characters/${id}/progress`))).body.typed).toBeNull();
  });
});

describe("the classes a character added by hand can be", () => {
  it("are every class the gear figures know, A–Z: the Stats and HEXA figures' and Lethe (v.272, not in their source yet)", () => {
    const known = Object.keys(stats.jobs).sort();
    expect(Object.keys(hexa.jobs).sort()).toEqual(known);
    expect([...CLASSES]).toEqual(Object.keys(gear.jobs).sort());
    expect([...CLASSES]).toEqual([...known, "Lethe"].sort());
  });
});

describe("a Challenger character elsewhere in the app", () => {
  it("is Heroic on the Stats page, like Kronos; its boss clears add Mayrin (Challenger's own), Kronos's don't", async () => {
    const { call } = setup();
    const id = (await ok(addByHand(call, { job: "Mercedes", level: 286 }))).body.id;
    // (a sheet with damage: the owner's screenshot of MapleScouter's Mercedes, as the Stats tests use)
    const sheet: StatsInput = {
      ...structuredClone(STATS_DEFAULTS),
      stats: { ...STATS_DEFAULTS.stats, main: { base: 7812, per: 784, abs: 28770 }, sub: { base: 4388, per: 205, abs: 710 }, atk: { base: 4293, per: 129, abs: 0 }, dmg: 120, boss: 544, ied: 97.2644, critRate: 213, critDmg: 132.9, cdSec: 5, cdPct: 6, cdSkip: 7.5, buffDuration: 65, statusDmg: 14, elemResist: 5, summon: 10, arcane: 1380, sacred: 660 },
    };
    await ok(call().put(`/api/stats/${id}`).send(sheet));
    const b = (await ok(call().get(`/api/stats/${id}`))).body;
    expect(b).toMatchObject({ known: true, level: 286, heroic: true });
    const keys = (rows: { key: string }[]) => rows.map((r) => r.key);
    expect(keys(b.bosses).filter((k) => k.endsWith("_maerin"))).toEqual(["hard_maerin", "normal_maerin"]);
    const kronos = await db().character.create({ data: { ownerId: (await db().character.findUniqueOrThrow({ where: { id } })).ownerId, worldId: 45, name: "Kro", nameKey: "kro", job: "Mercedes", level: 286, exp: 0n, worldRank: 1, sortOrder: 0, checkedAt: NOW } });
    await ok(call().put(`/api/stats/${kronos.id}`).send(sheet));
    const k = (await ok(call().get(`/api/stats/${kronos.id}`))).body;
    expect(k.bosses.length).toBe(b.bosses.length - 2);
    expect(keys(k.bosses).some((x) => x.endsWith("_maerin"))).toBe(false);
  });
});
