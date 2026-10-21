import { worldName } from "@miku/shared";
import { checkProgress } from "../calc/exp";
import { EXP_TABLE_PATCH } from "../gameFigures/expTable";
import { NexonError } from "./errors";
import { type Board, findEntry, type RankingsReply, rankingsReply, rankingsUrl } from "./rankings";

// Asking Nexon's rankings about characters, politely: one request at a time, at least PAUSE_MS
// apart (even when two lookups happen at once), each with a timeout, and retried a couple of
// times with a growing wait when Nexon can't be reached or is busy.
export const PAUSE_MS = 1_500;
export const TIMEOUT_MS = 15_000;
export const RETRY_WAITS_MS = [2_000, 6_000];

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

export interface NexonClient {
  lookUp(name: string, worldId: number): Promise<CharacterLookup>;
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

  async function getOnce(url: string): Promise<RankingsReply> {
    let res: Response;
    try {
      res = await deps.fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new NexonError("unreachable", UNREACHABLE); // no answer, or too slow
    }
    if (res.status === 429 || res.status >= 500) throw new NexonError("unreachable", UNREACHABLE); // busy or down
    if (!res.ok) throw new NexonError("changed", CHANGED);
    const body: unknown = await res.json().catch(() => undefined);
    const reply = rankingsReply.safeParse(body);
    if (!reply.success) throw new NexonError("changed", CHANGED);
    return reply.data;
  }

  // One request, retried (with growing waits) only when Nexon can't be reached.
  async function get(board: Board, name: string): Promise<RankingsReply> {
    const url = rankingsUrl(deps.baseUrl, board, name);
    for (let attempt = 0; ; attempt++) {
      try {
        return await politely(() => getOnce(url));
      } catch (error) {
        const wait = RETRY_WAITS_MS[attempt];
        if (!(error instanceof NexonError && error.kind === "unreachable") || wait === undefined) throw error;
        await deps.sleep(wait);
      }
    }
  }

  return {
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
