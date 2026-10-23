import { type BossPlanInput, countedCrystals, type Difficulty } from "@miku/shared";
import type { BossBoard, BossInfo } from "../api/types";

// The Bosses tab's logic: the planning menu's changes to a plan, and how resets are shown. Plain
// functions, tested on their own.

export type PlanEntry = BossPlanInput["plan"][number];

const difficultyOf = (info: BossInfo, difficulty: Difficulty) => info.difficulties.find((d) => d.difficulty === difficulty)!;

// Adds a boss to the plan (at its easiest difficulty, solo) or takes it out.
export function toggleBoss(plan: PlanEntry[], info: BossInfo): PlanEntry[] {
  if (plan.some((p) => p.boss === info.id)) return plan.filter((p) => p.boss !== info.id);
  return [...plan, { boss: info.id, difficulty: info.difficulties[0]!.difficulty, partySize: 1 }];
}

// Changes a planned boss's difficulty; the party shrinks if the new one allows fewer people.
export function setDifficulty(plan: PlanEntry[], info: BossInfo, difficulty: Difficulty): PlanEntry[] {
  const most = difficultyOf(info, difficulty).maxParty;
  return plan.map((p) => (p.boss === info.id ? { ...p, difficulty, partySize: Math.min(p.partySize, most) } : p));
}

// One more or one fewer in a planned boss's party, from solo up to what its difficulty allows.
export function stepParty(plan: PlanEntry[], info: BossInfo, by: 1 | -1): PlanEntry[] {
  return plan.map((p) => (p.boss === info.id ? { ...p, partySize: Math.max(1, Math.min(difficultyOf(info, p.difficulty).maxParty, p.partySize + by)) } : p));
}

// What one person gets for a planned boss.
export const entryMeso = (entry: PlanEntry, info: BossInfo): number => difficultyOf(info, entry.difficulty).perPerson[entry.partySize - 1]!;

// A plan's weekly bosses, how many are over the character's limit, the weekly meso of the ones
// that count, and the monthly meso. (The world's limit is only checked on the saved plans.)
export function planSummary(plan: PlanEntry[], bosses: BossInfo[], perCharacter: number) {
  const of = (p: PlanEntry) => bosses.find((b) => b.id === p.boss)!;
  const weekly = plan.filter((p) => of(p).kind === "weekly").map((p) => entryMeso(p, of(p)));
  const counts = countedCrystals(weekly, perCharacter);
  return {
    weekly: weekly.length,
    over: counts.filter((c) => !c).length,
    planned: weekly.filter((_, i) => counts[i]).reduce((t, m) => t + m, 0),
    monthly: plan.filter((p) => of(p).kind === "monthly").reduce((t, p) => t + entryMeso(p, of(p)), 0),
  };
}

// The plan in game order (the order of `bosses`), as it's saved.
export const inGameOrder = (plan: PlanEntry[], bosses: BossInfo[]): PlanEntry[] => [...plan].sort((a, b) => bosses.findIndex((x) => x.id === a.boss) - bosses.findIndex((x) => x.id === b.boss));

// The board with one boss ticked or unticked, shown at once while the tick is saved (the board is
// then loaded again, with its totals).
export function withTick(board: BossBoard, id: number, boss: string, cleared: boolean): BossBoard {
  const tick = <R extends { boss: string }>(rows: R[]) => rows.map((r) => (r.boss === boss ? { ...r, cleared } : r));
  return { ...board, characters: board.characters.map((c) => (c.id === id ? { ...c, weekly: tick(c.weekly), monthly: tick(c.monthly) } : c)) };
}

// How long until a reset: "5d 4h", "4h 12m", "12m" (under a minute: "1m").
export function untilReset(now: Date, resetsAt: Date): string {
  const minutes = Math.max(1, Math.ceil((resetsAt.getTime() - now.getTime()) / 60_000));
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// A reset in local time: "Wed 5:00 PM".
export const resetLocal = (resetsAt: Date): string =>
  `${resetsAt.toLocaleDateString("en-US", { weekday: "short" })} ${resetsAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;

// The monthly reset's game date: "Nov 1" (00:00 UTC that day).
export const resetDay = (resetsAt: Date): string => resetsAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// A party size in words: "solo", "party of 3".
export const partyText = (n: number): string => (n === 1 ? "solo" : `party of ${n}`);
