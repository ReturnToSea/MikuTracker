import { HEXA_LEVEL_MAX, HEXA_LINE_MAX, HEXA_RANK_MAX, HEXA_STATS, type HexaInput, type HexaNode, type HexaStat } from "@miku/shared";
type Cost = { erda: number; frags: number };

// The HEXA page's display rules (v3.0.0), as plain functions.

// The node groups, in the owner's order.
export const HEXA_GROUPS = [
  ["skill", "Skill"],
  ["boost", "Enhancement"],
  ["mastery", "Mastery"],
  ["common", "Common"],
] as const;

// A count of fragments or Sol Erda: whole, grouped (12,345; an average like 323.1 is 323).
export const formatCount = (n: number): string => Math.round(n).toLocaleString("en-US");

// How long until something's affordable: now, under a day, N days, or never (nothing coming in).
export function formatDays(days: number | null): string {
  if (days === null) return "never: nothing coming in";
  if (days <= 0) return "now";
  if (days < 1) return "under a day";
  const n = Math.ceil(days);
  return `${n.toLocaleString("en-US")} day${n === 1 ? "" : "s"}`;
}
// The date that is, in local time ("Nov 12, 2026"); null when it's never.
export const dateAfter = (days: number | null, now: Date): string | null =>
  days === null ? null : new Date(now.getTime() + Math.ceil(days) * 86_400_000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
// When a priority row or a step of the order is affordable, short: now, its day ("Nov 13"; the year too
// when it isn't this year's), or "—" (nothing coming in).
export function readyText(days: number | null, now: Date): string {
  if (days === null) return "—";
  if (days <= 0) return "now";
  const d = new Date(now.getTime() + Math.ceil(days) * 86_400_000);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
}

// "≈ " before a figure that's an average (HEXA Stat's), nothing before an exact one.
export const approx = (exact: boolean): string => (exact ? "" : "≈ ");

// How far along the matrix is, by fragments: invested of invested + left (all done: 1).
export const doneShare = (b: { invested: Cost; left: Cost }): number => {
  const all = b.invested.frags + b.left.frags;
  return all > 0 ? b.invested.frags / all : 1;
};

// A node's short tag: Origin, Ascent, M1–M4 (Mastery), E1–E4 (Enhancement); none for the common nodes
// and HEXA Stat.
const TAGS: Readonly<Record<string, string>> = { origin: "Origin", ascent: "Ascent", mastery1: "M1", mastery2: "M2", mastery3: "M3", mastery4: "M4", boost1: "E1", boost2: "E2", boost3: "E3", boost4: "E4" };
export const nodeTag = (node: string): string | null => (Object.hasOwn(TAGS, node) ? TAGS[node]! : null);
// A step's level as the order shows it: the level it goes to, MAX at 30 (and a HEXA Stat node's 20).
export const stepLabel = (s: { node: string; to: number }): string => (s.node.startsWith("stat") || s.to === HEXA_LEVEL_MAX ? "MAX" : String(s.to));
// A step's or row's levels: a node's "Lv. 4 → 9", a HEXA Stat node's "rank 2 → 20".
export const levelsText = (r: { node: string; from: number; to: number }): string => `${r.node.startsWith("stat") ? "rank" : "Lv."} ${r.from} → ${r.to}`;

// A node's level typed: now (at least its free level, at most 30) or wanted (0–30).
export function withLevel(input: HexaInput, which: "current" | "desired", node: HexaNode, level: number, min: number, max: number): HexaInput {
  const lv = Math.min(max, Math.max(which === "current" ? min : 0, Math.round(level)));
  return { ...input, [which]: { ...input[which], [node]: lv } };
}
// Every node wanted at the max, or at its level now.
export function withAllDesired(input: HexaInput, to: "max" | "current"): HexaInput {
  return { ...input, desired: Object.fromEntries(Object.entries(input.current).map(([k, v]) => [k, to === "max" ? HEXA_LEVEL_MAX : v])) as HexaInput["desired"] };
}
// A node's level wanted as shown: one below its level now counts as its level now.
export const wantedOf = (input: HexaInput, node: HexaNode): number => Math.max(input.current[node], input.desired[node]);

type Line = HexaInput["stats"][number]["lines"][number];
function withLines(input: HexaInput, node: number, f: (l: Line, i: number) => Line): HexaInput {
  return { ...input, stats: input.stats.map((x, i) => (i === node ? { ...x, lines: x.lines.map(f) } : x)) as HexaInput["stats"] };
}
// The most a HEXA Stat line can be: 10, and the node's three lines 20 at most.
export const lineMax = (input: HexaInput, node: number, line: number): number =>
  Math.min(HEXA_LINE_MAX, HEXA_RANK_MAX - input.stats[node]!.lines.reduce((sum, l, i) => (i === line ? sum : sum + l.level), 0));
// A HEXA Stat line's level typed (0 to lineMax: a level that would pass it is cut to fit).
export function withStatLine(input: HexaInput, node: number, line: number, level: number): HexaInput {
  const lv = Math.max(0, Math.min(lineMax(input, node, line), Math.round(level)));
  return withLines(input, node, (l, i) => (i === line ? { ...l, level: lv } : l));
}
// A HEXA Stat node as typed: its rank (its lines' levels together), and unlocked (ticked, or any level).
export const rankOf = (s: HexaInput["stats"][number]): number => s.lines.reduce((sum, l) => sum + l.level, 0);
export const unlockedOf = (s: HexaInput["stats"][number]): boolean => s.unlocked || rankOf(s) > 0;
// A HEXA Stat line's stat picked (null: none). The node's other line with that stat loses it (a node's
// three lines are three different stats).
export function withStatPick(input: HexaInput, node: number, line: number, stat: HexaStat | null): HexaInput {
  // (none picked: the other lines with none stay as they are)
  return withLines(input, node, (l, i) => (i === line ? { ...l, stat } : l.stat === stat ? { ...l, stat: null } : l));
}
// The stats a line can be: any, except that a main line can't be another node's main line's stat.
export function statChoices(input: HexaInput, node: number, line: number): HexaStat[] {
  const taken = new Set(input.stats.filter((_, i) => line === 0 && i !== node).map((s) => s.lines[0].stat));
  return HEXA_STATS.filter((st) => !taken.has(st));
}
export const STAT_LABELS: Record<HexaStat, string> = { mainStat: "Main stat", att: "ATT", bossDmg: "Boss DMG", ied: "IED", dmg: "Damage", critDmg: "Crit DMG" };

// The Epic Dungeons as the calculator lists them, with their fragments a week (Heroic; the server's figures).
const DUNGEON_NAMES: Record<HexaInput["dungeon"], string> = { none: "None", highMountain: "High Mountain", anglerCompany: "Angler Company", nightmareParadise: "Nightmare Paradise" };
export const dungeonLabels = (frags: Record<HexaInput["dungeon"], number>): [HexaInput["dungeon"], string][] =>
  (Object.keys(DUNGEON_NAMES) as HexaInput["dungeon"][]).map((k) => [k, frags[k] > 0 ? `${DUNGEON_NAMES[k]} (${frags[k]} a week)` : DUNGEON_NAMES[k]]);
// What comes in a week, from the input as typed: farming a day × 7, Erda's Request, the Epic Dungeon.
export const perWeekOf = (input: HexaInput, figures: { erdaRequest: number; dungeons: Record<HexaInput["dungeon"], number> }): number =>
  input.perDay * 7 + (input.erdaRequest ? figures.erdaRequest : 0) + figures.dungeons[input.dungeon];

// A HEXA Stat node with no level yet: whether it's unlocked (its unlock is then paid).
export function withStatUnlocked(input: HexaInput, node: number, unlocked: boolean): HexaInput {
  return { ...input, stats: input.stats.map((x, i) => (i === node ? { ...x, unlocked } : x)) as HexaInput["stats"] };
}
