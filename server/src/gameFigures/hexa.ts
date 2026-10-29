import { type EPIC_DUNGEONS, HEXA_LEVEL_MAX, HEXA_RANK_MAX, type HexaNode } from "@miku/shared";
import ren from "./hexa-ren.json";

// The HEXA Matrix (6th job), GMS, read 2026-10-29 (research in tempdata/hexa/RESEARCH.md).
// - Which nodes: Nexon's 6th Job page (two Skill Nodes, Origin and Ascent; four Mastery; four Boost;
//   three Common) and the v.269 (Sol Hecate) and v.271 (the 3rd Common Node) notes.
// - Costs per level: the MapleStory Wiki (Module:SolErdaCostTable/costData): the skill nodes' table,
//   Mastery at half of it and Boost at three quarters (each rounded up), Sol Janus and Sol Hecate's
//   own, and the 5th job common boosts' own. The same at every level as MapleScouter's (through
//   hexa-matrix-tracker) and InvenGlobal's total for the 3rd Common Node.
// - HEXA Stat: unlock costs (Nexon, the wiki); the upgrade cost and the primary stat's chance by its
//   level (the wiki; two guides agree it rises from 10 to 20 at level 3; Nexon's page, from launch,
//   says a flat 10).
// - Fragments a week (Heroic): Erda's Request 90 (once per Maple ID), the Epic Dungeons' base rewards.

export interface CostTable {
  erda: readonly number[]; // erda[L − 1]: from level L − 1 to L
  frags: readonly number[];
}
const SKILL: CostTable = {
  erda: [5, 1, 1, 1, 2, 2, 2, 3, 3, 10, 3, 3, 4, 4, 4, 4, 4, 4, 5, 15, 5, 5, 5, 5, 5, 6, 6, 6, 7, 20],
  frags: [100, 30, 35, 40, 45, 50, 55, 60, 65, 200, 80, 90, 100, 110, 120, 130, 140, 150, 160, 350, 170, 180, 190, 200, 210, 220, 230, 240, 250, 500],
};
const COMMON: CostTable = {
  erda: [7, 2, 2, 2, 3, 3, 3, 5, 5, 14, 5, 5, 6, 6, 6, 6, 6, 6, 7, 17, 7, 7, 7, 7, 7, 9, 9, 9, 10, 20],
  frags: [125, 38, 44, 50, 57, 63, 69, 75, 82, 300, 110, 124, 138, 152, 165, 179, 193, 207, 220, 525, 234, 248, 262, 275, 289, 303, 317, 330, 344, 750],
};
const COMMON_BOOST: CostTable = {
  erda: [4, 1, 1, 1, 2, 2, 2, 3, 3, 9, 3, 3, 3, 3, 4, 4, 4, 4, 4, 14, 4, 5, 5, 5, 5, 5, 5, 5, 6, 18],
  frags: [90, 25, 30, 35, 40, 45, 50, 55, 60, 180, 73, 81, 90, 98, 107, 115, 124, 132, 141, 315, 151, 160, 170, 179, 189, 198, 208, 217, 227, 450],
};
// (the wiki's rule for Mastery and Boost: the skill nodes' costs × 0.5 or × 0.75, rounded up)
const scaled = (t: CostTable, by: number): CostTable => ({ erda: t.erda.map((n) => Math.ceil(n * by)), frags: t.frags.map((n) => Math.ceil(n * by)) });
export const MASTERY = scaled(SKILL, 0.5);
export const BOOST = scaled(SKILL, 0.75);

export const HEXA_MAX = HEXA_LEVEL_MAX;
export type HexaGroup = "skill" | "mastery" | "boost" | "common";
export interface HexaNodeFigure {
  key: HexaNode;
  name: string;
  group: HexaGroup;
  costs: CostTable;
  free: number; // the level the 6th job gives it (Origin: 1)
  icon: string; // its picture's name in the data folder's item-icons/hexa/ (MapleScouter's name for it)
}
const node = (key: HexaNode, name: string, group: HexaGroup, costs: CostTable, icon: string, free = 0): HexaNodeFigure => ({ key, name, group, costs, free, icon });

// Ren's nodes (GMS names, as MapleScouter lists them in English through hexa-matrix-tracker).
export const REN_NODES: readonly HexaNodeFigure[] = [
  node("origin", "Divided Heavens", "skill", SKILL, "Len_1", 1),
  node("ascent", "Heartbound Verse", "skill", SKILL, "Len_10"),
  node("mastery1", "Plum Blossom: Storm", "mastery", MASTERY, "Len_2"),
  node("mastery2", "Spirit Strike", "mastery", MASTERY, "Len_7"),
  node("mastery3", "Wish Unending", "mastery", MASTERY, "Len_8"),
  node("mastery4", "Raining Blossoms", "mastery", MASTERY, "Len_9"),
  node("boost1", "Thousand Blossom Flurry", "boost", BOOST, "Len_3"),
  node("boost2", "Soul Immeasurable", "boost", BOOST, "Len_4"),
  node("boost3", "Dancing Annihilation", "boost", BOOST, "Len_5"),
  node("boost4", "Blade of the Unbound Heart", "boost", BOOST, "Len_6"),
  node("janus", "Sol Janus", "common", COMMON, "General_1_0"),
  node("hecate", "Sol Hecate", "common", COMMON, "General_2"),
  node("common3", "Lotus Flower", "common", COMMON_BOOST, "Len_11"),
];

// The upgrade order and the final damage each step adds (%; the gains multiply): MapleScouter's, for GMS
// Heroic worlds, captured 2026-10-01 (hexa-ren.json, with its source). A step from level `from` to `to`
// of a node; or a HEXA Stat node to `to`. Sol Janus isn't in it (it adds no damage).
export type HexaStep = { node: HexaNode; from: number; to: number; fd: number } | { stat: 1 | 2 | 3; to: number };
export const REN_ORDER = { source: ren.source, steps: ren.steps as HexaStep[] };

// The jobs the HEXA page works out (v3.0.0: Ren only; the rest later).
export const HEXA_JOBS: Readonly<Record<string, { nodes: readonly HexaNodeFigure[]; order: typeof REN_ORDER }>> = { Ren: { nodes: REN_NODES, order: REN_ORDER } };

// HEXA Stat: each node's unlock cost; a rank-up's cost and the primary stat's chance of being the one
// raised, by the primary stat's level (0–10; at 10 it can't be raised: the cost isn't in the table,
// taken as level 9's).
export const STAT_UNLOCK: readonly { erda: number; frags: number }[] = [
  { erda: 5, frags: 10 },
  { erda: 10, frags: 200 },
  { erda: 15, frags: 350 },
];
export const STAT_MAX_RANK = HEXA_RANK_MAX;
// The other pictures in the data folder's item-icons/hexa/: HEXA Stat's (Nexon's), Sol Erda's and the fragments'.
export const HEXA_ICONS = { stat: "hexa-stat", erda: "sol-erda", frags: "sol-erda-fragment" } as const;
// Each node's requirements: the character's level, and the node before at rank 20 (Nexon, the wiki). The
// page holds a node back only for the level: every node is planned to 20 and the order takes them in turn.
export const STAT_LEVEL = [260, 265, 270] as const;
export const STAT_RANK_COST = [10, 10, 10, 20, 20, 20, 20, 30, 40, 50, 50] as const;
export const STAT_PRIMARY_CHANCE = [0.35, 0.35, 0.35, 0.2, 0.2, 0.2, 0.2, 0.15, 0.1, 0.05, 0] as const;

// Fragments a week from each source (Heroic worlds): Erda's Request, and each Epic Dungeon's base reward.
export const ERDA_REQUEST_FRAGS = 90;
export const DUNGEON_FRAGS: Record<(typeof EPIC_DUNGEONS)[number], number> = { none: 0, highMountain: 40, anglerCompany: 55, nightmareParadise: 70 };
