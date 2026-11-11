import { byHandWorld, type EditCharacterInput, worldName } from "@miku/shared";
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
  byHand: boolean; // on a world added by hand (Challenger): no EXP, ranks, Legion or avatar from Nexon
  worldRank: number | null; // null when added by hand
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
    byHand: byHandWorld(c.worldId),
    worldRank: byHandWorld(c.worldId) ? null : c.worldRank,
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

const duplicate = (shown: string, worldId: number) => new HttpError(409, `${shown} is already added on ${worldName(worldId)}.`);
const nameTaken = (ownerId: string, worldId: number, name: string) =>
  db().character.findUnique({ where: { ownerId_worldId_nameKey: { ownerId, worldId, nameKey: name.toLowerCase() } } });
// The database's own uniqueness check, when two requests add or rename at the same moment.
const takenNow = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

// Adds a character to a world: from the owner's search a moment ago when it was this character
// (instant), otherwise looked up in Nexon's rankings (never taken from the page as is). Saved with
// its first snapshot, made the selected one, and its avatar stored.
export async function addCharacter(ownerId: string, worldId: number, name: string, nexon: NexonClient): Promise<CharacterView> {
  const existing = await nameTaken(ownerId, worldId, name);
  if (existing) throw duplicate(existing.name, worldId); // before asking Nexon at all
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
      if (takenNow(error)) throw duplicate(found.name, worldId);
      throw error;
    });
  if (recent?.image) await storeAvatar(character.id, recent.image);
  else await saveAvatar(character.id, found.avatarUrl, nexon);
  return (await listCharacters(ownerId, worldId)).characters.find((c) => c.id === character.id)!;
}

// A character added by hand's level for a UTC day, as its snapshot for that day (the level graph's
// points; a second change that day replaces it). No EXP or ranks: they stay 0 (never shown).
function typedDay(tx: Prisma.TransactionClient, characterId: number, level: number, now: Date) {
  const numbers = { capturedAt: now, level, exp: 0n, totalExp: BigInt(totalExp(level, 0)), gained: 0n, worldRank: 0 };
  return tx.snapshot.upsert({ where: { characterId_day: { characterId, day: utcDay(now) } }, create: { characterId, day: utcDay(now), ...numbers }, update: numbers });
}

// Adds a character to a world added by hand (Challenger): as typed, its name, class and level, never
// looked up. Saved with today's level, and made the selected one. No avatar (Nexon has none).
// (Only on a world added by hand: the input rules see to that.)
export async function addByHand(ownerId: string, worldId: number, name: string, job: string, level: number): Promise<CharacterView> {
  const existing = await nameTaken(ownerId, worldId, name);
  if (existing) throw duplicate(existing.name, worldId);
  const now = new Date();
  const character = await db()
    .$transaction(async (tx) => {
      const sortOrder = await tx.character.count({ where: { ownerId, worldId } });
      const created = await tx.character.create({
        data: { ownerId, worldId, name, nameKey: name.toLowerCase(), job, level, exp: 0n, worldRank: 0, sortOrder, addedAt: now, checkedAt: now },
      });
      await typedDay(tx, created.id, level, now);
      await tx.selection.upsert({ where: { ownerId_worldId: { ownerId, worldId } }, create: { ownerId, worldId, characterId: created.id }, update: { characterId: created.id } });
      return created;
    })
    .catch((error: unknown) => {
      if (takenNow(error)) throw duplicate(name, worldId);
      throw error;
    });
  return (await listCharacters(ownerId, worldId)).characters.find((c) => c.id === character.id)!;
}

// Renames a character added by hand, or sets its level (today's, in its level history), or both.
// Characters from Nexon's rankings change only with the refresh.
export async function editCharacter(ownerId: string, id: number, edit: EditCharacterInput): Promise<CharacterView> {
  const c = await ownCharacter(ownerId, id);
  if (!byHandWorld(c.worldId)) throw new HttpError(400, `${c.name} is from Nexon's rankings: it changes with the refresh, not by hand.`);
  if (edit.name !== undefined && edit.name.toLowerCase() !== c.nameKey) {
    const existing = await nameTaken(ownerId, c.worldId, edit.name);
    if (existing) throw duplicate(existing.name, c.worldId);
  }
  const now = new Date();
  // (the level it already has is no change: no day marked as typed)
  const level = edit.level !== c.level ? edit.level : undefined;
  await db()
    .$transaction(async (tx) => {
      await tx.character.update({ where: { id }, data: { ...(edit.name !== undefined && { name: edit.name, nameKey: edit.name.toLowerCase() }), ...(level !== undefined && { level, checkedAt: now }) } });
      if (level !== undefined) await typedDay(tx, id, level, now);
    })
    .catch((error: unknown) => {
      if (takenNow(error)) throw duplicate(edit.name!, c.worldId);
      throw error;
    });
  return (await listCharacters(ownerId, c.worldId)).characters.find((x) => x.id === id)!;
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
