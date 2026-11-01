import { type EPIC_DUNGEONS, HEXA_LEVEL_MAX, HEXA_RANK_MAX, type HexaNode, type HexaStat } from "@miku/shared";
import type { CoreKey, CurveKey, HexaModel } from "../calc/hexaDamage";
import figures from "./hexa-jobs.json";

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
  icon: string | null; // its picture's name in the data folder's item-icons/hexa/ (MapleScouter's name for it; null: MapleScouter has none, Mo Xuan's)
}
const node = (key: HexaNode, name: string, group: HexaGroup, costs: CostTable, icon: string | null, free = 0): HexaNodeFigure => ({ key, name, group, costs, free, icon });

// Every job's figures (hexa-jobs.json, rebuilt by hand with scripts/hexa-data.mjs, with its date): its
// nodes' names (the MapleStory Wiki's "<job>/Skills" pages), MapleScouter's icon names, and MapleScouter's
// damage per core level (through mapledoro's copy, calc/hexaDamage.ts). SHINE classes (Erel Light, Sia
// Astelle) have Erda Link instead of HEXA: not listed.
export const HEXA_FIGURES = { generated: figures.generated, sources: figures.sources };
type JobFigures = { class: string; shine: boolean; icons: string | null; names: { origin: string; ascent: string; mastery: string[]; boost: string[]; common3: string }; cores: Record<string, number> };

// Which of MapleScouter's cores each node is, and its icon's number (MapleScouter's <job>_<n>.png):
// checked against the wiki's own pictures for Ren, Night Walker and Kanna.
export const CORE_OF: Readonly<Record<Exclude<HexaNode, "janus">, CoreKey>> = {
  origin: "skillCore1", ascent: "skillCore2", mastery1: "masteryCore1", mastery2: "masteryCore2", mastery3: "masteryCore3", mastery4: "masteryCore4",
  boost1: "reinCore1", boost2: "reinCore2", boost3: "reinCore3", boost4: "reinCore4", hecate: "generalCore2", common3: "generalCore3",
};
const ICON_NUMBER: Readonly<Record<string, number>> = { origin: 1, ascent: 10, mastery1: 2, mastery2: 7, mastery3: 8, mastery4: 9, boost1: 3, boost2: 4, boost3: 5, boost4: 6, common3: 11 };

// Where a core's stat steps up every few levels (the wiki's per-level skill tables, as mapledoro read them):
// Hoyoung's Universal Harmony final damage +1 every 6 levels, Dark Knight's Gungnir's Descent ignore
// defense at 4, 7, …, 28, and so on. By mapledoro's class id. (Worked out on first use, as everything
// below: nothing runs when the file loads.)
const every = (step: number, from = step): number[] => Array.from({ length: 30 }, (_, i) => from + i * step).filter((L) => L <= 30);
const TENS = [10, 20, 30];
export const coreSteps = (classId: string): Partial<Record<CoreKey, number[]>> => stepsTable()[classId] ?? {};
const stepsTable = (): Record<string, Partial<Record<CoreKey, number[]>>> => ({
  hoyoung: { masteryCore1: every(6) },
  cadena: { masteryCore1: every(2, 3) },
  dark_knight: { masteryCore1: every(3, 4) },
  marksman: { masteryCore1: every(3) },
  shadower: { masteryCore2: every(3), generalCore3: [15, 30] },
  blade_master: { masteryCore1: every(3, 4), generalCore3: [15, 30] },
  night_lord: { generalCore3: [15, 30] },
  cannoneer: { masteryCore1: [...every(3), ...every(6, 7)], masteryCore4: every(3), generalCore3: TENS },
  buccaneer: { generalCore3: TENS },
  corsair: { generalCore3: TENS },
  luminous: { masteryCore1: every(6, 7) },
  mercedes: { masteryCore3: Array.from({ length: 29 }, (_, i) => i + 2).filter((L) => L % 3 !== 0) },
  blaster: { masteryCore3: every(3) },
  xenon: { masteryCore1: every(3, 4) },
  demon_slayer: { masteryCore1: [...every(3, 4), ...every(6, 7)], masteryCore3: every(2, 3) },
  ark: { masteryCore1: every(6, 7), generalCore3: every(2) },
  adele: { masteryCore1: [15, 30], generalCore3: every(2) },
  illium: { generalCore3: every(2) },
  khali: { generalCore3: every(2) },
  bishop: { masteryCore3: every(2), generalCore3: TENS },
  arch_mage_i_l: { masteryCore1: every(2), masteryCore2: every(2), generalCore3: TENS },
  arch_mage_f_p: { generalCore3: TENS },
  kanna: { generalCore3: every(6, 7) },
  hayato: { generalCore3: every(6, 7) },
});

export interface HexaJob {
  nodes: readonly HexaNodeFigure[];
  model: HexaModel; // its damage per core level (calc/hexaDamage.ts)
}
function job(f: JobFigures): HexaJob {
  const icon = (key: string) => (key === "janus" ? "General_1_0" : key === "hecate" ? "General_2" : f.icons ? `${f.icons}_${ICON_NUMBER[key]}` : null);
  const n = (key: HexaNode, name: string, group: HexaGroup, costs: CostTable, free = 0) => node(key, name, group, costs, icon(key), free);
  const { origin, ascent, mastery, boost, common3 } = f.names;
  return {
    nodes: [
      n("origin", origin, "skill", SKILL, 1),
      n("ascent", ascent, "skill", SKILL),
      ...mastery.map((name, i) => n(`mastery${i + 1}` as HexaNode, name, "mastery", MASTERY)),
      ...boost.map((name, i) => n(`boost${i + 1}` as HexaNode, name, "boost", BOOST)),
      n("janus", "Sol Janus", "common", COMMON),
      n("hecate", "Sol Hecate", "common", COMMON),
      n("common3", common3, "common", COMMON_BOOST),
    ],
    model: { cores: f.cores, curves: figures.curves as Record<CurveKey, number[]>, steps: coreSteps(f.class) },
  };
}

// A step of a job's order: a node from level `from` to `to`, and the final damage it adds there (%; the
// gains multiply); or a HEXA Stat node to `to`. Sol Janus is never in it (it adds no damage).
export type HexaStep = { node: HexaNode; from: number; to: number; fd: number } | { stat: 1 | 2 | 3; to: number };

// The jobs the HEXA page works out, by the name Nexon's rankings use (every job but the SHINE classes):
// each built the first time it's asked for.
const allJobs = () => figures.jobs as Record<string, JobFigures>;
const built = new Map<string, HexaJob>();
export function hexaJob(name: string): HexaJob | null {
  if (!Object.hasOwn(allJobs(), name) || allJobs()[name]!.shine) return null;
  const known = built.get(name);
  if (known) return known;
  const made = job(allJobs()[name]!);
  built.set(name, made);
  return made;
}
// (for the tests: forget what was built, so the next ask builds it again)
export const forgetHexaJobs = (): void => built.clear();
// A SHINE class (Erda Link: the page says so).
export const isShine = (name: string): boolean => Object.hasOwn(allJobs(), name) && allJobs()[name]!.shine;

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

// What a HEXA Stat line gives at each level (0–10), as its main line or an additional one: MapleScouter's
// page code and the MapleStory Wiki's table agree at every level (read 2026-10-29). Main stat is flat:
// % doesn't multiply it (MapleScouter; the owner confirmed in game). Xenon's main stat line gives All Stats
// and Demon Avenger's Max HP instead: not worked out (no stat value for them yet).
export const STAT_AMOUNTS: Readonly<Record<HexaStat, { main: readonly number[]; additional: readonly number[] }>> = {
  mainStat: { main: [0, 100, 200, 300, 400, 600, 800, 1000, 1300, 1600, 2000], additional: [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000] },
  att: { main: [0, 5, 10, 15, 20, 30, 40, 50, 65, 80, 100], additional: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50] },
  bossDmg: { main: [0, 1, 2, 3, 4, 6, 8, 10, 13, 16, 20], additional: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  ied: { main: [0, 1, 2, 3, 4, 6, 8, 10, 13, 16, 20], additional: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  dmg: { main: [0, 0.75, 1.5, 2.25, 3, 4.5, 6, 7.5, 9.75, 12, 15], additional: [0, 0.75, 1.5, 2.25, 3, 3.75, 4.5, 5.25, 6, 6.75, 7.5] },
  critDmg: { main: [0, 0.35, 0.7, 1.05, 1.4, 2.1, 2.8, 3.5, 4.55, 5.6, 7], additional: [0, 0.35, 0.7, 1.05, 1.4, 1.75, 2.1, 2.45, 2.8, 3.15, 3.5] },
};
// The jobs whose main stat line isn't main stat (see STAT_AMOUNTS).
export const STAT_MAIN_NOT_WORKED_OUT: readonly string[] = ["Xenon", "Demon Avenger"];

// Fragments a week from each source (Heroic worlds): Erda's Request, and each Epic Dungeon's base reward.
export const ERDA_REQUEST_FRAGS = 90;
export const DUNGEON_FRAGS: Record<(typeof EPIC_DUNGEONS)[number], number> = { none: 0, highMountain: 40, anglerCompany: 55, nightmareParadise: 70 };
