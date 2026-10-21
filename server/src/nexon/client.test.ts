import { describe, expect, it } from "vitest";
import { answer, avatarOf, entry, fakeNexon, LEEKSPIN, MIKUBEAM, reply, SAKURARIN } from "../../test/fixtures/nexon";
import { PAUSE_MS, RETRY_WAITS_MS, TIMEOUT_MS } from "./client";
import { NexonError } from "./errors";

const failure = (p: Promise<unknown>) => p.then(() => undefined, (e: unknown) => e as NexonError);

describe("looking up a character on a world", () => {
  it("asks the world, overall and Legion boards, and gives the character", async () => {
    const nexon = fakeNexon();
    expect(await nexon.client.lookUp("MikuBeam", 45)).toEqual({
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
    expect(nexon.requests.map((r) => r.url)).toEqual([
      "https://rankings.test/na?type=world&id=45&reboot_index=0&page_index=1&character_name=MikuBeam",
      "https://rankings.test/na?type=overall&id=legendary&reboot_index=0&page_index=1&character_name=MikuBeam",
      "https://rankings.test/na?type=legion&id=45&page_index=1&character_name=MikuBeam",
    ]);
  });

  it("ignores capitals in the name and gives Nexon's spelling", async () => {
    const nexon = fakeNexon();
    expect((await nexon.client.lookUp("mIKUbEAM", 45)).name).toBe("MikuBeam");
  });

  it("a character that isn't the account's Legion character has no Legion", async () => {
    const nexon = fakeNexon();
    expect((await nexon.client.lookUp("LeekSpin", 45)).legion).toBeNull();
  });

  it("works the same on Hyperion", async () => {
    const nexon = fakeNexon();
    expect(await nexon.client.lookUp("SakuraRin", 70)).toMatchObject({ worldId: 70, level: 279, legion: { level: 4_200 } });
    expect(nexon.requests[2]!.url).toContain("type=legion&id=70&");
  });

  it("missing from the overall board, the overall rank is unknown", async () => {
    const nexon = fakeNexon((url) => (url.includes("type=overall") ? reply([]) : answer(url)));
    expect((await nexon.client.lookUp("MikuBeam", 45)).overallRank).toBeNull();
  });

  it("sends a timeout and asks for JSON", async () => {
    const nexon = fakeNexon();
    await nexon.client.lookUp("MikuBeam", 45);
    const init = nexon.requests[0]!.init;
    expect(init.headers).toEqual({ Accept: "application/json" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(TIMEOUT_MS).toBe(15_000);
  });
});

describe("characters that can't be added", () => {
  it("on the other world: says which world it's on", async () => {
    const nexon = fakeNexon();
    const err = await failure(nexon.client.lookUp("sakurarin", 45));
    expect([err?.kind, err?.message]).toEqual(["other-world", "SakuraRin is on Hyperion, not Kronos."]);
    expect(nexon.boards()).toEqual(["world", "overall"]); // no Legion lookup for a character that can't be added
  });

  it("asked about a world MikuTracker doesn't know, says its number", async () => {
    const nexon = fakeNexon();
    expect((await failure(nexon.client.lookUp("LeekSpin", 99)))?.message).toBe("LeekSpin is on Kronos, not world 99.");
  });

  it("on a world MikuTracker doesn't track: says its number", async () => {
    const nexon = fakeNexon((url) => answer(url, [{ ...LEEKSPIN, worldID: 1 }]));
    expect((await failure(nexon.client.lookUp("LeekSpin", 45)))?.message).toBe("LeekSpin is on world 1, not Kronos.");
  });

  it("not in the rankings at all", async () => {
    const nexon = fakeNexon();
    const err = await failure(nexon.client.lookUp("NoSuchName", 70));
    expect(err?.kind).toBe("not-found");
    expect(err?.message).toBe("No character named NoSuchName in Nexon's rankings. Check the spelling; characters too low to be ranked can't be found.");
  });

  it("a different character whose name merely contains it doesn't count", async () => {
    const nexon = fakeNexon((url) => reply([entry({ ...MIKUBEAM, characterName: "MikuBeam2" }, 1)]));
    expect((await failure(nexon.client.lookUp("MikuBeam", 45)))?.kind).toBe("not-found");
  });

  it("EXP that doesn't fit the EXP table (a patch may have changed it)", async () => {
    const nexon = fakeNexon((url) => answer(url, [{ ...MIKUBEAM, level: 200, exp: 2_207_026_470 }]));
    const err = await failure(nexon.client.lookUp("MikuBeam", 45));
    expect(err?.kind).toBe("exp-table");
    expect(err?.message).toBe(
      "Nexon reports level 200 with 2207026470 EXP, which doesn't fit the EXP table (current as of v.271). A GMS patch may have changed the table.",
    );
    expect(nexon.boards()).toEqual(["world"]);
  });

  it("level 300 with no EXP is fine", async () => {
    const nexon = fakeNexon((url) => answer(url, [{ ...MIKUBEAM, level: 300, exp: 0 }]));
    expect((await nexon.client.lookUp("MikuBeam", 45)).level).toBe(300);
  });
});

describe("when Nexon has trouble", () => {
  const fail = () => {
    throw new TypeError("fetch failed");
  };

  it("no answer: retried twice, waiting longer each time, then reported as unreachable", async () => {
    const nexon = fakeNexon(fail);
    const err = await failure(nexon.client.lookUp("MikuBeam", 45));
    expect([err?.kind, err?.message]).toEqual(["unreachable", "Nexon's rankings can't be reached right now. Try again later."]);
    expect(nexon.requests).toHaveLength(3);
    expect(nexon.clock.sleeps.filter((ms) => RETRY_WAITS_MS.includes(ms))).toEqual([2_000, 6_000]);
  });

  it("a retry that works carries on as normal", async () => {
    const nexon = fakeNexon((url, call) => (call === 1 ? fail() : answer(url)));
    expect((await nexon.client.lookUp("MikuBeam", 45)).level).toBe(285);
    expect(nexon.boards()).toEqual(["world", "world", "overall", "legion"]);
  });

  it.each([429, 500, 503])("status %i (busy or down) is retried, then unreachable", async (status) => {
    const nexon = fakeNexon(() => new Response("", { status }));
    expect((await failure(nexon.client.lookUp("MikuBeam", 45)))?.kind).toBe("unreachable");
    expect(nexon.requests).toHaveLength(3);
  });

  it.each([
    ["status 404", () => new Response("", { status: 404 })],
    ["status 403", () => new Response("", { status: 403 })],
    ["a page that isn't JSON", () => new Response("<html>Maintenance</html>", { status: 200 })],
    ["JSON of another shape", () => new Response(JSON.stringify({ data: [] }), { status: 200 })],
  ])("%s means their data changed: reported at once, not retried", async (_what, respond) => {
    const nexon = fakeNexon(respond);
    const err = await failure(nexon.client.lookUp("MikuBeam", 45));
    expect([err?.kind, err?.message]).toEqual(["changed", "Nexon's rankings answered in an unexpected way (their data may have changed)."]);
    expect(nexon.requests).toHaveLength(1);
  });

  it("an error status counts as changed even when its body looks like a normal reply", async () => {
    const nexon = fakeNexon(() => new Response(JSON.stringify({ totalCount: 0, pageIndex: 1, ranks: [] }), { status: 404 }));
    expect((await failure(nexon.client.lookUp("MikuBeam", 45)))?.kind).toBe("changed");
  });

  it("a just-under-limit status (499) isn't treated as busy", async () => {
    const nexon = fakeNexon(() => new Response("", { status: 499 }));
    expect((await failure(nexon.client.lookUp("MikuBeam", 45)))?.kind).toBe("changed");
  });
});

describe("being polite to Nexon", () => {
  it("leaves at least the pause between requests", async () => {
    const nexon = fakeNexon();
    await nexon.client.lookUp("MikuBeam", 45);
    const times = nexon.requests.map((r) => r.at);
    expect(times[1]! - times[0]!).toBe(PAUSE_MS);
    expect(times[2]! - times[1]!).toBe(PAUSE_MS);
    expect(PAUSE_MS).toBe(1_500);
  });

  it("doesn't wait when the last request was long enough ago", async () => {
    const nexon = fakeNexon();
    await nexon.client.lookUp("MikuBeam", 45);
    nexon.clock.advance(60_000);
    const before = nexon.clock.sleeps.length;
    await nexon.client.lookUp("LeekSpin", 45);
    expect(nexon.clock.sleeps.slice(before)).toEqual([PAUSE_MS, PAUSE_MS]); // only between its own requests
  });

  it("exactly a pause since the last request: no waiting at all", async () => {
    const nexon = fakeNexon();
    await nexon.client.lookUp("MikuBeam", 45);
    nexon.clock.advance(PAUSE_MS);
    const before = nexon.clock.sleeps.length;
    await nexon.client.lookUp("LeekSpin", 45);
    expect(nexon.clock.sleeps.slice(before)).toEqual([PAUSE_MS, PAUSE_MS]); // none before its first request
  });

  it("two lookups at once still go one request at a time, each a pause apart", async () => {
    let inFlight = 0;
    let most = 0;
    const nexon = fakeNexon(async (url) => {
      most = Math.max(most, ++inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5)); // a real (short) wait, so overlapping requests would overlap
      inFlight--;
      return answer(url);
    });
    const [a, b] = await Promise.all([nexon.client.lookUp("MikuBeam", 45), nexon.client.lookUp("SakuraRin", 70)]);
    expect([a.name, b.name]).toEqual(["MikuBeam", "SakuraRin"]);
    expect(most).toBe(1);
    const times = nexon.requests.map((r) => r.at);
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(PAUSE_MS);
  });

  it("a failed request doesn't hold up the next lookup", async () => {
    const nexon = fakeNexon((url, call) => (call <= 3 ? new Response("", { status: 503 }) : answer(url)));
    expect((await failure(nexon.client.lookUp("MikuBeam", 45)))?.kind).toBe("unreachable");
    expect((await nexon.client.lookUp("SakuraRin", 70)).name).toBe("SakuraRin");
  });
});

describe("NexonError", () => {
  it("is an Error with a kind", () => {
    const e = new NexonError("changed", "x");
    expect(e).toBeInstanceOf(Error);
    expect([e.kind, e.message]).toEqual(["changed", "x"]);
  });
});
