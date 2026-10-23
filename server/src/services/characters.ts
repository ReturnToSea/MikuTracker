import { worldName } from "@miku/shared";
import { expToNext, totalExp } from "../calc/exp";
import { utcDay } from "../calc/utcDays";
import { db } from "../db";
import { type Character, Prisma } from "../generated/prisma/client";
import { MAX_LEVEL } from "../gameFigures/expTable";
import { HttpError } from "../http";
import type { CharacterLookup, NexonClient } from "../nexon";
import { avatarAddress, currentAvatar, removeUnusedAvatarFiles, saveAvatar, storeAvatar } from "./avatars";
import { takeRemembered } from "./search";

// A character as the app shows it.
export interface CharacterView {
  id: number;
  worldId: number;
  name: string;
  job: string;
  level: number;
  exp: number; // EXP into the current level
  expToNext: number | null; // EXP the current level needs; null at 300
  worldRank: number;
  overallRank: number | null;
  // The world's Legion: Nexon lists it under one character per account, so every character on a
  // world shows the Legion of whichever added character is listed (`from`); null until one is.
  legion: { level: number; raidPower: number; from: string } | null;
  avatar: string | null; // its address, or null before the first download works
  addedAt: Date;
  checkedAt: Date; // last successful lookup
  missingSince: Date | null; // not found in the rankings since then (renamed, or dropped out); its history stays
}

export interface CharacterList {
  characters: CharacterView[]; // in tab order
  selectedId: number | null; // the selected one, or the first; null when there are none
}

type WorldLegion = CharacterView["legion"];

// The Legion shown on a world: from the added character Nexon lists for it (if two are listed,
// e.g. two accounts on one world, the most recently checked one).
function worldLegion(rows: Character[]): WorldLegion {
  const listed = rows.filter((c) => c.legionLevel !== null).sort((a, b) => b.checkedAt.getTime() - a.checkedAt.getTime())[0];
  return listed ? { level: listed.legionLevel!, raidPower: Number(listed.raidPower), from: listed.name } : null;
}

async function view(c: Character, legion: WorldLegion): Promise<CharacterView> {
  const avatar = await currentAvatar(c.id);
  return {
    id: c.id,
    worldId: c.worldId,
    name: c.name,
    job: c.job,
    level: c.level,
    exp: Number(c.exp),
    expToNext: c.level < MAX_LEVEL ? expToNext(c.level) : null,
    worldRank: c.worldRank,
    overallRank: c.overallRank,
    legion,
    avatar: avatar ? avatarAddress(avatar) : null,
    addedAt: c.addedAt,
    checkedAt: c.checkedAt,
    missingSince: c.missingSince,
  };
}

export async function listCharacters(ownerId: string, worldId: number): Promise<CharacterList> {
  const rows = await db().character.findMany({ where: { ownerId, worldId }, orderBy: { sortOrder: "asc" } });
  const selection = await db().selection.findUnique({ where: { ownerId_worldId: { ownerId, worldId } } });
  const legion = worldLegion(rows);
  return { characters: await Promise.all(rows.map((c) => view(c, legion))), selectedId: selection?.characterId ?? rows[0]?.id ?? null };
}

// The latest looked-up details, as stored on the character and in its snapshots.
function details(found: CharacterLookup) {
  return {
    level: found.level,
    exp: BigInt(found.exp),
    worldRank: found.worldRank,
    overallRank: found.overallRank,
    legionLevel: found.legion?.level ?? null,
    raidPower: found.legion ? BigInt(found.legion.raidPower) : null,
  };
}

// Tab positions in each world are always exactly 0, 1, 2, … (adding goes at the end; deleting
// closes the gap; reordering renumbers).

// Adds a character to a world: from the owner's search a moment ago when it was this character
// (instant), otherwise looked up in Nexon's rankings (never taken from the page as is). Saved with
// its first snapshot, made the selected one, and its avatar stored.
export async function addCharacter(ownerId: string, worldId: number, name: string, nexon: NexonClient): Promise<CharacterView> {
  const already = (key: string) => db().character.findUnique({ where: { ownerId_worldId_nameKey: { ownerId, worldId, nameKey: key } } });
  const duplicate = (shown: string) => new HttpError(409, `${shown} is already added on ${worldName(worldId)}.`);
  const existing = await already(name.toLowerCase());
  if (existing) throw duplicate(existing.name); // before asking Nexon at all
  const recent = takeRemembered(ownerId, worldId, name);
  const found = recent?.found ?? (await nexon.lookUp(name, worldId));
  const now = new Date();
  const character = await db()
    .$transaction(async (tx) => {
      const sortOrder = await tx.character.count({ where: { ownerId, worldId } });
      const created = await tx.character.create({
        data: { ownerId, worldId, name: found.name, nameKey: found.name.toLowerCase(), job: found.job, sortOrder, addedAt: now, checkedAt: now, avatarUrl: found.avatarUrl, ...details(found) },
      });
      await tx.snapshot.create({
        data: { characterId: created.id, capturedAt: now, day: utcDay(now), totalExp: BigInt(totalExp(found.level, found.exp)), ...details(found) },
      });
      await tx.selection.upsert({ where: { ownerId_worldId: { ownerId, worldId } }, create: { ownerId, worldId, characterId: created.id }, update: { characterId: created.id } });
      return created;
    })
    .catch((error: unknown) => {
      // Added at the same moment by another request: the database's own uniqueness check stops it.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw duplicate(found.name);
      throw error;
    });
  if (recent?.image) await storeAvatar(character.id, recent.image);
  else await saveAvatar(character.id, found.avatarUrl, nexon);
  return (await listCharacters(ownerId, worldId)).characters.find((c) => c.id === character.id)!;
}

// One of the owner's characters, or a 404 (another owner's characters don't exist for them). The
// one place every service checks this, for when login arrives.
export async function ownCharacter(ownerId: string, id: number): Promise<Character> {
  const c = await db().character.findFirst({ where: { id, ownerId } });
  if (!c) throw new HttpError(404, "Not found");
  return c;
}

// Puts a world's character tabs in a new order: every one of its characters, exactly once.
export async function reorderCharacters(ownerId: string, worldId: number, ids: number[]): Promise<CharacterList> {
  const current = (await db().character.findMany({ where: { ownerId, worldId }, select: { id: true } })).map((c) => c.id);
  const same = ids.length === current.length && new Set(ids).size === ids.length && ids.every((id) => current.includes(id));
  if (!same) throw new HttpError(400, "The new order must list each of this world's characters exactly once.");
  await db().$transaction(ids.map((id, sortOrder) => db().character.update({ where: { id }, data: { sortOrder } })));
  return listCharacters(ownerId, worldId);
}

export async function selectCharacter(ownerId: string, id: number) {
  const c = await ownCharacter(ownerId, id);
  await db().selection.upsert({
    where: { ownerId_worldId: { ownerId, worldId: c.worldId } },
    create: { ownerId, worldId: c.worldId, characterId: id },
    update: { characterId: id },
  });
}

// Deletes a character with everything about it: its snapshots, avatars (files no other character
// uses are removed too) and selection.
export async function deleteCharacter(ownerId: string, id: number) {
  const c = await ownCharacter(ownerId, id);
  await db().$transaction([
    db().character.delete({ where: { id } }),
    // close the gap in the tab positions
    db().character.updateMany({ where: { ownerId, worldId: c.worldId, sortOrder: { gt: c.sortOrder } }, data: { sortOrder: { decrement: 1 } } }),
  ]);
  await removeUnusedAvatarFiles();
}
