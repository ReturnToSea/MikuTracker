import { expToNext } from "../calc/exp";
import { MAX_LEVEL } from "../gameFigures/expTable";
import type { CharacterLookup, NexonClient } from "../nexon";
import type { NexonImage } from "../nexon/client";

// A character found by searching, before it's added: everything the + box shows, with its
// avatar downloaded by the server and sent along as image data (the page never contacts Nexon).
export interface SearchResult {
  name: string;
  worldId: number;
  level: number;
  exp: number;
  expToNext: number | null; // null at 300
  job: string;
  worldRank: number;
  overallRank: number | null;
  legion: { level: number; raidPower: number } | null; // this character's own Legion entry
  avatar: string | null; // "data:image/png;base64,…", or null if it couldn't be downloaded
}

// The latest search of each owner is remembered, so adding that character right after is instant
// (it's the server's own lookup, not data from the page). A new search replaces it; adding uses it
// up. After REMEMBER_MS it's too old to save as "now", and adding looks the character up again.
export const REMEMBER_MS = 60 * 60 * 1000;
interface Remembered {
  worldId: number;
  nameKey: string;
  found: CharacterLookup;
  image: NexonImage | null;
  at: number;
}
const remembered = new Map<string, Remembered>();

export async function searchCharacter(ownerId: string, name: string, worldId: number, nexon: NexonClient): Promise<SearchResult> {
  const found = await nexon.lookUp(name, worldId);
  let image: NexonImage | null = null;
  try {
    image = await nexon.downloadImage(found.avatarUrl);
  } catch {
    // no picture is no reason to fail the search
  }
  remembered.set(ownerId, { worldId, nameKey: found.name.toLowerCase(), found, image, at: Date.now() });
  const { avatarUrl: _, ...shown } = found;
  return {
    ...shown,
    expToNext: found.level < MAX_LEVEL ? expToNext(found.level) : null,
    avatar: image ? `data:image/${image.type === "jpg" ? "jpeg" : image.type};base64,${Buffer.from(image.bytes).toString("base64")}` : null,
  };
}

// The owner's latest search, if it was this character on this world and isn't too old; it's used up.
export function takeRemembered(ownerId: string, worldId: number, name: string): { found: CharacterLookup; image: NexonImage | null } | undefined {
  const r = remembered.get(ownerId);
  if (!r || r.worldId !== worldId || r.nameKey !== name.toLowerCase() || Date.now() - r.at > REMEMBER_MS) return undefined;
  remembered.delete(ownerId);
  return { found: r.found, image: r.image };
}

// Tests start each case with nothing remembered.
export function forgetSearches() {
  remembered.clear();
}
