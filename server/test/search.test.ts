import { describe, expect, it } from "vitest";
import { NexonError, type NexonErrorKind } from "../src/nexon/errors";
import { api } from "./api";
import { EXP_TO_NEXT } from "../src/gameFigures/expTable";
import { answer, avatarOf, CHARACTERS, fakeNexon, MIKUBEAM, png } from "./fixtures/nexon";

const dataUrl = (bytes: Uint8Array, type = "png") => `data:image/${type};base64,${Buffer.from(bytes).toString("base64")}`;

// /api/search with a fake Nexon (no test reaches the real one).
const search = (query: string, nexon = fakeNexon().client) => api({ nexon: () => nexon }).get(`/api/search?${query}`);

describe("/api/search", () => {
  it("finds a character on a world, with its avatar as image data and the EXP its level needs", async () => {
    const nexon = fakeNexon();
    const res = await search("world=45&name=MikuBeam", nexon.client);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      name: "MikuBeam",
      worldId: 45,
      level: 285,
      exp: 86_500_000_000_000,
      expToNext: EXP_TO_NEXT[284],
      job: "Kanna",
      worldRank: 6_390,
      overallRank: 19_172,
      legion: { level: 5_804, raidPower: 297_290_139 },
      avatar: dataUrl(png(avatarOf("MikuBeam"))),
    });
    // the avatar came from Nexon's image server, through the same polite queue; its address isn't sent on
    expect(nexon.requests.at(-1)!.url).toBe(avatarOf("MikuBeam"));
    expect(res.text).not.toContain("msavatar");
  });

  it("still finds the character when its avatar can't be downloaded (no picture)", async () => {
    const nexon = fakeNexon((url) => (url.startsWith("https://msavatar1") ? new Response("<html>", { status: 200 }) : answer(url)));
    const res = await search("world=45&name=MikuBeam", nexon.client);
    expect([res.status, res.body.avatar, res.body.name]).toEqual([200, null, "MikuBeam"]);
  });

  it("labels a JPEG avatar as one", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
    const nexon = fakeNexon((url) => (url.startsWith("https://msavatar1") ? new Response(jpeg, { status: 200 }) : answer(url)));
    expect((await search("world=45&name=MikuBeam", nexon.client)).body.avatar).toBe(dataUrl(jpeg, "jpeg"));
  });

  it("at level 300 there's no EXP to next", async () => {
    const nexon = fakeNexon((url) => answer(url, [...CHARACTERS, { ...MIKUBEAM, characterName: "Maxed", level: 300, exp: 0 }]));
    expect((await search("world=45&name=Maxed", nexon.client)).body).toMatchObject({ level: 300, expToNext: null });
  });

  it("ignores spaces around the name", async () => {
    expect((await search("world=70&name=%20SakuraRin%20")).body.name).toBe("SakuraRin");
  });

  it.each([
    ["no name", "world=45"],
    ["an empty name", "world=45&name="],
    ["a name with a space", "world=45&name=Miku%20Beam"],
    ["a name with a symbol", "world=45&name=Miku!"],
    ["a name over 12 characters", "world=45&name=ThirteenChars"],
    ["no world", "name=MikuBeam"],
    ["a world we don't track", "world=1&name=MikuBeam"],
    ["a world that isn't a number", "world=kronos&name=MikuBeam"],
    ["anything extra", "world=45&name=MikuBeam&page=2"],
  ])("refuses %s, without asking Nexon", async (_what, query) => {
    const nexon = fakeNexon();
    const res = await search(query, nexon.client);
    expect([res.status, res.body.error]).toEqual([400, "Invalid input"]);
    expect(nexon.requests).toHaveLength(0);
  });

  it("names the input problem", async () => {
    expect((await search("world=45&name=Miku!")).body.issues).toEqual([{ path: "name", message: "Names are 1–12 letters and numbers" }]);
    expect((await search("world=1&name=Miku")).body.issues).toEqual([{ path: "world", message: "Unknown world" }]);
  });

  it("accepts the longest name (12 characters)", async () => {
    expect((await search("world=45&name=TwelveCharsX")).status).toBe(404); // valid, just not in the rankings
  });

  it.each<[NexonErrorKind, number]>([
    ["not-found", 404],
    ["other-world", 409],
    ["unreachable", 503],
    ["changed", 502],
    ["exp-table", 502],
  ])("Nexon's %s becomes %i, with the message and kind", async (kind, status) => {
    const failing = { lookUp: async () => Promise.reject(new NexonError(kind, `the ${kind} message`)), downloadImage: async () => Promise.reject(new Error("unused")) };
    const res = await search("world=45&name=MikuBeam", failing);
    expect([res.status, res.body]).toEqual([status, { error: `the ${kind} message`, kind }]);
  });
});

describe("tests and the network", () => {
  it("any real network request in a test fails loudly", () => {
    expect(() => fetch("https://www.nexon.com")).toThrow("Tests must not reach the network");
  });
});
