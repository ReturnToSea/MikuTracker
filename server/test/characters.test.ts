import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { totalExp } from "../src/calc/exp";
import { getConfig } from "../src/config";
import { db } from "../src/db";
import { Prisma } from "../src/generated/prisma/client";
import { EXP_TO_NEXT } from "../src/gameFigures/expTable";
import { SOLE_OWNER } from "../src/owner";
import { api, ok } from "./api";
import { answer, CHARACTERS, type FakeCharacter, fakeNexon, LEEKSPIN, MIKUBEAM, png } from "./fixtures/nexon";
import { NOW, useDbTestSetup } from "./helpers";

useDbTestSetup();

const TWINTAILS: FakeCharacter = { characterName: "TwinTails", worldID: 45, level: 300, exp: 0, jobName: "Lynn", worldRank: 2, overallRank: 5 };

// A fake Nexon knowing these characters, and an API using it.
function setup(characters: FakeCharacter[] = [...CHARACTERS, TWINTAILS], respond?: (url: string, call: number) => Response) {
  const nexon = fakeNexon(respond ?? ((url) => answer(url, characters)));
  const call = () => api({ nexon: () => nexon.client });
  return { nexon, call };
}
const add = (call: ReturnType<typeof setup>["call"], name: string, world = 45) => call().post("/api/characters").send({ world, name });
const list = async (call: ReturnType<typeof setup>["call"], world = 45) => (await ok(call().get(`/api/characters?world=${world}`))).body;
// This test run's own avatars folder, from the test setup (not from the code under test).
const AVATARS = path.join(process.env.MIKU_DATA_DIR!, "avatars");
const avatarFile = (address: string) => path.join(AVATARS, address.replace("/avatars/", ""));
// Tab positions in a world, first to last: must always be exactly 0, 1, 2, …
const positions = async (worldId = 45) => (await db().character.findMany({ where: { worldId }, orderBy: { sortOrder: "asc" } })).map((c) => c.sortOrder);

describe("adding a character", () => {
  it("looks it up, saves it with its first snapshot and avatar, and selects it", async () => {
    const { call } = setup();
    const res = await add(call, "MikuBeam");
    expect(res.status).toBe(201);
    const id = res.body.id;
    expect(res.body).toEqual({
      id,
      worldId: 45,
      name: "MikuBeam",
      job: "Kanna",
      level: 285,
      exp: 86_500_000_000_000,
      expToNext: EXP_TO_NEXT[284],
      worldRank: 6_390,
      overallRank: 19_172,
      legion: { level: 5_804, raidPower: 297_290_139 },
      avatar: expect.stringMatching(/^\/avatars\/[0-9a-f]{32}\.png$/),
      addedAt: NOW.toISOString(),
      checkedAt: NOW.toISOString(),
    });
    expect(await list(call)).toEqual({ characters: [res.body], selectedId: id });

    const [snapshot] = await db().snapshot.findMany({ where: { characterId: id } });
    expect(snapshot).toMatchObject({ capturedAt: NOW, day: "2026-10-20", level: 285, exp: 86_500_000_000_000n, worldRank: 6_390, overallRank: 19_172, legionLevel: 5_804, raidPower: 297_290_139n });
    expect(snapshot!.totalExp).toBe(BigInt(totalExp(285, 86_500_000_000_000)));

    expect(readFileSync(avatarFile(res.body.avatar))).toEqual(Buffer.from(png("https://msavatar1.nexon.net/Character/MIKUBEAM.png")));
  });

  it("keeps Nexon's spelling of the name", async () => {
    const { call } = setup();
    expect((await add(call, "mIKUbeam")).body.name).toBe("MikuBeam");
  });

  it("each new character goes at the end of the tabs and becomes the selected one", async () => {
    const { call } = setup();
    const first = (await ok(add(call, "MikuBeam"))).body.id;
    const second = (await ok(add(call, "LeekSpin"))).body.id;
    const body = await list(call);
    expect(body.characters.map((c: { name: string }) => c.name)).toEqual(["MikuBeam", "LeekSpin"]);
    expect([body.selectedId, first < second]).toEqual([second, true]);
    // each shows its own avatar (the latest one is the other character's)
    expect(body.characters[0].avatar).not.toBe(body.characters[1].avatar);
    expect(readFileSync(avatarFile(body.characters[0].avatar))).toEqual(Buffer.from(png("https://msavatar1.nexon.net/Character/MIKUBEAM.png")));
  });

  it("each world keeps its own characters and selection", async () => {
    const { call } = setup();
    const miku = (await ok(add(call, "MikuBeam"))).body.id;
    const rin = (await ok(add(call, "SakuraRin", 70))).body.id;
    expect((await list(call, 45)).characters.map((c: { name: string }) => c.name)).toEqual(["MikuBeam"]);
    expect((await list(call, 70)).selectedId).toBe(rin);
    expect((await list(call, 45)).selectedId).toBe(miku);
  });

  it("two adds of the same character at the same moment: one is added, the other refused", async () => {
    const { call } = setup();
    const [a, b] = await Promise.all([add(call, "MikuBeam"), add(call, "mikubeam")]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect([a, b].find((r) => r.status === 409)!.body).toEqual({ error: "MikuBeam is already added on Kronos." });
    expect(await db().character.count()).toBe(1);
  });

  it("another request adding the same character while this one asks Nexon: refused, named as spelled", async () => {
    const { addCharacter } = await import("../src/services/characters");
    const nexon = fakeNexon();
    // While this lookup is out, the same character gets added (as a parallel request would).
    const racing = {
      ...nexon.client,
      lookUp: async (name: string, world: number) => {
        const found = await nexon.client.lookUp(name, world);
        await db().character.create({
          data: { ownerId: SOLE_OWNER, worldId: 45, name: "MikuBeam", nameKey: "mikubeam", job: "Kanna", level: 285, exp: 0n, worldRank: 1, sortOrder: 0, checkedAt: NOW },
        });
        return found;
      },
    };
    await expect(addCharacter(SOLE_OWNER, 45, "mikubeam", racing)).rejects.toThrow("MikuBeam is already added on Kronos.");
    expect([await db().character.count(), await db().snapshot.count()]).toEqual([1, 0]);
  });

  it.each([
    ["another database error", () => new Prisma.PrismaClientKnownRequestError("Write conflict", { code: "P2034", clientVersion: "test" })],
    ["a plain error", () => new RangeError("Something else broke")],
    ["a non-database error that happens to carry the duplicate code", () => Object.assign(new Error("Look-alike"), { code: "P2002" })],
  ])("%s while saving is not mistaken for a duplicate", async (_what, error) => {
    const { addCharacter } = await import("../src/services/characters");
    const thrown = error();
    vi.spyOn(db(), "$transaction").mockRejectedValueOnce(thrown);
    await expect(addCharacter(SOLE_OWNER, 45, "MikuBeam", fakeNexon().client)).rejects.toBe(thrown);
  });

  it("refuses a character already added (any capitals), without asking Nexon", async () => {
    const { call, nexon } = setup();
    await ok(add(call, "MikuBeam"));
    const asked = nexon.requests.length;
    const res = await add(call, "MIKUBEAM");
    expect([res.status, res.body]).toEqual([409, { error: "MikuBeam is already added on Kronos." }]); // named as it's spelled
    expect(nexon.requests).toHaveLength(asked);
    expect(await db().character.count()).toBe(1);
  });

  it("passes Nexon's answer on when the character can't be added, saving nothing", async () => {
    const { call } = setup();
    const other = await add(call, "SakuraRin", 45);
    expect([other.status, other.body]).toEqual([409, { error: "SakuraRin is on Hyperion, not Kronos.", kind: "other-world" }]);
    expect((await add(call, "NoSuchName")).status).toBe(404);
    expect(await db().character.count()).toBe(0);
    expect(await db().snapshot.count()).toBe(0);
  });

  it("is still added when the avatar can't be downloaded (no picture yet)", async () => {
    const { call } = setup(undefined, (url) => (url.startsWith("https://msavatar1") ? new Response("", { status: 503 }) : answer(url, CHARACTERS)));
    const res = await add(call, "MikuBeam");
    expect([res.status, res.body.avatar]).toEqual([201, null]);
    expect(await db().avatar.count()).toBe(0);
  });

  it("level 300 has no EXP to next; a character without listed Legion has none", async () => {
    const { call } = setup();
    expect((await add(call, "TwinTails")).body).toMatchObject({ level: 300, expToNext: null, legion: null });
    expect((await add(call, "LeekSpin")).body.legion).toBeNull();
  });

  it.each([
    ["no name", { world: 45 }],
    ["a bad name", { world: 45, name: "Miku Beam" }],
    ["an unknown world", { world: 1, name: "MikuBeam" }],
    ["anything extra", { world: 45, name: "MikuBeam", level: 300 }],
  ])("refuses %s without asking Nexon", async (_what, body) => {
    const { call, nexon } = setup();
    expect((await call().post("/api/characters").send(body)).status).toBe(400);
    expect(nexon.requests).toHaveLength(0);
  });
});

describe("reordering the tabs", () => {
  async function three() {
    const s = setup();
    const ids = [];
    for (const name of ["MikuBeam", "LeekSpin", "TwinTails"]) ids.push((await ok(add(s.call, name))).body.id as number);
    return { ...s, ids };
  }

  it("puts the characters in the given order, and keeps it (the other world's characters aren't involved)", async () => {
    const { call, ids } = await three();
    await ok(add(call, "SakuraRin", 70));
    const [a, b, c] = ids;
    const res = await call().put("/api/characters/order").send({ world: 45, ids: [c, a, b] });
    expect(res.body.characters.map((x: { id: number }) => x.id)).toEqual([c, a, b]);
    expect((await list(call)).characters.map((x: { id: number }) => x.id)).toEqual([c, a, b]);
  });

  it("a character added after reordering goes at the end", async () => {
    const { call, ids } = await three();
    const [a, b, c] = ids;
    await ok(call().put("/api/characters/order").send({ world: 45, ids: [c, b, a] }));
    await ok(call().delete(`/api/characters/${b}`));
    const d = (await ok(add(call, "SakuraRin", 70))).body.id; // another world: doesn't affect this one
    const e = (await ok(add(call, "LeekSpin"))).body.id;
    expect((await list(call)).characters.map((x: { id: number }) => x.id)).toEqual([c, a, e]);
    expect(d).toBeGreaterThan(0);
  });

  it("tab positions stay exactly 0, 1, 2, … through adding, reordering and deleting", async () => {
    const { call, ids } = await three();
    expect(await positions()).toEqual([0, 1, 2]);
    await ok(call().put("/api/characters/order").send({ world: 45, ids: [ids[2], ids[0], ids[1]] }));
    expect(await positions()).toEqual([0, 1, 2]);
    await ok(call().delete(`/api/characters/${ids[2]}`)); // the first tab
    expect(await positions()).toEqual([0, 1]);
    await ok(add(call, "SakuraRin", 70));
    expect([await positions(45), await positions(70)]).toEqual([[0, 1], [0]]);
    await ok(add(call, "TwinTails"));
    expect(await positions()).toEqual([0, 1, 2]);
  });

  it("deleting a middle tab while the other world has several characters", async () => {
    const extra: FakeCharacter[] = [{ ...MIKUBEAM, characterName: "Hyp1", worldID: 70 }, { ...MIKUBEAM, characterName: "Hyp2", worldID: 70 }];
    const { call } = setup([...CHARACTERS, TWINTAILS, ...extra]);
    const ids = [];
    for (const name of ["MikuBeam", "LeekSpin", "TwinTails"]) ids.push((await ok(add(call, name))).body.id as number);
    await ok(add(call, "Hyp1", 70));
    await ok(add(call, "Hyp2", 70));
    await ok(call().delete(`/api/characters/${ids[1]}`)); // the middle tab
    expect([await positions(45), await positions(70)]).toEqual([[0, 1], [0, 1]]);
    expect((await list(call)).characters.map((x: { id: number }) => x.id)).toEqual([ids[0], ids[2]]);
    await ok(call().delete(`/api/characters/${ids[0]}`)); // the first tab: Hyperion's second tab (position 1) must not move
    expect([await positions(45), await positions(70)]).toEqual([[0], [0, 1]]);
  });

  it.each([
    ["one missing", (i: number[]) => [i[0], i[1]]],
    ["one twice", (i: number[]) => [i[0], i[0], i[1]]],
    ["one twice instead of another", (i: number[]) => [i[0], i[1], i[1]]],
    ["an unknown one", (i: number[]) => [...i, 999]],
    ["an unknown one instead of another", (i: number[]) => [i[0], i[1], 999]],
  ])("refuses an order with %s, changing nothing", async (_what, order) => {
    const { call, ids } = await three();
    const res = await call().put("/api/characters/order").send({ world: 45, ids: order(ids) });
    expect([res.status, res.body]).toEqual([400, { error: "The new order must list each of this world's characters exactly once." }]);
    expect((await list(call)).characters.map((x: { id: number }) => x.id)).toEqual(ids);
  });

  it("refuses a character from the other world", async () => {
    const { call, ids } = await three();
    const rin = (await ok(add(call, "SakuraRin", 70))).body.id;
    expect((await call().put("/api/characters/order").send({ world: 45, ids: [ids[0], ids[1], rin] })).status).toBe(400);
  });
});

describe("selecting", () => {
  it("selects a character on its own world", async () => {
    const { call } = setup();
    const miku = (await ok(add(call, "MikuBeam"))).body.id;
    await ok(add(call, "LeekSpin"));
    await ok(add(call, "SakuraRin", 70));
    expect((await call().post(`/api/characters/${miku}/select`)).status).toBe(204);
    expect((await list(call, 45)).selectedId).toBe(miku);
    expect((await list(call, 70)).characters[0].name).toBe("SakuraRin");
  });

  it("with nothing selected (the selected one was deleted), the first is", async () => {
    const { call } = setup();
    const miku = (await ok(add(call, "MikuBeam"))).body.id;
    const leek = (await ok(add(call, "LeekSpin"))).body.id;
    await ok(call().delete(`/api/characters/${leek}`));
    expect((await list(call)).selectedId).toBe(miku);
  });

  it("an unknown character, or another owner's, is not found", async () => {
    const { call } = setup();
    const theirs = await db().character.create({
      data: { ownerId: "someone-else", worldId: 45, name: "Theirs", nameKey: "theirs", job: "Hero", level: 200, exp: 0n, worldRank: 1, sortOrder: 0, checkedAt: NOW },
    });
    expect((await call().post(`/api/characters/${theirs.id}/select`)).body).toEqual({ error: "Not found" });
    expect((await call().post(`/api/characters/${theirs.id}/select`)).status).toBe(404);
    expect((await call().post("/api/characters/999/select")).status).toBe(404);
    expect((await call().post("/api/characters/abc/select")).status).toBe(400);
    expect(await db().selection.count()).toBe(0);
  });
});

describe("deleting", () => {
  it("removes the character with its snapshots, avatars, selection and avatar file", async () => {
    const { call } = setup();
    const added = (await ok(add(call, "MikuBeam"))).body;
    const res = await call().delete(`/api/characters/${added.id}`);
    expect(res.status).toBe(204);
    expect(await list(call)).toEqual({ characters: [], selectedId: null });
    for (const count of [db().character.count(), db().snapshot.count(), db().avatar.count(), db().selection.count()]) expect(await count).toBe(0);
    expect(existsSync(avatarFile(added.avatar))).toBe(false);
  });

  it("keeps an avatar file another character still uses", async () => {
    // Every avatar the same picture, so both characters share one file.
    const { call } = setup(undefined, (url) => (url.startsWith("https://msavatar1") ? new Response(png("same"), { status: 200 }) : answer(url, CHARACTERS)));
    const miku = (await ok(add(call, "MikuBeam"))).body;
    const leek = (await ok(add(call, "LeekSpin"))).body;
    expect(miku.avatar).toBe(leek.avatar);
    await ok(call().delete(`/api/characters/${miku.id}`));
    expect(existsSync(avatarFile(leek.avatar))).toBe(true);
    await ok(call().delete(`/api/characters/${leek.id}`));
    expect(existsSync(avatarFile(leek.avatar))).toBe(false);
  });

  it("removes only its own avatar file, keeping the others'", async () => {
    const { call } = setup();
    const miku = (await ok(add(call, "MikuBeam"))).body;
    const leek = (await ok(add(call, "LeekSpin"))).body;
    await ok(call().delete(`/api/characters/${miku.id}`));
    expect([existsSync(avatarFile(miku.avatar)), existsSync(avatarFile(leek.avatar))]).toEqual([false, true]);
  });

  it("still works when no avatar was ever saved (the avatars folder doesn't exist yet)", async () => {
    rmSync(AVATARS, { recursive: true, force: true });
    const { call } = setup(undefined, (url) => (url.startsWith("https://msavatar1") ? new Response("", { status: 404 }) : answer(url, CHARACTERS)));
    const miku = (await ok(add(call, "MikuBeam"))).body;
    expect(existsSync(AVATARS)).toBe(false);
    expect((await call().delete(`/api/characters/${miku.id}`)).status).toBe(204);
  });

  it("still works when the avatar file is already gone, and clears leftover partly written files", async () => {
    const { call } = setup();
    const miku = (await ok(add(call, "MikuBeam"))).body;
    rmSync(avatarFile(miku.avatar));
    writeFileSync(path.join(AVATARS, "leftover.png.partial"), "half");
    expect((await call().delete(`/api/characters/${miku.id}`)).status).toBe(204);
    expect(readdirSync(AVATARS)).toEqual([]);
  });

  it("leaves the other characters alone", async () => {
    const { call } = setup();
    const miku = (await ok(add(call, "MikuBeam"))).body.id;
    await ok(add(call, "LeekSpin"));
    await ok(call().delete(`/api/characters/${miku}`));
    expect((await list(call)).characters.map((c: { name: string }) => c.name)).toEqual(["LeekSpin"]);
    expect(await db().snapshot.count()).toBe(1);
  });

  it("an unknown character, or another owner's, is not found (and nothing is deleted)", async () => {
    const { call } = setup();
    const theirs = await db().character.create({
      data: { ownerId: "someone-else", worldId: 45, name: "Theirs", nameKey: "theirs", job: "Hero", level: 200, exp: 0n, worldRank: 1, sortOrder: 0, checkedAt: NOW },
    });
    expect((await call().delete(`/api/characters/${theirs.id}`)).status).toBe(404);
    expect((await call().delete("/api/characters/999")).status).toBe(404);
    expect((await call().delete("/api/characters/0")).status).toBe(400);
    expect(await db().character.count()).toBe(1);
  });
});

describe("avatars", () => {
  it("are kept in this test run's own folder", () => {
    expect(getConfig().avatarDir).toBe(AVATARS);
  });

  it("are served, and may be kept by the browser (a file never changes)", async () => {
    const { call } = setup();
    const added = (await ok(add(call, "MikuBeam"))).body;
    const res = await call().get(added.avatar);
    expect([res.status, res.headers["content-type"]]).toEqual([200, "image/png"]);
    expect(res.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  it("a new look becomes a new file, and the latest one is shown", async () => {
    let look = "first";
    const { call } = setup(undefined, (url) => (url.startsWith("https://msavatar1") ? new Response(png(look), { status: 200 }) : answer(url, CHARACTERS)));
    const added = (await ok(add(call, "MikuBeam"))).body;
    look = "second";
    const { saveAvatar } = await import("../src/services/avatars");
    const { fakeNexon: again } = await import("./fixtures/nexon");
    const next = again(() => new Response(png(look), { status: 200 }));
    const file = await saveAvatar(added.id, "https://msavatar1.nexon.net/Character/X.png", next.client);
    const after = (await list(call)).characters[0].avatar;
    expect(after).toBe(`/avatars/${file}`);
    expect(after).not.toBe(added.avatar);
    expect(await db().avatar.count({ where: { characterId: added.id } })).toBe(2);
    expect(existsSync(avatarFile(added.avatar))).toBe(true); // the old look is kept
  });

  it("an earlier look that comes back is the current one again", async () => {
    let look = "a";
    const nexonImages = fakeNexon(() => new Response(png(look), { status: 200 }));
    const { call } = setup();
    const added = (await ok(add(call, "MikuBeam"))).body;
    const { saveAvatar } = await import("../src/services/avatars");
    const url = "https://msavatar1.nexon.net/Character/X.png";
    vi.setSystemTime(new Date(NOW.getTime() + 60_000));
    const fileA = await saveAvatar(added.id, url, nexonImages.client);
    look = "b";
    vi.setSystemTime(new Date(NOW.getTime() + 120_000));
    await saveAvatar(added.id, url, nexonImages.client);
    look = "a";
    vi.setSystemTime(new Date(NOW.getTime() + 180_000));
    await saveAvatar(added.id, url, nexonImages.client);
    expect((await list(call)).characters[0].avatar).toBe(`/avatars/${fileA}`);
    expect(await db().avatar.count({ where: { characterId: added.id } })).toBe(3); // the first download, a and b
  });

  it("the same look seen again is not stored twice", async () => {
    const { call } = setup();
    const added = (await ok(add(call, "MikuBeam"))).body;
    const { saveAvatar } = await import("../src/services/avatars");
    await saveAvatar(added.id, "https://msavatar1.nexon.net/Character/MIKUBEAM.png", fakeNexon().client);
    expect(await db().avatar.count()).toBe(1);
  });
});

describe("whose characters", () => {
  it("are the sole owner's", async () => {
    const { call } = setup();
    await ok(add(call, "MikuBeam"));
    expect((await db().character.findFirst())?.ownerId).toBe(SOLE_OWNER);
  });

  it("another owner's characters don't show", async () => {
    const { call } = setup();
    await db().character.create({
      data: { ownerId: "someone-else", worldId: 45, name: "Theirs", nameKey: "theirs", job: "Hero", level: 200, exp: 0n, worldRank: 1, sortOrder: 0, checkedAt: NOW },
    });
    expect(await list(call)).toEqual({ characters: [], selectedId: null });
    expect(LEEKSPIN.worldID).toBe(MIKUBEAM.worldID);
  });
});
