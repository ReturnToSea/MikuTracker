import { worldName } from "@miku/shared";
import { checkProgress } from "../calc/exp";
import { EXP_TABLE_PATCH } from "../gameFigures/expTable";
import { NexonError } from "./errors";
import { type Board, findEntry, isNexonImage, type RankingsReply, rankingsReply, rankingsUrl } from "./rankings";

// Asking Nexon's rankings about characters, politely: one request at a time, at least PAUSE_MS
// apart (even when two lookups happen at once), each with a timeout, and retried a couple of
// times with a growing wait when Nexon can't be reached or is busy.
export const PAUSE_MS = 1_500;
export const TIMEOUT_MS = 15_000;
export const RETRY_WAITS_MS = [2_000, 6_000];
export const MAX_IMAGE_BYTES = 1_000_000; // avatars are a few KB; anything this big isn't one

// Everything from outside is passed in, so tests can use a fake Nexon and a fake clock.
export interface NexonDeps {
  baseUrl: string;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

// A character as the app needs it, from one lookup on a world.
export interface CharacterLookup {
  name: string; // as Nexon spells it
  worldId: number;
  level: number;
  exp: number; // EXP into the current level
  job: string;
  avatarUrl: string; // on Nexon's image servers
  worldRank: number;
  overallRank: number | null; // among all NA worlds
  legion: { level: number; raidPower: number } | null; // null: not the account's listed Legion character
}

export interface NexonImage {
  bytes: Uint8Array;
  type: "png" | "gif" | "jpg";
}

export interface NexonClient {
  lookUp(name: string, worldId: number): Promise<CharacterLookup>;
  // An avatar from Nexon's image servers (only there), checked to really be a picture.
  downloadImage(url: string): Promise<NexonImage>;
}

// What a picture file is, from its first bytes (not from what the server says it is).
export function imageType(bytes: Uint8Array): NexonImage["type"] | null {
  const starts = (...b: number[]) => b.every((v, i) => bytes[i] === v);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  if (starts(0x47, 0x49, 0x46, 0x38)) return "gif";
  if (starts(0xff, 0xd8, 0xff)) return "jpg";
  return null;
}

const UNREACHABLE = "Nexon's rankings can't be reached right now. Try again later.";
const CHANGED = "Nexon's rankings answered in an unexpected way (their data may have changed).";

export function createNexonClient(deps: NexonDeps): NexonClient {
  let lastStart = Number.NEGATIVE_INFINITY;
  let queue: Promise<unknown> = Promise.resolve();

  // Runs requests one after another, at least PAUSE_MS apart.
  function politely<T>(request: () => Promise<T>): Promise<T> {
    const run = queue.then(async () => {
      const wait = lastStart + PAUSE_MS - deps.now();
      if (wait > 0) await deps.sleep(wait);
      lastStart = deps.now();
      return request();
    });
    queue = run.catch(() => {}); // a failed request doesn't hold up the next one
    return run;
  }

  // One request: an answer with an OK status, or a NexonError saying what went wrong.
  async function request(url: string, accept: string): Promise<Response> {
    let res: Response;
    try {
      res = await deps.fetch(url, { headers: { Accept: accept }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new NexonError("unreachable", UNREACHABLE); // no answer, or too slow
    }
    if (res.status === 429 || res.status >= 500) throw new NexonError("unreachable", UNREACHABLE); // busy or down
    if (!res.ok) throw new NexonError("changed", CHANGED);
    return res;
  }

  async function getOnce(url: string): Promise<RankingsReply> {
    const res = await request(url, "application/json");
    const body: unknown = await res.json().catch(() => undefined);
    const reply = rankingsReply.safeParse(body);
    if (!reply.success) throw new NexonError("changed", CHANGED);
    return reply.data;
  }

  async function imageOnce(url: string): Promise<NexonImage> {
    const bytes = new Uint8Array(await (await request(url, "image/*")).arrayBuffer());
    const type = imageType(bytes);
    if (bytes.length > MAX_IMAGE_BYTES || !type) throw new NexonError("changed", "Nexon's avatar wasn't a picture we expected.");
    return { bytes, type };
  }

  // A request, made politely and retried (with growing waits) only when Nexon can't be reached.
  async function withRetries<T>(once: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await politely(once);
      } catch (error) {
        const wait = RETRY_WAITS_MS[attempt];
        if (!(error instanceof NexonError && error.kind === "unreachable") || wait === undefined) throw error;
        await deps.sleep(wait);
      }
    }
  }

  const get = (board: Board, name: string) => withRetries(() => getOnce(rankingsUrl(deps.baseUrl, board, name)));

  return {
    async downloadImage(url) {
      if (!isNexonImage(url)) throw new NexonError("changed", "Avatars are only downloaded from Nexon's own image servers.");
      return withRetries(() => imageOnce(url));
    },

    async lookUp(name, worldId) {
      const here = worldName(worldId) ?? `world ${worldId}`;
      const onWorld = findEntry(await get({ kind: "world", worldId }, name), name);
      if (!onWorld) {
        const anywhere = findEntry(await get({ kind: "overall" }, name), name);
        if (anywhere) throw new NexonError("other-world", `${anywhere.characterName} is on ${worldName(anywhere.worldID) ?? `world ${anywhere.worldID}`}, not ${here}.`);
        throw new NexonError("not-found", `No character named ${name} in Nexon's rankings. Check the spelling; characters too low to be ranked can't be found.`);
      }
      try {
        checkProgress(onWorld.level, onWorld.exp);
      } catch {
        throw new NexonError(
          "exp-table",
          `Nexon reports level ${onWorld.level} with ${onWorld.exp} EXP, which doesn't fit the EXP table (current as of ${EXP_TABLE_PATCH}). A GMS patch may have changed the table.`,
        );
      }
      const overall = findEntry(await get({ kind: "overall" }, name), name);
      const legion = findEntry(await get({ kind: "legion", worldId }, name), name);
      return {
        name: onWorld.characterName,
        worldId,
        level: onWorld.level,
        exp: onWorld.exp,
        job: onWorld.jobName,
        avatarUrl: onWorld.characterImgURL,
        worldRank: onWorld.rank,
        overallRank: overall?.rank ?? null,
        legion: legion ? { level: legion.legionLevel, raidPower: legion.raidPower } : null,
      };
    },
  };
}
