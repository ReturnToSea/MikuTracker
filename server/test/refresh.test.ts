import { describe, expect, it, vi } from "vitest";
import { totalExp } from "../src/calc/exp";
import { db } from "../src/db";
import { SOLE_OWNER } from "../src/owner";
import { addCharacter } from "../src/services/characters";
import { CHECK_EVERY_MS, REFRESH_EVERY_MS, refreshAll, refreshDue, saveSnapshot, scheduleRefresh } from "../src/services/refresh";
import { api, ok } from "./api";
import { answer, avatarOf, type FakeCharacter, fakeNexon, LEEKSPIN, MIKUBEAM, SAKURARIN } from "./fixtures/nexon";
import { NOW, useDbTestSetup } from "./helpers";

useDbTestSetup();

const at = (iso: string) => vi.setSystemTime(new Date(iso));
const later = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));

// A fake Nexon whose characters can change between refreshes.
function world(start: FakeCharacter[] = [{ ...MIKUBEAM }, { ...LEEKSPIN }, { ...SAKURARIN }]) {
  const characters = start;
  const nexon = fakeNexon((url) => answer(url, characters));
  const set = (name: string, change: Partial<FakeCharacter>) => Object.assign(characters.find((c) => c.characterName === name)!, change);
  const remove = (name: string) => characters.splice(characters.findIndex((c) => c.characterName === name), 1);
  return { nexon, characters, set, remove };
}

async function added(w: ReturnType<typeof world>, ...names: [string, number][]) {
  const ids: number[] = [];
  for (const [name, worldId] of names) ids.push((await addCharacter(SOLE_OWNER, worldId, name, w.nexon.client)).id);
  return ids;
}

const snapshots = (characterId: number) => db().snapshot.findMany({ where: { characterId }, orderBy: { day: "asc" } });

describe("when a refresh is due", () => {
  it("due with no refresh yet, then every 4 hours after the last one started", async () => {
    expect(await refreshDue(NOW)).toBe(true);
    await db().refreshRun.create({ data: { startedAt: NOW } });
    expect(await refreshDue(new Date(NOW.getTime() + REFRESH_EVERY_MS - 1))).toBe(false);
    expect(await refreshDue(new Date(NOW.getTime() + REFRESH_EVERY_MS))).toBe(true);
    expect(REFRESH_EVERY_MS).toBe(4 * 60 * 60 * 1000);
  });

  it("goes by the latest run", async () => {
    await db().refreshRun.create({ data: { startedAt: new Date(NOW.getTime() - 10 * 60 * 60 * 1000) } });
    await db().refreshRun.create({ data: { startedAt: new Date(NOW.getTime() - 60 * 60 * 1000) } });
    expect(await refreshDue(NOW)).toBe(false);
  });
});

describe("a refresh", () => {
  it("updates every character's details and today's snapshot, and records the run", async () => {
    const w = world();
    const [miku] = await added(w, ["MikuBeam", 45]);
    later(4 * 60 * 60 * 1000);
    w.set("MikuBeam", { level: 286, exp: 1_000, worldRank: 6_000, overallRank: 18_000, jobName: "Kanna", legion: { level: 5_810, raidPower: 300_000_000 } });
    const run = await refreshAll(w.nexon.client);
    expect(run).toMatchObject({ checked: 1, updated: 1, missing: 0, failed: 0, problem: null, startedAt: new Date(Date.now()), finishedAt: new Date(Date.now()) });
    expect(await db().character.findUnique({ where: { id: miku } })).toMatchObject({
      level: 286,
      exp: 1_000n,
      worldRank: 6_000,
      overallRank: 18_000,
      legionLevel: 5_810,
      raidPower: 300_000_000n,
      checkedAt: new Date(Date.now()),
      missingSince: null,
    });
    const [today] = await snapshots(miku!);
    expect(today).toMatchObject({ day: "2026-10-20", level: 286, exp: 1_000n, totalExp: BigInt(totalExp(286, 1_000)), capturedAt: new Date(Date.now()) });
  });

  it("keeps one snapshot per UTC day, updated in place, and a new one when the UTC day changes", async () => {
    // 23:00 UTC on the 20th is 4 PM in California; 01:00 UTC on the 21st is still the 20th there.
    at("2026-10-20T23:00:00Z");
    const w = world();
    const [miku] = await added(w, ["MikuBeam", 45]);
    w.set("MikuBeam", { exp: 2_000 });
    await refreshAll(w.nexon.client);
    expect((await snapshots(miku!)).map((s) => [s.day, s.exp])).toEqual([["2026-10-20", 2_000n]]);
    at("2026-10-21T01:00:00Z");
    w.set("MikuBeam", { exp: 3_000 });
    await refreshAll(w.nexon.client);
    expect((await snapshots(miku!)).map((s) => [s.day, s.exp])).toEqual([
      ["2026-10-20", 2_000n],
      ["2026-10-21", 3_000n],
    ]);
  });

  it("each check adds the EXP gained since the check before to the day's total gained", async () => {
    at("2026-10-20T08:00:00Z");
    const w = world();
    const [miku] = await added(w, ["MikuBeam", 45]); // MikuBeam starts at 285 with 86.5T
    const start = totalExp(285, 86_500_000_000_000);
    const gainedToday = async () => (await snapshots(miku!)).map((s) => [s.day, s.gained]);
    expect(await gainedToday()).toEqual([["2026-10-20", 0n]]); // just added: nothing gained yet
    at("2026-10-20T12:00:00Z");
    w.set("MikuBeam", { exp: 90_000_000_000_000 });
    await refreshAll(w.nexon.client);
    expect(await gainedToday()).toEqual([["2026-10-20", 3_500_000_000_000n]]);
    at("2026-10-20T16:00:00Z");
    w.set("MikuBeam", { level: 286, exp: 1_000 }); // a level-up between checks
    await refreshAll(w.nexon.client);
    expect(await gainedToday()).toEqual([["2026-10-20", BigInt(totalExp(286, 1_000) - start)]]);
    at("2026-10-21T00:30:00Z"); // a new UTC day: its first check counts from the last check of the 20th
    w.set("MikuBeam", { level: 286, exp: 501_000 });
    await refreshAll(w.nexon.client);
    expect(await gainedToday()).toEqual([
      ["2026-10-20", BigInt(totalExp(286, 1_000) - start)],
      ["2026-10-21", 500_000n],
    ]);
  });

  it("each character's checks count only against its own, newest first, over several days", async () => {
    at("2026-10-20T08:00:00Z");
    const w = world();
    const [miku, leek] = await added(w, ["MikuBeam", 45], ["LeekSpin", 45]);
    const mikuStart = 86_500_000_000_000;
    const leekStart = w.characters.find((c) => c.characterName === "LeekSpin")!.exp;
    for (const [i, day] of ["21", "22", "23"].entries()) {
      at(`2026-10-${day}T08:00:00Z`);
      w.set("MikuBeam", { exp: mikuStart + (i + 1) * 1_000 });
      w.set("LeekSpin", { exp: leekStart + (i + 1) * 7 });
      await refreshAll(w.nexon.client);
    }
    expect((await snapshots(miku!)).map((s) => s.gained)).toEqual([0n, 1_000n, 1_000n, 1_000n]);
    expect((await snapshots(leek!)).map((s) => s.gained)).toEqual([0n, 7n, 7n, 7n]);
  });

  it("a character's very first snapshot starts at 0 gained", async () => {
    const w = world();
    const [miku] = await added(w, ["MikuBeam", 45]);
    await db().snapshot.deleteMany({ where: { characterId: miku } });
    const { lookUp } = w.nexon.client;
    await saveSnapshot(miku!, await lookUp("MikuBeam", 45), new Date());
    expect((await snapshots(miku!)).map((s) => [s.day, s.gained])).toEqual([["2026-10-20", 0n]]);
  });

  it("after days that weren't checked, the first check counts from the last one before them", async () => {
    const w = world();
    const [miku] = await added(w, ["MikuBeam", 45]);
    later(3 * 24 * 60 * 60 * 1000);
    w.set("MikuBeam", { exp: 86_500_000_007_000 });
    await refreshAll(w.nexon.client);
    expect((await snapshots(miku!)).map((s) => [s.day, s.gained])).toEqual([
      ["2026-10-20", 0n],
      ["2026-10-23", 7_000n],
    ]);
  });

  it("a day whose numbers didn't change still gets its snapshot (0 EXP gained, not 'not checked')", async () => {
    const w = world();
    const [miku] = await added(w, ["MikuBeam", 45]);
    later(24 * 60 * 60 * 1000);
    await refreshAll(w.nexon.client);
    const days = await snapshots(miku!);
    expect(days.map((s) => s.day)).toEqual(["2026-10-20", "2026-10-21"]);
    expect(days[1]!.totalExp).toBe(days[0]!.totalExp);
    expect(days[1]!.gained).toBe(0n);
  });

  it("checks every character on both worlds, in tab order", async () => {
    const w = world();
    const [miku, , leek] = await added(w, ["MikuBeam", 45], ["SakuraRin", 70], ["LeekSpin", 45]);
    await ok(api().put("/api/characters/order").send({ world: 45, ids: [leek, miku] })); // tab order no longer matches the order added
    const before = w.nexon.requests.length;
    const run = await refreshAll(w.nexon.client);
    expect(run).toMatchObject({ checked: 3, updated: 3 });
    const names = w.nexon.requests.slice(before).filter((r) => r.url.includes("type=world")).map((r) => new URL(r.url).searchParams.get("character_name"));
    expect(names).toEqual(["LeekSpin", "MikuBeam", "SakuraRin"]);
  });

  it("takes Nexon's current spelling of the name", async () => {
    const w = world();
    const [miku] = await added(w, ["MikuBeam", 45]);
    w.set("MikuBeam", { characterName: "mikuBEAM" });
    await refreshAll(w.nexon.client);
    expect(await db().character.findUnique({ where: { id: miku } })).toMatchObject({ name: "mikuBEAM", nameKey: "mikubeam" });
  });
});

describe("characters no longer found", () => {
  it("are marked missing since that run, keeping their history; found again, the mark goes", async () => {
    const w = world();
    const [miku, leek] = await added(w, ["MikuBeam", 45], ["LeekSpin", 45]);
    later(60_000);
    const goneAt = new Date(Date.now());
    w.remove("MikuBeam");
    expect(await refreshAll(w.nexon.client)).toMatchObject({ checked: 2, updated: 1, missing: 1, failed: 0 });
    expect(await db().character.findUnique({ where: { id: miku } })).toMatchObject({ missingSince: goneAt, level: 285 });
    expect(await snapshots(miku!)).toHaveLength(1);
    expect((await db().character.findUnique({ where: { id: leek } }))!.missingSince).toBeNull();

    later(5 * 60 * 60 * 1000);
    await refreshAll(w.nexon.client);
    expect((await db().character.findUnique({ where: { id: miku } }))!.missingSince).toEqual(goneAt); // still since the first time

    w.characters.push({ ...MIKUBEAM, level: 287 });
    later(5 * 60 * 60 * 1000);
    await refreshAll(w.nexon.client);
    expect(await db().character.findUnique({ where: { id: miku } })).toMatchObject({ missingSince: null, level: 287 });
  });

  it("one on the other world now counts as missing too", async () => {
    const w = world();
    const [miku] = await added(w, ["MikuBeam", 45]);
    w.set("MikuBeam", { worldID: 70 });
    expect(await refreshAll(w.nexon.client)).toMatchObject({ missing: 1 });
    expect((await db().character.findUnique({ where: { id: miku } }))!.missingSince).not.toBeNull();
  });

  it("show as missing in the character list", async () => {
    const w = world();
    await added(w, ["MikuBeam", 45]);
    w.remove("MikuBeam");
    await refreshAll(w.nexon.client);
    const list = (await ok(api().get("/api/characters?world=45"))).body;
    expect(list.characters[0].missingSince).toBe(NOW.toISOString());
  });
});

describe("when Nexon has trouble", () => {
  it("unreachable: the run stops at once, says why, and marks nobody missing", async () => {
    const w = world();
    const [miku, leek] = await added(w, ["MikuBeam", 45], ["LeekSpin", 45]);
    const failing = fakeNexon(() => new Response("", { status: 503 }));
    const run = await refreshAll(failing.client);
    expect(run).toMatchObject({ checked: 1, updated: 0, missing: 0, failed: 1, problem: "Nexon's rankings can't be reached right now. Try again later." });
    expect(failing.requests.map((r) => new URL(r.url).searchParams.get("character_name"))).toEqual(["MikuBeam", "MikuBeam", "MikuBeam"]); // only the first character, retried
    for (const id of [miku, leek]) expect((await db().character.findUnique({ where: { id } }))!.missingSince).toBeNull();
  });

  it("answers in an unexpected shape: the run stops too", async () => {
    const w = world();
    await added(w, ["MikuBeam", 45], ["LeekSpin", 45]);
    const odd = fakeNexon(() => new Response(JSON.stringify({ nope: true }), { status: 200 }));
    expect(await refreshAll(odd.client)).toMatchObject({ checked: 1, failed: 1, problem: "Nexon's rankings answered in an unexpected way (their data may have changed)." });
  });

  it("something thrown that isn't an error is still recorded as the problem", async () => {
    const w = world();
    await added(w, ["MikuBeam", 45]);
    const odd = { lookUp: () => Promise.reject("strange failure"), downloadImage: () => Promise.reject(new Error("unused")) };
    expect(await refreshAll(odd)).toMatchObject({ checked: 1, failed: 1, problem: "strange failure" });
  });

  it("one character's EXP not fitting the table: that one fails, the others carry on", async () => {
    const w = world();
    const [miku, leek] = await added(w, ["MikuBeam", 45], ["LeekSpin", 45]);
    w.set("MikuBeam", { level: 200, exp: 2_207_026_470 });
    w.set("LeekSpin", { level: 273 });
    const run = await refreshAll(w.nexon.client);
    expect(run).toMatchObject({ checked: 2, updated: 1, failed: 1 });
    expect(run!.problem).toContain("doesn't fit the EXP table");
    expect((await db().character.findUnique({ where: { id: miku } }))!.level).toBe(285);
    expect((await db().character.findUnique({ where: { id: leek } }))!.level).toBe(273);
  });
});

describe("avatars on refresh", () => {
  const pictureRequests = (n: ReturnType<typeof fakeNexon>) => n.requests.filter((r) => r.url.includes("msavatar")).length;

  it("are only downloaded again when the look changed", async () => {
    const w = world();
    const [miku] = await added(w, ["MikuBeam", 45]);
    const before = pictureRequests(w.nexon);
    await refreshAll(w.nexon.client);
    expect(pictureRequests(w.nexon)).toBe(before); // same look: no download
    const changedLook = `${avatarOf("MikuBeam")}?look=2`;
    // Nexon now gives a new address for its look, and that address serves a different picture.
    const nexon = fakeNexon(async (url) => {
      if (url.includes("msavatar")) return answer(url, w.characters);
      const b = await answer(url, w.characters).json();
      return new Response(JSON.stringify({ ...b, ranks: b.ranks.map((r: object) => ({ ...r, characterImgURL: changedLook })) }), { status: 200 });
    });
    later(5 * 60 * 60 * 1000);
    await refreshAll(nexon.client);
    expect(pictureRequests(nexon)).toBe(1);
    expect(await db().character.findUnique({ where: { id: miku } })).toMatchObject({ avatarUrl: changedLook });
    expect(await db().avatar.count({ where: { characterId: miku } })).toBe(2);
  });

  it("a failed download is tried again next time", async () => {
    const w = world();
    const [miku] = await added(w, ["MikuBeam", 45]);
    const changedLook = `${avatarOf("MikuBeam")}?look=2`;
    let pictures = false;
    const nexon = fakeNexon(async (url) => {
      if (url.includes("msavatar")) return pictures ? new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]), { status: 200 }) : new Response("", { status: 404 });
      const b = await answer(url, w.characters).json();
      return new Response(JSON.stringify({ ...b, ranks: b.ranks.map((r: object) => ({ ...r, characterImgURL: changedLook })) }), { status: 200 });
    });
    await refreshAll(nexon.client);
    expect((await db().character.findUnique({ where: { id: miku } }))!.avatarUrl).toBe(avatarOf("MikuBeam")); // not saved: kept the old one
    pictures = true;
    later(5 * 60 * 60 * 1000);
    await refreshAll(nexon.client);
    expect((await db().character.findUnique({ where: { id: miku } }))!.avatarUrl).toBe(changedLook);
  });

  it("adding a character remembers its look", async () => {
    const w = world();
    const [miku] = await added(w, ["MikuBeam", 45]);
    expect((await db().character.findUnique({ where: { id: miku } }))!.avatarUrl).toBe(avatarOf("MikuBeam"));
  });
});

describe("runs never overlap", () => {
  it("a run asked for while one is going does nothing", async () => {
    const w = world();
    await added(w, ["MikuBeam", 45]);
    const [first, second] = await Promise.all([refreshAll(w.nexon.client), refreshAll(w.nexon.client)]);
    expect([first === null, second === null].sort()).toEqual([false, true]);
    expect(await db().refreshRun.count()).toBe(1);
    expect(await refreshAll(w.nexon.client)).not.toBeNull(); // and the next one runs again afterwards
  });

  it("a run that fails part way still lets the next one run", async () => {
    vi.spyOn(db().refreshRun, "update").mockRejectedValueOnce(new Error("disk full"));
    const w = world();
    await expect(refreshAll(w.nexon.client)).rejects.toThrow("disk full");
    expect(await refreshAll(w.nexon.client)).not.toBeNull();
  });
});

describe("scheduling", () => {
  it("checks at once and then every 15 minutes, without keeping the server alive; stopping ends it", async () => {
    const unref = vi.fn();
    const interval = vi.spyOn(globalThis, "setInterval").mockReturnValue({ unref } as never);
    const clear = vi.spyOn(globalThis, "clearInterval");
    const w = world();
    await added(w, ["MikuBeam", 45]);
    const stop = scheduleRefresh(() => w.nexon.client);
    await vi.waitFor(async () => expect(await db().refreshRun.count()).toBe(1)); // due (none yet): ran at once
    expect(interval).toHaveBeenCalledWith(expect.any(Function), CHECK_EVERY_MS);
    expect(CHECK_EVERY_MS).toBe(15 * 60 * 1000);
    expect(unref).toHaveBeenCalled();
    // the 15-minute check: not due again yet, so nothing runs
    await (interval.mock.calls[0]![0] as () => Promise<void>)();
    expect(await db().refreshRun.count()).toBe(1);
    // 4 hours later it's due
    later(REFRESH_EVERY_MS);
    await (interval.mock.calls[0]![0] as () => Promise<void>)();
    expect(await db().refreshRun.count()).toBe(2);
    stop();
    expect(clear).toHaveBeenCalledWith({ unref });
  });

  it("a check that fails is reported, never fatal", async () => {
    vi.spyOn(globalThis, "setInterval").mockReturnValue({ unref: () => {} } as never);
    const report = vi.fn();
    scheduleRefresh(() => {
      throw new Error("no client");
    }, report);
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith("Refresh failed:", expect.objectContaining({ message: "no client" })));
  });

  it("reports to the console by default", async () => {
    vi.spyOn(globalThis, "setInterval").mockReturnValue({ unref: () => {} } as never);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    scheduleRefresh(() => {
      throw new Error("no client");
    });
    await vi.waitFor(() => expect(log).toHaveBeenCalledWith("Refresh failed:", expect.objectContaining({ message: "no client" })));
  });
});

describe("/api/refresh", () => {
  it("says there's been no refresh yet", async () => {
    expect((await ok(api().get("/api/refresh"))).body).toEqual({ last: null });
  });

  it("gives the latest run", async () => {
    const w = world();
    await added(w, ["MikuBeam", 45]);
    await refreshAll(w.nexon.client);
    later(REFRESH_EVERY_MS);
    w.remove("MikuBeam");
    await refreshAll(w.nexon.client);
    const iso = new Date(Date.now()).toISOString();
    expect((await ok(api().get("/api/refresh"))).body).toEqual({
      last: { startedAt: iso, finishedAt: iso, checked: 1, updated: 0, missing: 1, failed: 0, problem: null },
    });
  });
});
