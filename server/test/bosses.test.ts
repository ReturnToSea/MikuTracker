import { mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getConfig } from "../src/config";
import { db } from "../src/db";
import { SOLE_OWNER } from "../src/owner";
import { api, ok } from "./api";
import { NOW, useDbTestSetup } from "./helpers";

useDbTestSetup();

// NOW is Tue 20 Oct 2026, 19:00 UTC: the boss week started Thu 15 Oct and resets Thu 22 Oct.
// Meso below are worked out by hand from the wiki's base prices: ×5 (Heroic), ÷ party, rounded down.
const M = 1_000_000;

// This test run's own boss-art folder, from the test setup (not from the code under test).
const artDir = path.join(process.env.MIKU_DATA_DIR!, "boss-art");
afterEach(() => rmSync(artDir, { recursive: true, force: true }));

let made = 0;
async function character(name = `Char${++made}`, { worldId = 45, ownerId = SOLE_OWNER, sortOrder = made } = {}) {
  const c = await db().character.create({
    data: { ownerId, worldId, name, nameKey: name.toLowerCase(), job: "Kanna", level: 270, exp: 0n, worldRank: 1, sortOrder, addedAt: NOW, checkedAt: NOW },
  });
  return c.id;
}

type Plan = { boss: string; difficulty: string; partySize: number }[];
const plan = (id: number, p: Plan) => api().put(`/api/bosses/${id}/plan`).send({ plan: p });
const tick = (id: number, boss: string, cleared = true) => api().put(`/api/bosses/${id}/clears/${boss}`).send({ cleared });
const board = async (world = 45) => (await ok(api().get(`/api/bosses?world=${world}`))).body;
const solo = (boss: string, difficulty: string) => ({ boss, difficulty, partySize: 1 });
const at = (iso: string) => vi.setSystemTime(new Date(iso));

describe("GET /api/bosses", () => {
  it("with no characters: this week and month, the limits, and every boss with its meso per party size", async () => {
    const b = await board();
    expect(b.week).toEqual({ start: "2026-10-15", resetsAt: "2026-10-22T00:00:00.000Z" });
    expect(b.month).toEqual({ name: "2026-10", resetsAt: "2026-11-01T00:00:00.000Z" });
    expect(b.limits).toEqual({ perCharacter: 14, perWorld: 180 });
    expect(b.pricesPatch).toBe("v.270");
    expect(b.characters).toEqual([]);
    expect(b.totals).toEqual({ planned: 0, soFar: 0, cleared: 0, bosses: 0, crystals: 0, monthlyPlanned: 0, monthlySoFar: 0 });
    expect(b.bosses).toHaveLength(29);
    expect(b.bosses[0]).toEqual({ id: "zakum", name: "Zakum", kind: "weekly", art: null, difficulties: [{ difficulty: "Chaos", maxParty: 6, perPerson: [81 * M, 40.5 * M, 27 * M, 20.25 * M, 16.2 * M, 13.5 * M] }] });
    // Extreme Lotus: 279.5M × 5 = 1,397.5M, for 1 or 2 people only
    expect(b.bosses.find((x: { id: string }) => x.id === "lotus").difficulties[2]).toEqual({ difficulty: "Extreme", maxParty: 2, perPerson: [1_397.5 * M, 698.75 * M] });
    // Normal Guardian Angel Slime: 231,673,500 ÷ 6 = 38,612,250
    expect(b.bosses.find((x: { id: string }) => x.id === "guardian_angel_slime").difficulties[0].perPerson[5]).toBe(38_612_250);
    expect(b.bosses.at(-1)).toMatchObject({ id: "black_mage", kind: "monthly" });
  });

  it("a boss's picture, when the data folder has it, with its change time in the address; and the file is served", async () => {
    expect(getConfig().bossArtDir).toBe(artDir);
    mkdirSync(artDir, { recursive: true });
    writeFileSync(path.join(artDir, "lucid.png"), "PNG bytes");
    const when = new Date(Date.UTC(2026, 9, 1));
    utimesSync(path.join(artDir, "lucid.png"), when, when);
    const bosses = (await board()).bosses;
    expect(bosses.find((x: { id: string }) => x.id === "lucid").art).toBe(`/boss-art/lucid.png?v=${when.getTime()}`);
    expect(bosses.filter((x: { art: string | null }) => x.art !== null)).toHaveLength(1);
    const file = await api().get("/boss-art/lucid.png");
    expect([file.status, file.headers["content-type"], file.body.toString()]).toEqual([200, "image/png", "PNG bytes"]);
  });

  it("the world's characters in tab order, each with its plan in game order and its meso", async () => {
    const second = await character("Second", { sortOrder: 1 });
    const first = await character("First", { sortOrder: 0 });
    await character("Elsewhere", { worldId: 70 });
    await character("NotMine", { ownerId: "someone-else" });
    // sent in any order; shown in game order
    await ok(plan(first, [{ boss: "will", difficulty: "Hard", partySize: 2 }, solo("zakum", "Chaos"), { boss: "black_mage", difficulty: "Hard", partySize: 6 }]));
    const b = await board();
    expect(b.characters.map((c: { name: string }) => c.name)).toEqual(["First", "Second"]);
    const [one, two] = b.characters;
    expect(one).toMatchObject({ id: first, job: "Kanna", level: 270, avatar: null });
    expect(one.weekly).toEqual([
      { boss: "zakum", difficulty: "Chaos", partySize: 1, meso: 81 * M, cleared: false, over: null },
      { boss: "will", difficulty: "Hard", partySize: 2, meso: 310_905_000, cleared: false, over: null }, // 124,362,000 × 5 ÷ 2
    ]);
    expect(one.monthly).toEqual([{ boss: "black_mage", difficulty: "Hard", partySize: 6, meso: 750 * M, cleared: false, over: null }]);
    expect([one.planned, one.soFar, one.cleared]).toEqual([391_905_000, 0, 0]);
    expect(two).toMatchObject({ id: second, weekly: [], monthly: [], planned: 0 });
    expect(b.totals).toEqual({ planned: 391_905_000, soFar: 0, cleared: 0, bosses: 2, crystals: 2, monthlyPlanned: 750 * M, monthlySoFar: 0 });
  });

  it("a plan a game patch made outdated still loads: a removed boss or difficulty is left out, a party too big counts as the largest allowed", async () => {
    const id = await character();
    await db().bossPlan.createMany({
      data: [
        { characterId: id, boss: "zakum", difficulty: "Chaos", partySize: 1 },
        { characterId: id, boss: "lotus", difficulty: "Chaos", partySize: 1 }, // Lotus has no Chaos
        { characterId: id, boss: "retired_boss", difficulty: "Hard", partySize: 1 },
        { characterId: id, boss: "limbo", difficulty: "Hard", partySize: 6 }, // Limbo allows 3
      ],
    });
    const c = (await board()).characters[0];
    expect(c.weekly.map((r: { boss: string; partySize: number; meso: number }) => [r.boss, r.partySize, r.meso])).toEqual([
      ["zakum", 1, 81 * M],
      ["limbo", 3, 1_248_333_333], // 749M × 5 ÷ 3, rounded down
    ]);
  });

  it("refuses an unknown world", async () => {
    expect((await api().get("/api/bosses?world=1")).status).toBe(400);
  });
});

describe("ticking", () => {
  it("a planned boss counts toward meso so far; unticking takes it back", async () => {
    const id = await character();
    await ok(plan(id, [solo("zakum", "Chaos"), solo("lucid", "Hard")]));
    expect((await tick(id, "lucid")).status).toBe(204);
    let b = await board();
    expect(b.characters[0].weekly.map((r: { cleared: boolean }) => r.cleared)).toEqual([false, true]);
    expect([b.characters[0].soFar, b.characters[0].cleared, b.totals.soFar, b.totals.cleared]).toEqual([504 * M, 1, 504 * M, 1]);
    await ok(tick(id, "lucid")); // ticking twice changes nothing
    expect((await board()).totals.soFar).toBe(504 * M);
    await ok(tick(id, "zakum"));
    await ok(tick(id, "lucid", false));
    b = await board();
    // only Lucid's tick goes
    expect(b.characters[0].weekly.map((r: { cleared: boolean }) => r.cleared)).toEqual([true, false]);
    expect([b.characters[0].soFar, b.characters[0].cleared]).toEqual([81 * M, 1]);
    await ok(tick(id, "lucid", false)); // unticking an unticked boss is fine too
  });

  it("only planned bosses can be ticked", async () => {
    const id = await character("Remy");
    const res = await tick(id, "lucid");
    expect([res.status, res.body.error]).toEqual([409, "Lucid isn't in Remy's plan. Add it to the plan first."]);
    const unknown = await tick(id, "nobody");
    expect([unknown.status, unknown.body.error]).toEqual([404, "Not found"]);
    expect(await db().bossClear.count()).toBe(0);
  });

  it("another owner's character, or one that doesn't exist, is not found", async () => {
    const theirs = await character("Theirs", { ownerId: "someone-else" });
    await db().bossPlan.create({ data: { characterId: theirs, boss: "zakum", difficulty: "Chaos", partySize: 1 } });
    const res = await tick(theirs, "zakum");
    expect([res.status, res.body.error]).toEqual([404, "Not found"]);
    expect((await tick(99_999, "zakum")).status).toBe(404);
    expect((await plan(theirs, [])).status).toBe(404);
    expect(await db().bossPlan.count()).toBe(1);
  });

  it("refuses a body that isn't { cleared: true | false }", async () => {
    const id = await character();
    await ok(plan(id, [solo("zakum", "Chaos")]));
    for (const body of [{}, { cleared: "yes" }, { cleared: true, extra: 1 }]) expect((await api().put(`/api/bosses/${id}/clears/zakum`).send(body)).status).toBe(400);
    expect((await api().put("/api/bosses/abc/clears/zakum").send({ cleared: true })).status).toBe(400);
  });

  it("weekly ticks reset at Thursday 00:00 UTC; the old week's tick is kept", async () => {
    const id = await character();
    await ok(plan(id, [solo("zakum", "Chaos")]));
    await ok(tick(id, "zakum"));
    at("2026-10-21T23:59:59.999Z");
    expect((await board()).characters[0].weekly[0].cleared).toBe(true);
    at("2026-10-22T00:00:00.000Z");
    const b = await board();
    expect(b.week).toEqual({ start: "2026-10-22", resetsAt: "2026-10-29T00:00:00.000Z" });
    expect([b.characters[0].weekly[0].cleared, b.totals.soFar]).toEqual([false, 0]);
    // the plan carries over to the new week
    expect(b.characters[0].planned).toBe(81 * M);
    expect(await db().bossClear.findMany({ select: { boss: true, period: true, difficulty: true, partySize: true } })).toEqual([{ boss: "zakum", period: "2026-10-15", difficulty: "Chaos", partySize: 1 }]);
  });

  it("Black Mage is ticked for the month: it stays ticked over the weekly reset, resets on the 1st, and isn't in the weekly totals", async () => {
    const id = await character();
    await ok(plan(id, [{ boss: "black_mage", difficulty: "Extreme", partySize: 6 }]));
    await ok(tick(id, "black_mage"));
    let b = await board();
    expect(b.characters[0].monthly[0]).toMatchObject({ cleared: true, meso: 3_000 * M }); // 3.6B × 5 ÷ 6
    expect(b.totals).toMatchObject({ planned: 0, soFar: 0, cleared: 0, bosses: 0, crystals: 0, monthlyPlanned: 3_000 * M, monthlySoFar: 3_000 * M });
    at("2026-10-29T12:00:00Z"); // two weekly resets later, same month
    expect((await board()).characters[0].monthly[0].cleared).toBe(true);
    at("2026-11-01T00:00:00Z");
    b = await board();
    expect(b.month).toEqual({ name: "2026-11", resetsAt: "2026-12-01T00:00:00.000Z" });
    expect([b.characters[0].monthly[0].cleared, b.totals.monthlySoFar]).toEqual([false, 0]);
  });
});

describe("the crystal limits", () => {
  // Ids of 15 weekly bosses' hardest difficulties, solo, and Zakum (the cheapest of them: 81M).
  const FIFTEEN: Plan = [
    solo("zakum", "Chaos"),
    solo("vellum", "Chaos"), // 105.06M
    solo("akechi_mitsuhide", "Normal"),
    solo("lotus", "Hard"),
    solo("damien", "Hard"),
    solo("guardian_angel_slime", "Chaos"),
    solo("lucid", "Hard"),
    solo("will", "Hard"),
    solo("gloom", "Chaos"),
    solo("verus_hilla", "Hard"),
    solo("darknell", "Hard"),
    solo("chosen_seren", "Hard"),
    solo("kalos_the_guardian", "Normal"),
    solo("first_adversary", "Normal"),
    solo("kaling", "Easy"),
  ];

  it("past 14 weekly bosses, the least valuable doesn't count, even when ticked", async () => {
    const id = await character();
    await ok(plan(id, FIFTEEN));
    await ok(tick(id, "zakum"));
    const c = (await board()).characters[0];
    expect(c.weekly.filter((r: { over: string | null }) => r.over).map((r: { boss: string; over: string }) => [r.boss, r.over])).toEqual([["zakum", "character"]]);
    const all = c.weekly.reduce((t: number, r: { meso: number }) => t + r.meso, 0);
    expect([c.planned, c.soFar, c.cleared]).toEqual([all - 81 * M, 0, 1]);
    // 15 planned, 14 crystals that can be sold
    expect((await board()).totals).toMatchObject({ bosses: 15, crystals: 14 });
    // Black Mage is monthly and never takes a weekly place
    await ok(plan(id, [...FIFTEEN.slice(1), solo("black_mage", "Hard")]));
    expect((await board()).characters[0].weekly.every((r: { over: null }) => r.over === null)).toBe(true);
  });

  it("past 180 for the world, the least valuable of what the characters can sell don't count", async () => {
    // 13 characters with 14 bosses each = 182 crystals. One character plans Zakum party of 6
    // (13.5M) and another Hilla party of 6 (9.375M): the world's two cheapest.
    const fourteen = FIFTEEN.slice(1);
    const ids: number[] = [];
    for (let i = 0; i < 13; i++) ids.push(await character());
    const plans = ids.flatMap((id) => fourteen.map((p) => ({ characterId: id, ...p })));
    plans[0] = { characterId: ids[0]!, boss: "zakum", difficulty: "Chaos", partySize: 6 };
    plans[14] = { characterId: ids[1]!, boss: "hilla", difficulty: "Hard", partySize: 6 };
    await db().bossPlan.createMany({ data: plans });
    const b = await board();
    const over = b.characters.flatMap((c: { name: string; weekly: { boss: string; over: string | null; meso: number }[] }) => c.weekly.filter((r) => r.over).map((r) => [c.name, r.boss, r.over, r.meso]));
    expect(over).toEqual([
      [b.characters[0].name, "zakum", "world", 13.5 * M],
      [b.characters[1].name, "hilla", "world", 9.375 * M],
    ]);
    expect(b.totals.crystals).toBe(182);
    expect(b.totals.bosses).toBe(182);
    const everything = b.characters.reduce((t: number, c: { weekly: { meso: number }[] }) => t + c.weekly.reduce((s, r) => s + r.meso, 0), 0);
    expect(b.totals.planned).toBe(everything - 13.5 * M - 9.375 * M);
  });
});

describe("PUT /api/bosses/:id/plan", () => {
  it("replaces the whole plan", async () => {
    const id = await character();
    await ok(plan(id, [solo("zakum", "Chaos"), solo("lucid", "Hard")]));
    await ok(plan(id, [solo("will", "Normal")]));
    expect((await board()).characters[0].weekly.map((r: { boss: string }) => r.boss)).toEqual(["will"]);
    await ok(plan(id, []));
    expect((await board()).characters[0].weekly).toEqual([]);
  });

  it.each([
    [[solo("nobody", "Hard")], 'Unknown boss "nobody"'],
    [[solo("zakum", "Hard")], "Zakum has no Hard difficulty"],
    [[{ boss: "lotus", difficulty: "Extreme", partySize: 3 }], "Extreme Lotus allows a party of up to 2"],
    [[{ boss: "limbo", difficulty: "Normal", partySize: 4 }], "Normal Limbo allows a party of up to 3"],
  ])("refuses a boss, difficulty or party the game doesn't have (%j), and changes nothing", async (bad, message) => {
    const id = await character();
    await ok(plan(id, [solo("will", "Normal")]));
    const res = await plan(id, [solo("will", "Hard"), ...bad]);
    expect([res.status, res.body.error]).toEqual([400, message]);
    expect(await db().bossPlan.findMany({ select: { boss: true } })).toEqual([{ boss: "will" }]);
  });

  it("refuses a malformed plan", async () => {
    const id = await character();
    for (const body of [
      {},
      { plan: [solo("zakum", "Chaos"), solo("zakum", "Chaos")] }, // the same boss twice
      { plan: [{ boss: "zakum", difficulty: "Chaos", partySize: 7 }] },
      { plan: [{ boss: "zakum", difficulty: "Chaos", partySize: 0 }] },
      { plan: [{ boss: "zakum", difficulty: "Chaos", partySize: 1.5 }] },
      { plan: [{ boss: "zakum", difficulty: "Insane", partySize: 1 }] },
      { plan: [{ boss: "", difficulty: "Chaos", partySize: 1 }] },
      { plan: [{ boss: "zakum", difficulty: "Chaos" }] },
      { plan: [], extra: true },
    ]) {
      expect((await api().put(`/api/bosses/${id}/plan`).send(body)).status).toBe(400);
    }
  });

  it("this week's ticks follow the plan: a removed boss loses its tick, a changed one takes the new difficulty and party; earlier weeks stay", async () => {
    const id = await character();
    await ok(plan(id, [solo("zakum", "Chaos"), solo("lucid", "Hard"), solo("will", "Hard")]));
    await ok(tick(id, "zakum"));
    at("2026-10-22T08:00:00Z"); // the next week
    await ok(tick(id, "zakum"));
    await ok(tick(id, "lucid"));
    await ok(tick(id, "will"));
    await ok(plan(id, [{ boss: "lucid", difficulty: "Normal", partySize: 2 }, solo("will", "Hard")]));
    const clears = await db().bossClear.findMany({ select: { boss: true, period: true, difficulty: true, partySize: true }, orderBy: [{ period: "asc" }, { boss: "asc" }] });
    expect(clears).toEqual([
      { boss: "zakum", period: "2026-10-15", difficulty: "Chaos", partySize: 1 },
      { boss: "lucid", period: "2026-10-22", difficulty: "Normal", partySize: 2 },
      { boss: "will", period: "2026-10-22", difficulty: "Hard", partySize: 1 },
    ]);
    const c = (await board()).characters[0];
    expect(c.weekly.map((r: { boss: string; cleared: boolean; meso: number }) => [r.boss, r.cleared, r.meso])).toEqual([
      ["lucid", true, 126_914_062], // 50,765,625 × 5 ÷ 2 = 126,914,062.5, rounded down
      ["will", true, 621_810_000],
    ]);
  });

  it("this month's Black Mage tick follows the plan too", async () => {
    const id = await character();
    await ok(plan(id, [solo("black_mage", "Hard")]));
    await ok(tick(id, "black_mage"));
    await ok(plan(id, [{ boss: "black_mage", difficulty: "Extreme", partySize: 2 }]));
    expect(await db().bossClear.findMany({ select: { period: true, difficulty: true, partySize: true } })).toEqual([{ period: "2026-10", difficulty: "Extreme", partySize: 2 }]);
    await ok(plan(id, []));
    expect(await db().bossClear.count()).toBe(0);
  });

  it("only touches its own character's plan and ticks", async () => {
    const a = await character();
    const b = await character();
    await ok(plan(a, [solo("zakum", "Chaos")]));
    await ok(plan(b, [solo("zakum", "Chaos")]));
    await ok(tick(b, "zakum"));
    await ok(plan(a, []));
    expect(await db().bossPlan.findMany({ select: { characterId: true } })).toEqual([{ characterId: b }]);
    expect(await db().bossClear.count()).toBe(1);
  });

  it("deleting a character deletes its plan and ticks", async () => {
    const id = await character();
    await ok(plan(id, [solo("zakum", "Chaos")]));
    await ok(tick(id, "zakum"));
    await ok(api().delete(`/api/characters/${id}`));
    expect([await db().bossPlan.count(), await db().bossClear.count()]).toEqual([0, 0]);
  });
});
