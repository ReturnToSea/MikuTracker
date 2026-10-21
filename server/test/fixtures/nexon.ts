import { createNexonClient, type NexonDeps } from "../../src/nexon/client";

// A fake Nexon rankings server, answering the way the real one was seen to on 2026-10-21 (see
// src/nexon/rankings.ts): names match exactly ignoring capitals, type=world only finds that
// world's characters, and type=legion lists only each account's Legion character.
// The characters are made up.

export interface FakeCharacter {
  characterName: string;
  worldID: number;
  level: number;
  exp: number;
  jobName: string;
  worldRank: number;
  overallRank: number;
  legion?: { level: number; raidPower: number };
}

export const MIKUBEAM: FakeCharacter = {
  characterName: "MikuBeam",
  worldID: 45,
  level: 285,
  exp: 86_500_000_000_000, // 86.9% of level 285's 99.5T
  jobName: "Kanna",
  worldRank: 6_390,
  overallRank: 19_172,
  legion: { level: 5_804, raidPower: 297_290_139 },
};
export const LEEKSPIN: FakeCharacter = { characterName: "LeekSpin", worldID: 45, level: 272, exp: 1_000_000, jobName: "Bishop", worldRank: 9_001, overallRank: 30_456 };
export const SAKURARIN: FakeCharacter = { characterName: "SakuraRin", worldID: 70, level: 279, exp: 0, jobName: "Adele", worldRank: 512, overallRank: 23_000, legion: { level: 4_200, raidPower: 88_000_000 } };
export const CHARACTERS = [MIKUBEAM, LEEKSPIN, SAKURARIN];

export const avatarOf = (name: string) => `https://msavatar1.nexon.net/Character/${name.toUpperCase()}.png`;

// A reply entry, as Nexon writes it (with fields we ignore, too).
export function entry(c: FakeCharacter, rank: number, legion = c.legion) {
  return {
    characterName: c.characterName,
    exp: c.exp,
    gap: 0,
    level: c.level,
    rank,
    worldID: c.worldID,
    characterImgURL: avatarOf(c.characterName),
    jobName: c.jobName,
    legionLevel: legion?.level ?? 0,
    raidPower: legion?.raidPower ?? 0,
    tierID: 0,
    starSum: 0,
  };
}

export const reply = (ranks: unknown[]) => new Response(JSON.stringify({ totalCount: ranks.length, pageIndex: 1, ranks }), { status: 200 });

// A small picture file: a real PNG header followed by bytes unique to the text.
export const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export const png = (text: string) => new Uint8Array([...PNG_HEADER, ...new TextEncoder().encode(text)]);

// Answers a rankings address from a list of characters, and avatar addresses with a picture.
export function answer(url: string, characters: FakeCharacter[] = CHARACTERS): Response {
  if (url.startsWith("https://msavatar1.nexon.net/")) return new Response(png(url), { status: 200, headers: { "Content-Type": "image/png" } });
  const q = new URL(url).searchParams;
  const named = characters.filter((c) => c.characterName.toLowerCase() === q.get("character_name")?.toLowerCase());
  const world = Number(q.get("id"));
  if (q.get("type") === "world") return reply(named.filter((c) => c.worldID === world).map((c) => entry(c, c.worldRank)));
  if (q.get("type") === "legion") return reply(named.filter((c) => c.worldID === world && c.legion).map((c) => entry(c, 1)));
  if (q.get("type") === "overall" && q.get("id") === "legendary") return reply(named.map((c) => entry(c, c.overallRank, undefined)));
  return reply([]);
}

// A fake clock: sleeping moves time forward at once and is recorded.
export function fakeClock(start = 0) {
  let t = start;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

// A Nexon client with a fake server and a fake clock. `respond` decides each answer (by default
// the fake rankings above); every request is recorded with the time it was made.
export function fakeNexon(respond: (url: string, call: number) => Response | Promise<Response> = (url) => answer(url)) {
  const clock = fakeClock(1_000_000);
  const requests: { url: string; at: number; init: RequestInit }[] = [];
  const deps: NexonDeps = {
    baseUrl: "https://rankings.test/na",
    fetch: async (url, init) => {
      requests.push({ url, at: clock.now(), init });
      return respond(url, requests.length);
    },
    sleep: clock.sleep,
    now: clock.now,
  };
  return { client: createNexonClient(deps), requests, clock, boards: () => requests.map((r) => new URL(r.url).searchParams.get("type")) };
}
