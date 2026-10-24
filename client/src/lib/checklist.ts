import { type CustomTaskInput, TASK_CATEGORIES, type TaskCategory, type TaskReset, WEEKLY_RESET_DAY } from "@miku/shared";
import type { ChecklistBoard, ChecklistCharacter, TaskView } from "../api/types";

// The checklist's logic: grouping, counts, limits, and the planning menu's changes. Plain
// functions, tested on their own.

export const CATEGORY_NAMES: Record<TaskCategory, string> = { arcane: "Arcane symbols", sacred: "Sacred symbols", other: "Other" };
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Tasks of one reset, by category in the usual order (Arcane, Sacred, Other), keeping each
// category's own order; categories with none are left out.
export function byCategory(tasks: TaskView[], reset: TaskReset): { category: TaskCategory; tasks: TaskView[] }[] {
  return TASK_CATEGORIES.map((category) => ({ category, tasks: tasks.filter((t) => t.reset === reset && t.category === category) })).filter((g) => g.tasks.length > 0);
}

// A character's planned tasks of one reset, and how many of them are done.
export function doneCount(c: ChecklistCharacter, tasks: TaskView[], reset: TaskReset): [done: number, total: number] {
  const planned = tasks.filter((t) => t.reset === reset && c.plan.includes(t.id));
  return [planned.filter((t) => c.done.includes(t.id)).length, planned.length];
}

// A limited task's state for one character: who used it this period, and whether the limit is
// already used up by others (it can't be ticked then).
export function limitState(board: ChecklistBoard, c: ChecklistCharacter, task: TaskView): { users: string[]; blocked: boolean } {
  const users = board.limits.find((l) => l.task === task.id)?.users ?? [];
  return { users, blocked: Boolean(task.limit) && !c.done.includes(task.id) && users.length >= task.limit!.count };
}

// "once per account", "2 per world".
export const limitText = (limit: NonNullable<TaskView["limit"]>): string => `${limit.count === 1 ? "once" : limit.count} per ${limit.scope}`;

// When a task resets, in words: "Daily", "Weekly (Thursday)", "One-off".
export function resetText(t: Pick<TaskView, "reset" | "weekday">): string {
  if (t.reset === "daily") return "Daily";
  if (t.reset === "weekly") return `Weekly (${WEEKDAYS[t.weekday!]})`;
  return "One-off";
}

// Adds a task to a plan or takes it out.
export const togglePlanned = (plan: string[], id: string): string[] => (plan.includes(id) ? plan.filter((x) => x !== id) : [...plan, id]);

// The board with one task ticked or unticked for one character, shown at once while it's saved
// (the board, with who used the limits, is then loaded again).
export function withTaskDone(board: ChecklistBoard, id: number, task: string, done: boolean): ChecklistBoard {
  const change = (c: ChecklistCharacter) => (c.id !== id ? c : { ...c, done: done ? [...c.done.filter((t) => t !== task), task] : c.done.filter((t) => t !== task) });
  return { ...board, characters: board.characters.map(change) };
}

// A new custom task's starting values, or an existing one's, for the form.
export function taskForm(t?: TaskView): CustomTaskInput {
  if (!t?.custom) return { name: "", category: "other", reset: "daily", weekday: null, worlds: "both", limitScope: "character", limitCount: 1 };
  return { name: t.name, category: t.category, reset: t.reset, weekday: t.weekday, worlds: t.custom.worlds, limitScope: t.limit?.scope ?? "character", limitCount: t.limit?.count ?? 1 };
}

// Switching a form's reset keeps it valid: a weekly task gets a day (the game's, Thursday), and
// the others none.
export const withReset = (f: CustomTaskInput, reset: TaskReset): CustomTaskInput => ({ ...f, reset, weekday: reset === "weekly" ? (f.weekday ?? WEEKLY_RESET_DAY) : null });

// A weekly task on a day other than the game's weekly reset says so ("resets Mon").
export const offDay = (t: Pick<TaskView, "reset" | "weekday">): string | null => (t.reset === "weekly" && t.weekday !== WEEKLY_RESET_DAY ? WEEKDAYS[t.weekday!]!.slice(0, 3) : null);

// A custom task's number, from its id: "custom-12" → 12.
export const customNumber = (id: string): number => Number(id.slice("custom-".length));
