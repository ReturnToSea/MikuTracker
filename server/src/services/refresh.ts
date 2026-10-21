import { totalExp } from "../calc/exp";
import { utcDay } from "../calc/utcDays";
import { db } from "../db";
import type { Character, RefreshRun } from "../generated/prisma/client";
import type { CharacterLookup, NexonClient } from "../nexon";
import { NexonError } from "../nexon/errors";
import { saveAvatar } from "./avatars";

// The refresh: every 4 hours, every character is looked up in Nexon's rankings again. Nobody knows
// exactly when Nexon updates its rankings, so checking a few times a day catches it whenever it
// happens. Each UTC day keeps one snapshot per character, updated in place with the day's latest
// numbers, so checking often never duplicates history.
export const REFRESH_EVERY_MS = 4 * 60 * 60 * 1000;
export const CHECK_EVERY_MS = 15 * 60 * 1000; // how often to see whether a refresh is due

// Due when no run has started in the last 4 hours (or ever).
export async function refreshDue(now: Date): Promise<boolean> {
  const last = await db().refreshRun.findFirst({ orderBy: { startedAt: "desc" } });
  return !last || now.getTime() - last.startedAt.getTime() >= REFRESH_EVERY_MS;
}

// The details a lookup gives, as stored on a character and its snapshots.
function numbers(found: CharacterLookup) {
  return {
    level: found.level,
    exp: BigInt(found.exp),
    worldRank: found.worldRank,
    overallRank: found.overallRank,
    legionLevel: found.legion?.level ?? null,
    raidPower: found.legion ? BigInt(found.legion.raidPower) : null,
  };
}

// Today's snapshot for a character, created or updated in place with these numbers. Its `gained`
// adds up the change since each check before, so today's bar grows with every check. The first
// check of a day counts from the last check before it (days that weren't checked included).
export async function saveSnapshot(characterId: number, found: CharacterLookup, now: Date) {
  const total = BigInt(totalExp(found.level, found.exp));
  const day = utcDay(now);
  const last = await db().snapshot.findFirst({ where: { characterId }, orderBy: { day: "desc" } });
  const data = { capturedAt: now, totalExp: total, ...numbers(found) };
  if (last?.day === day) {
    await db().snapshot.update({ where: { id: last.id }, data: { ...data, gained: last.gained + total - last.totalExp } });
  } else {
    await db().snapshot.create({ data: { characterId, day, ...data, gained: last ? total - last.totalExp : 0n } });
  }
}

type Outcome = "updated" | "missing";

// One character: its details and today's snapshot updated, or marked missing when it can't be
// found any more (its history stays). Other problems (Nexon unreachable, odd answers, EXP that
// doesn't fit the table) are thrown for the run to handle.
async function refreshCharacter(c: Character, nexon: NexonClient, now: Date): Promise<Outcome> {
  let found: CharacterLookup;
  try {
    found = await nexon.lookUp(c.name, c.worldId);
  } catch (error) {
    if (error instanceof NexonError && (error.kind === "not-found" || error.kind === "other-world")) {
      if (!c.missingSince) await db().character.update({ where: { id: c.id }, data: { missingSince: now } });
      return "missing";
    }
    throw error;
  }
  await db().character.update({
    where: { id: c.id },
    data: { name: found.name, nameKey: found.name.toLowerCase(), job: found.job, checkedAt: now, missingSince: null, ...numbers(found) },
  });
  await saveSnapshot(c.id, found, now);
  // The picture is only downloaded again when its look (Nexon's address for it) changed.
  if (found.avatarUrl !== c.avatarUrl && (await saveAvatar(c.id, found.avatarUrl, nexon))) {
    await db().character.update({ where: { id: c.id }, data: { avatarUrl: found.avatarUrl } });
  }
  return "updated";
}

// Problems that would hit every character the same way: the run stops instead of asking Nexon
// about each one in turn.
const STOPS_THE_RUN = new Set(["unreachable", "changed"]);

let running = false;

// One run over every character, recorded as a RefreshRun. Never two at once: a run asked for while
// one is going returns null.
export async function refreshAll(nexon: NexonClient): Promise<RefreshRun | null> {
  if (running) return null;
  running = true;
  try {
    const run = await db().refreshRun.create({ data: { startedAt: new Date() } });
    const counts = { checked: 0, updated: 0, missing: 0, failed: 0 };
    let problem: string | null = null;
    const characters = await db().character.findMany({ orderBy: [{ worldId: "asc" }, { sortOrder: "asc" }] });
    for (const c of characters) {
      counts.checked++;
      try {
        counts[await refreshCharacter(c, nexon, new Date())]++;
      } catch (error) {
        counts.failed++;
        problem = error instanceof Error ? error.message : String(error);
        if (error instanceof NexonError && STOPS_THE_RUN.has(error.kind)) break;
      }
    }
    return await db().refreshRun.update({ where: { id: run.id }, data: { ...counts, problem, finishedAt: new Date() } });
  } finally {
    running = false;
  }
}

// While the server runs: check now, then every 15 minutes, and refresh when due. A failed check is
// reported, never fatal. Returns a function that stops the checks.
export function scheduleRefresh(nexon: () => NexonClient, report: (message: string, error: unknown) => void = console.error): () => void {
  const check = async () => {
    try {
      if (await refreshDue(new Date())) await refreshAll(nexon());
    } catch (error) {
      report("Refresh failed:", error);
    }
  };
  void check();
  const timer = setInterval(check, CHECK_EVERY_MS);
  timer.unref(); // never keeps the process alive on its own
  return () => clearInterval(timer);
}

export interface RefreshStatus {
  last: { startedAt: Date; finishedAt: Date | null; checked: number; updated: number; missing: number; failed: number; problem: string | null } | null;
}

export async function refreshStatus(): Promise<RefreshStatus> {
  const last = await db().refreshRun.findFirst({ orderBy: { startedAt: "desc" } });
  if (!last) return { last: null };
  const { id: _, ...shown } = last;
  return { last: shown };
}
