import type { FamiliarLine, FamiliarRank, FamiliarStat } from "@miku/shared";
import badgeFigures from "./familiar-badges.json";

// Familiars, GMS, read 2026-11-01 (research in tempdata/familiars/RESEARCH.md).
// - Each familiar has two potential lines: the 1st from its rank's lines, the 2nd usually from the rank
//   below's, rarely from its own (a Common familiar's 2nd: a hidden weaker pool, not listed anywhere: its
//   own rank's lines stand in). The lines that add to damage stats, by rank: the MapleStory Wiki's
//   "Familiars/Stat Tables" (after v.264, Nov 2025); the Legendary ones also on gms-upgrade-tracker. Unique
//   Boss DMG is 40% only since v.264 (Nexon's Maple Memo). The lines that aren't damage stats (HP, MP, DEF,
//   drops, recovery…) are "other".
// - Familiar Boss DMG counts up to 120% in all (the wiki; gms-upgrade-tracker).
// - The badges (48, 8 equipped at most): familiar-badges.json, rebuilt by hand with
//   scripts/familiar-data.mjs (the wiki's "Familiars/Badges", with its date).

const line = (stat: FamiliarStat, value: number): FamiliarLine => ({ stat, value });
// The lines a rank's main stat %, ATT % (and Magic ATT %) and so on come in.
const each = (stats: readonly FamiliarStat[], value: number) => stats.map((s) => line(s, value));
const MAIN_PCT = ["strPct", "dexPct", "intPct", "lukPct"] as const;
const MAIN_FLAT = ["str", "dex", "int", "luk"] as const;
// (built on first use, as everything here: nothing runs when the file loads)
export const familiarLines = (): Readonly<Record<FamiliarRank, readonly FamiliarLine[]>> => ({
  common: [...each(MAIN_FLAT, 6), ...each(["att", "matt"], 3), line("allStat", 1), ...each(MAIN_PCT, 1), ...each(["attPct", "mattPct", "critRate", "dmg"], 1), line("ied", 15)],
  rare: [...each(MAIN_FLAT, 12), ...each(["att", "matt"], 6), line("allStat", 3), ...each(MAIN_PCT, 2), ...each(["attPct", "mattPct", "critRate", "dmg"], 2), line("allStatPct", 1), line("ied", 15)],
  epic: [...each(MAIN_FLAT, 24), ...each(["att", "matt"], 10), line("allStat", 5), ...each(MAIN_PCT, 3), ...each(["attPct", "mattPct", "dmg"], 3), line("critRate", 4), line("allStatPct", 2), line("ied", 30), line("bossDmg", 20), line("bossDmg", 30)],
  unique: [...each(MAIN_PCT, 6), ...each(["attPct", "mattPct", "dmg"], 6), line("critRate", 8), line("critDmg", 3), line("allStatPct", 3), line("ied", 35), line("ied", 40), line("bossDmg", 40)],
  legendary: [...each(MAIN_PCT, 9), ...each(["attPct", "mattPct", "dmg", "critRate"], 9), line("critDmg", 6), line("allStatPct", 6), line("ied", 45), line("ied", 50), line("bossDmg", 45), line("bossDmg", 50)],
});
export const FAMILIAR_BOSS_CAP = 120;

export interface Badge {
  id: string;
  name: string;
  effects: string[]; // as the wiki words them
  stats: Partial<Record<FamiliarStat, number>>; // the effects that are damage stats
}
export const BADGES: readonly Badge[] = badgeFigures.badges;
export const BADGE_FIGURES = { generated: badgeFigures.generated, source: badgeFigures.source };
