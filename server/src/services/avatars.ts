import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getConfig } from "../config";
import { db } from "../db";
import type { NexonClient } from "../nexon";

// Avatars are kept in the data folder's avatars/, each file named after its contents (so the same
// picture is stored once, a new look is a new file, and no file is ever overwritten). Every
// avatar a character has had is recorded, for the avatar history planned after v1.0.0.

export const avatarAddress = (file: string) => `/avatars/${file}`;

// Downloads a character's current avatar and records it. A failed download is no problem: the
// character keeps its previous avatar (or none yet). Returns the file name, or null.
export async function saveAvatar(characterId: number, url: string, nexon: NexonClient): Promise<string | null> {
  let image;
  try {
    image = await nexon.downloadImage(url);
  } catch {
    return null;
  }
  const file = `${createHash("sha256").update(image.bytes).digest("hex").slice(0, 32)}.${image.type}`;
  const folder = getConfig().avatarDir;
  const target = path.join(folder, file);
  mkdirSync(folder, { recursive: true });
  // Written under a temporary name first, so a write cut short never looks like a finished file.
  // (The same picture written again is the same bytes, so an existing file doesn't change.)
  writeFileSync(`${target}.partial`, image.bytes);
  renameSync(`${target}.partial`, target);
  const now = new Date();
  await db().avatar.upsert({
    where: { characterId_file: { characterId, file } },
    create: { characterId, file, firstSeenAt: now, lastSeenAt: now },
    update: { lastSeenAt: now },
  });
  return file;
}

// A character's current avatar: the one seen most recently.
export async function currentAvatar(characterId: number): Promise<string | null> {
  const latest = await db().avatar.findFirst({ where: { characterId }, orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }] });
  return latest?.file ?? null;
}

// Removes avatar files no character uses any more (after a delete), and any leftover partly
// written ones.
export async function removeUnusedAvatarFiles() {
  const folder = getConfig().avatarDir;
  if (!existsSync(folder)) return;
  const used = new Set((await db().avatar.findMany()).map((a) => a.file));
  for (const file of readdirSync(folder)) if (!used.has(file)) rmSync(path.join(folder, file));
}
