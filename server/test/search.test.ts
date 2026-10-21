import { describe, expect, it } from "vitest";
import { NexonError, type NexonErrorKind } from "../src/nexon/errors";
import { api } from "./api";
import { avatarOf, fakeNexon } from "./fixtures/nexon";

// /api/search with a fake Nexon (no test reaches the real one).
const search = (query: string, nexon = fakeNexon().client) => api({ nexon: () => nexon }).get(`/api/search?${query}`);

describe("/api/search", () => {
  it("finds a character on a world", async () => {
    const res = await search("world=45&name=MikuBeam");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      name: "MikuBeam",
      worldId: 45,
      level: 285,
      exp: 86_500_000_000_000,
      job: "Kanna",
      avatarUrl: avatarOf("MikuBeam"),
      worldRank: 6_390,
      overallRank: 19_172,
      legion: { level: 5_804, raidPower: 297_290_139 },
    });
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
