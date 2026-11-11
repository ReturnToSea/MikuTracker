import { type CustomTaskInput, type LimitScope, type TaskCategory, type TaskReset, WEEKLY_RESET_DAY } from "@miku/shared";
import { taskPeriod } from "../calc/checklist";
import { nextUtcMidnight, nextWeek, utcDay, weekStarting } from "../calc/utcDays";
import { db } from "../db";
import { CHECKLIST_PATCH, PRESET_TASKS, type TaskFigure } from "../gameFigures/checklist";
import type { ChecklistTask } from "../generated/prisma/client";
import { HttpError } from "../http";
import { listCharacters, ownCharacter } from "./characters";

// A task as the checklist shows it, preset or the owner's own.
export interface TaskView {
  id: string; // a preset's id, or "custom-<id>"
  name: string;
  category: TaskCategory;
  reset: TaskReset;
  weekday: number | null; // a weekly task's reset day (0 Sunday … 6 Saturday)
  level: number | null;
  limit: { scope: LimitScope; count: number } | null;
  custom: { worlds: number[] } | null; // the worlds it shows on, by ID in order; null for a preset
  resetsAt: Date | null; // when its current period ends; null for a one-off
}

export interface ChecklistCharacter {
  id: number;
  name: string;
  job: string;
  level: number;
  avatar: string | null;
  plan: string[]; // its tasks, in the tasks' order
  done: string[]; // its tasks done this period
}

// Who has used a limited task this period, among the characters sharing its limit (for a
// per-account task, on every world).
export interface LimitUse {
  task: string;
  users: string[]; // character names, in the order they ticked it
}

export interface ChecklistBoard {
  patch: string;
  daily: { day: string; resetsAt: Date };
  weekly: { week: string; resetsAt: Date }; // the game's weekly reset (Thursday)
  tasks: TaskView[]; // presets first, then the owner's own, for this world
  characters: ChecklistCharacter[]; // in tab order
  limits: LimitUse[]; // one per limited task
}

const customId = (id: number) => `custom-${id}`;
const period = taskPeriod;

// A task's worlds are saved as their IDs in order, joined by commas ("45,70,900").
const worldsOf = (t: Pick<ChecklistTask, "worlds">) => t.worlds.split(",").map(Number);

const fromCustom = (t: ChecklistTask, now: Date): TaskView => ({
  id: customId(t.id),
  name: t.name,
  category: t.category as TaskCategory,
  reset: t.reset as TaskReset,
  weekday: t.weekday,
  level: null,
  limit: t.limitScope === "character" ? null : { scope: t.limitScope as LimitScope, count: t.limitCount },
  custom: { worlds: worldsOf(t) },
  resetsAt: period({ reset: t.reset as TaskReset, weekday: t.weekday }, now).resetsAt,
});
const fromPreset = (t: TaskFigure, now: Date): TaskView => ({ ...t, custom: null, resetsAt: period(t, now).resetsAt });

// Every task that shows on a world: the presets, and the owner's own tasks for that world.
async function tasksFor(ownerId: string, worldId: number, now: Date): Promise<TaskView[]> {
  // Stryker disable next-line ObjectLiteral: SQLite already returns them in the order they were made; the order is spelled out anyway
  const own = await db().checklistTask.findMany({ where: { ownerId }, orderBy: { id: "asc" } });
  const custom = own.filter((t) => worldsOf(t).includes(worldId));
  return [...PRESET_TASKS.map((t) => fromPreset(t, now)), ...custom.map((t) => fromCustom(t, now))];
}

// The characters sharing a limit with a character on `worldId`: that world's, or all the owner's.
type Owned = { id: number; name: string; worldId: number };
const sharing = (all: Owned[], worldId: number, scope: LimitScope) => all.filter((c) => scope === "account" || c.worldId === worldId);

export async function checklistBoard(ownerId: string, worldId: number): Promise<ChecklistBoard> {
  const now = new Date();
  const tasks = await tasksFor(ownerId, worldId, now);
  const { characters } = await listCharacters(ownerId, worldId);
  const ids = characters.map((c) => c.id);
  const all = await db().character.findMany({ where: { ownerId }, select: { id: true, name: true, worldId: true } });
  // Stryker disable next-line ObjectLiteral: only narrows what's read; each plan is matched to its character by id below
  const plans = await db().checklistPlan.findMany({ where: { characterId: { in: ids } } });
  // Only the current periods' ticks, of every character the owner has (per-account limits span
  // every world); a tick counts if it's in its own task's current period.
  const current = new Map(tasks.map((t) => [t.id, period(t, now).period]));
  // Stryker disable next-line ObjectLiteral: only narrows what's read (each tick is matched to its task's current period and to the owner's characters below); the order is SQLite's own
  const ticks = await db().checklistTick.findMany({ where: { characterId: { in: all.map((c) => c.id) }, period: { in: [...new Set(current.values())] } }, orderBy: { id: "asc" } });
  const live = ticks.filter((t) => current.get(t.task) === t.period);
  const order = (taskIds: string[]) => tasks.filter((t) => taskIds.includes(t.id)).map((t) => t.id);
  const users = (t: TaskView) => {
    const chars = sharing(all, worldId, t.limit!.scope);
    return live.filter((x) => x.task === t.id && chars.some((c) => c.id === x.characterId)).map((x) => chars.find((c) => c.id === x.characterId)!.name);
  };
  const week = weekStarting(now, WEEKLY_RESET_DAY);
  return {
    patch: CHECKLIST_PATCH,
    daily: { day: utcDay(now), resetsAt: nextUtcMidnight(now) },
    weekly: { week, resetsAt: nextWeek(week) },
    tasks,
    characters: characters.map((c) => ({
      id: c.id,
      name: c.name,
      job: c.job,
      level: c.level,
      avatar: c.avatar,
      plan: order(plans.filter((p) => p.characterId === c.id).map((p) => p.task)),
      done: order(live.filter((t) => t.characterId === c.id).map((t) => t.task)),
    })),
    limits: tasks.filter((t) => t.limit).map((t) => ({ task: t.id, users: users(t) })),
  };
}

// Replaces a character's checklist plan. Every task must show on its world. This period's ticks
// of tasks taken out go too; earlier periods' stay.
export async function saveChecklistPlan(ownerId: string, characterId: number, taskIds: string[]) {
  const c = await ownCharacter(ownerId, characterId);
  const now = new Date();
  const tasks = await tasksFor(ownerId, c.worldId, now);
  const unknown = taskIds.find((id) => !tasks.some((t) => t.id === id));
  if (unknown) throw new HttpError(400, `Unknown task "${unknown}"`);
  const removed = tasks.filter((t) => !taskIds.includes(t.id));
  await db().$transaction([
    db().checklistPlan.deleteMany({ where: { characterId } }),
    db().checklistPlan.createMany({ data: taskIds.map((task) => ({ characterId, task })) }),
    ...removed.map((t) => db().checklistTick.deleteMany({ where: { characterId, task: t.id, period: period(t, now).period } })),
  ]);
}

// Ticks a planned task as done this period, or unticks it. A limited task can't be ticked once
// its limit is used up by other characters this period. Checked and saved in one transaction.
export async function setTaskDone(ownerId: string, characterId: number, taskId: string, done: boolean) {
  const c = await ownCharacter(ownerId, characterId);
  const now = new Date();
  const task = (await tasksFor(ownerId, c.worldId, now)).find((t) => t.id === taskId);
  if (!task) throw new HttpError(404, "Not found");
  const key = { characterId, task: taskId, period: period(task, now).period };
  await db().$transaction(async (tx) => {
    const planned = await tx.checklistPlan.findUnique({ where: { characterId_task: { characterId, task: taskId } } });
    if (!planned) throw new HttpError(409, `${task.name} isn't in ${c.name}'s plan. Add it to the plan first.`);
    if (!done) {
      await tx.checklistTick.deleteMany({ where: key });
      return;
    }
    if (task.limit) {
      const all = await tx.character.findMany({ where: { ownerId }, select: { id: true, name: true, worldId: true } });
      const chars = sharing(all, c.worldId, task.limit.scope);
      // Stryker disable next-line ObjectLiteral: the order (oldest first, for the message) is SQLite's own
      const others = await tx.checklistTick.findMany({ where: { task: taskId, period: key.period, characterId: { in: chars.map((x) => x.id).filter((id) => id !== characterId) } }, orderBy: { id: "asc" } });
      if (others.length >= task.limit.count) {
        const names = others.map((t) => chars.find((x) => x.id === t.characterId)!.name).join(" and ");
        throw new HttpError(409, `${task.name} is already done by ${names} (${task.limit.count} per ${task.limit.scope}).`);
      }
    }
    await tx.checklistTick.upsert({ where: { characterId_task_period: key }, create: { ...key, doneAt: now }, update: {} });
  });
}

// The owner's own tasks: made, changed, deleted. Deleting one takes it off every character, with
// its ticks.
// (The input rules already allow a day only on a weekly task.)
const fields = (t: CustomTaskInput) => ({ ...t, worlds: [...t.worlds].sort((a, b) => a - b).join(","), limitCount: t.limitScope === "character" ? 1 : t.limitCount });

async function ownTask(ownerId: string, id: number) {
  const t = await db().checklistTask.findFirst({ where: { id, ownerId } });
  if (!t) throw new HttpError(404, "Not found");
  return t;
}

export async function createCustomTask(ownerId: string, input: CustomTaskInput): Promise<TaskView> {
  return fromCustom(await db().checklistTask.create({ data: { ownerId, ...fields(input) } }), new Date());
}

// Changing a task's worlds takes it off the characters of the worlds it leaves, with their ticks:
// left there, they could still use up a per-account limit, with no way to untick them.
export async function updateCustomTask(ownerId: string, id: number, input: CustomTaskInput): Promise<TaskView> {
  await ownTask(ownerId, id);
  const task = customId(id);
  const gone = (await db().character.findMany({ where: { ownerId, worldId: { notIn: input.worlds } }, select: { id: true } })).map((c) => c.id);
  const [updated] = await db().$transaction([
    db().checklistTask.update({ where: { id }, data: fields(input) }),
    db().checklistPlan.deleteMany({ where: { task, characterId: { in: gone } } }),
    db().checklistTick.deleteMany({ where: { task, characterId: { in: gone } } }),
  ]);
  return fromCustom(updated, new Date());
}

export async function deleteCustomTask(ownerId: string, id: number) {
  await ownTask(ownerId, id);
  // Only the owner's characters can have their own task (it shows only on the owner's checklists).
  const task = customId(id);
  await db().$transaction([
    db().checklistPlan.deleteMany({ where: { task } }),
    db().checklistTick.deleteMany({ where: { task } }),
    db().checklistTask.delete({ where: { id } }),
  ]);
}
