import { z } from "zod";

// Nexon's public rankings data (the JSON behind nexon.com/maplestory/rankings): undocumented,
// no key needed. What we learned by asking it (2026-10-21):
//   - character_name matches the whole name exactly, ignoring capitals ("batter" finds a
//     character called Batter, not batterboi); an unknown name gives 0 results, not an error
//   - type=world&id=<world> only finds characters on that world (0 results otherwise)
//   - reboot_index picks the world group: 0 = all NA worlds, 1 = Heroic only, 2 = none
//   - type=legion lists one character per account: others on the account aren't found there
//   - type=overall doesn't include Legion (legionLevel is 0 there)

export type Board = { kind: "overall" } | { kind: "world"; worldId: number } | { kind: "legion"; worldId: number };

// What to ask for on each board.
function boardParams(board: Board): Record<string, string> {
  switch (board.kind) {
    case "overall":
      return { type: "overall", id: "legendary", reboot_index: "0" }; // rank among all NA worlds
    case "world":
      return { type: "world", id: String(board.worldId), reboot_index: "0" };
    case "legion":
      return { type: "legion", id: String(board.worldId) };
  }
}

export function rankingsUrl(base: string, board: Board, name: string): string {
  return `${base}?${new URLSearchParams({ ...boardParams(board), page_index: "1", character_name: name })}`;
}

const count = z.number().int().nonnegative();

// Avatars are only ever downloaded from Nexon's own image servers.
export const isNexonImage = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "nexon.net" || u.hostname.endsWith(".nexon.net"));
  } catch {
    return false;
  }
};

// One character in a reply. Other fields Nexon sends are ignored.
export const rankEntry = z.object({
  characterName: z.string().min(1),
  level: z.number().int().min(1).max(300),
  exp: count.max(Number.MAX_SAFE_INTEGER), // EXP into the current level
  rank: z.number().int().positive(),
  worldID: count,
  jobName: z.string().min(1),
  characterImgURL: z.string().refine(isNexonImage),
  legionLevel: count,
  raidPower: count,
});
export type RankEntry = z.infer<typeof rankEntry>;

export const rankingsReply = z.object({ totalCount: count, ranks: z.array(rankEntry) });
export type RankingsReply = z.infer<typeof rankingsReply>;

// The entry for exactly this name (capitals ignored), if the reply has one.
export function findEntry(reply: RankingsReply, name: string): RankEntry | undefined {
  return reply.ranks.find((r) => r.characterName.toLowerCase() === name.toLowerCase());
}
