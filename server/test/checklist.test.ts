import { describe, expect, it, vi } from "vitest";
import { db } from "../src/db";
import { PRESET_TASKS } from "../src/gameFigures/checklist";
import { SOLE_OWNER } from "../src/owner";
import { api, ok } from "./api";
import { NOW, useDbTestSetup } from "./helpers";

useDbTestSetup();

// NOW is Tue 20 Oct 2026, 19:00 UTC: today's dailies reset at 00:00 UTC on the 21st; the weekly
// ones started Thu 15 Oct and reset Thu 22 Oct.
let made = 0;
async function character(name = `Char${++made}`, { worldId = 45, ownerId = SOLE_OWNER, sortOrder = made } = {}) {
  const c = await db().character.create({
    data: { ownerId, worldId, name, nameKey: name.toLowerCase(), job: "Kanna", level: 270, exp: 0n, worldRank: 1, sortOrder, addedAt: NOW, checkedAt: NOW },
  });
  return c.id;
}
const plan = (id: number, tasks: string[]) => api().put(`/api/checklist/${id}/plan`).send({ tasks });
const tick = (id: number, task: string, done = true) => api().put(`/api/checklist/${id}/ticks/${task}`).send({ done });
const board = async (world = 45) => (await ok(api().get(`/api/checklist?world=${world}`))).body;
const at = (iso: string) => vi.setSystemTime(new Date(iso));
const TASK = { name: "Event check-in", category: "other", reset: "daily", weekday: null, worlds: "both", limitScope: "character", limitCount: 1 };
const custom = async (over: Record<string, unknown> = {}) => (await ok(api().post("/api/checklist/tasks").send({ ...TASK, ...over }))).body;

describe("the presets", () => {
  it("have unique ids, and every limited one shares among 1–2 characters per world or account", () => {
    expect(new Set(PRESET_TASKS.map((t) => t.id)).size).toBe(PRESET_TASKS.length);
    expect(PRESET_TASKS.filter((t) => t.limit).map((t) => `${t.name}: ${t.limit!.count} per ${t.limit!.scope}`)).toEqual([
      "Monster Park: 2 per world",
      "Ursus: 1 per account",
      "Erda's Request: 1 per account",
      "Epic Dungeon: 2 per account",
      "Monster Park Extreme: 2 per world",
      "Legion Weekly Dragon: 1 per world",
    ]);
  });

  it("6 Arcane and 8 Sacred dailies, 6 Arcane weeklies, every weekly on Thursday", () => {
    const of = (reset: string, category: string) => PRESET_TASKS.filter((t) => t.reset === reset && t.category === category).length;
    expect([of("daily", "arcane"), of("daily", "sacred"), of("weekly", "arcane"), of("weekly", "sacred")]).toEqual([6, 8, 6, 0]);
    expect(PRESET_TASKS.filter((t) => t.reset === "weekly").every((t) => t.weekday === 4)).toBe(true);
    expect(PRESET_TASKS.filter((t) => t.reset === "daily").every((t) => t.weekday === null)).toBe(true);
  });
});

describe("GET /api/checklist", () => {
  it("today's and this week's resets, every preset with its period's end, and the world's characters", async () => {
    const a = await character("First", { sortOrder: 0 });
    await character("Elsewhere", { worldId: 70 });
    const b = await board();
    expect(b.daily).toEqual({ day: "2026-10-20", resetsAt: "2026-10-21T00:00:00.000Z" });
    expect(b.weekly).toEqual({ week: "2026-10-15", resetsAt: "2026-10-22T00:00:00.000Z" });
    expect(b.patch).toBe("v.271");
    expect(b.tasks).toHaveLength(PRESET_TASKS.length);
    expect(b.tasks.find((t: { id: string }) => t.id === "cernium")).toEqual({ id: "cernium", name: "Cernium", category: "sacred", reset: "daily", weekday: null, level: 260, limit: null, custom: null, resetsAt: "2026-10-21T00:00:00.000Z" });
    expect(b.tasks.find((t: { id: string }) => t.id === "ursus").limit).toEqual({ scope: "account", count: 1 });
    expect(b.tasks.find((t: { id: string }) => t.id === "guild-culvert").resetsAt).toBe("2026-10-22T00:00:00.000Z");
    expect(b.characters).toEqual([{ id: a, name: "First", job: "Kanna", level: 270, avatar: null, plan: [], done: [] }]);
    expect(b.limits.map((l: { task: string }) => l.task)).toEqual(["monster-park", "ursus", "erdas-request", "epic-dungeon", "monster-park-extreme", "legion-dragon"]);
    expect(b.limits.every((l: { users: string[] }) => l.users.length === 0)).toBe(true);
  });

  it("refuses an unknown world", async () => {
    expect((await api().get("/api/checklist?world=1")).status).toBe(400);
  });
});

describe("planning and ticking", () => {
  it("a plan comes back in the tasks' order; ticks show as done this period", async () => {
    const id = await character();
    await ok(plan(id, ["ursus", "cernium", "erda-spectrum"]));
    await ok(tick(id, "cernium"));
    const c = (await board()).characters[0];
    expect(c.plan).toEqual(["cernium", "ursus", "erda-spectrum"]);
    expect(c.done).toEqual(["cernium"]);
    await ok(tick(id, "ursus"));
    await ok(tick(id, "cernium", false));
    expect((await board()).characters[0].done).toEqual(["ursus"]); // only Cernium's tick goes
    await ok(tick(id, "cernium", false)); // unticking twice is fine
  });

  it("only planned tasks can be ticked; an unknown task is not found", async () => {
    const id = await character("Remy");
    const res = await tick(id, "cernium");
    expect([res.status, res.body.error]).toEqual([409, "Cernium isn't in Remy's plan. Add it to the plan first."]);
    const unknown = await tick(id, "nobody");
    expect([unknown.status, unknown.body.error]).toEqual([404, "Not found"]);
    expect(await db().checklistTick.count()).toBe(0);
  });

  it("refuses an unknown task in a plan, or the same task twice, and changes nothing", async () => {
    const id = await character();
    await ok(plan(id, ["cernium"]));
    const res = await plan(id, ["ursus", "nobody"]);
    expect([res.status, res.body.error]).toEqual([400, 'Unknown task "nobody"']);
    expect((await plan(id, ["ursus", "ursus"])).status).toBe(400);
    expect((await plan(id, ["Not An Id!"])).status).toBe(400);
    expect((await board()).characters[0].plan).toEqual(["cernium"]);
  });

  it("another owner's character, or one that doesn't exist, is not found", async () => {
    const theirs = await character("Theirs", { ownerId: "someone-else" });
    for (const res of [await plan(theirs, []), await tick(theirs, "cernium"), await plan(99_999, [])]) expect([res.status, res.body.error]).toEqual([404, "Not found"]);
  });

  it("each character has its own plan and ticks; each limited task its own users", async () => {
    const a = await character("Aa", { sortOrder: 0 });
    const b = await character("Bb", { sortOrder: 1 });
    await ok(plan(a, ["cernium", "ursus"]));
    await ok(plan(b, ["odium", "monster-park"]));
    await ok(tick(a, "ursus"));
    await ok(tick(b, "monster-park"));
    await ok(tick(b, "odium"));
    const bd = await board();
    expect(bd.characters.map((c: { plan: string[]; done: string[] }) => [c.plan, c.done])).toEqual([
      [["cernium", "ursus"], ["ursus"]],
      [["odium", "monster-park"], ["odium", "monster-park"]],
    ]);
    const users = (task: string) => bd.limits.find((l: { task: string }) => l.task === task).users;
    expect([users("ursus"), users("monster-park"), users("epic-dungeon")]).toEqual([["Aa"], ["Bb"], []]);
  });

  it("dailies reset at 00:00 UTC, weeklies at Thursday 00:00 UTC; old ticks are kept", async () => {
    const id = await character();
    await ok(plan(id, ["cernium", "erda-spectrum"]));
    await ok(tick(id, "cernium"));
    await ok(tick(id, "erda-spectrum"));
    at("2026-10-20T23:59:59.999Z");
    expect((await board()).characters[0].done).toEqual(["cernium", "erda-spectrum"]);
    at("2026-10-21T00:00:00.000Z");
    expect((await board()).characters[0].done).toEqual(["erda-spectrum"]);
    at("2026-10-22T00:00:00.000Z");
    const b = await board();
    expect([b.characters[0].done, b.weekly.week]).toEqual([[], "2026-10-22"]);
    expect(await db().checklistTick.findMany({ select: { task: true, period: true }, orderBy: { task: "asc" } })).toEqual([
      { task: "cernium", period: "2026-10-20" },
      { task: "erda-spectrum", period: "week-2026-10-15" },
    ]);
  });

  it("taking a task out of the plan removes this period's tick only", async () => {
    const id = await character();
    await ok(plan(id, ["cernium", "ursus"]));
    await ok(tick(id, "cernium"));
    at("2026-10-21T08:00:00Z");
    await ok(tick(id, "cernium"));
    await ok(tick(id, "ursus"));
    await ok(plan(id, ["ursus"]));
    expect(await db().checklistTick.findMany({ select: { task: true, period: true }, orderBy: { period: "asc" } })).toEqual([
      { task: "cernium", period: "2026-10-20" },
      { task: "ursus", period: "2026-10-21" },
    ]);
  });

  it("deleting a character deletes its plan and ticks", async () => {
    const id = await character();
    await ok(plan(id, ["cernium"]));
    await ok(tick(id, "cernium"));
    await ok(api().delete(`/api/characters/${id}`));
    expect([await db().checklistPlan.count(), await db().checklistTick.count()]).toEqual([0, 0]);
  });
});

describe("limits", () => {
  it("Monster Park: 2 characters per world a day; the third is refused, naming who did it", async () => {
    const [a, b, c] = [await character("Aa"), await character("Bb"), await character("Cc")];
    const other = await character("Hyp", { worldId: 70 });
    for (const id of [a, b, c, other]) await ok(plan(id, ["monster-park"]));
    await ok(tick(a, "monster-park"));
    await ok(tick(b, "monster-park"));
    await ok(tick(b, "monster-park")); // the same character again is fine
    const res = await tick(c, "monster-park");
    expect([res.status, res.body.error]).toEqual([409, "Monster Park is already done by Aa and Bb (2 per world)."]);
    await ok(tick(other, "monster-park")); // another world has its own limit
    expect((await board()).limits.find((l: { task: string }) => l.task === "monster-park").users).toEqual(["Aa", "Bb"]);
    await ok(tick(a, "monster-park", false)); // a place frees up
    await ok(tick(c, "monster-park"));
    at("2026-10-21T00:00:00Z"); // and a new day starts empty
    expect((await board()).limits.find((l: { task: string }) => l.task === "monster-park").users).toEqual([]);
  });

  it("Ursus: once per account, across both worlds", async () => {
    const k = await character("Kro");
    const h = await character("Hyp", { worldId: 70 });
    await ok(plan(k, ["ursus"]));
    await ok(plan(h, ["ursus"]));
    await ok(tick(h, "ursus"));
    const res = await tick(k, "ursus");
    expect([res.status, res.body.error]).toEqual([409, "Ursus is already done by Hyp (1 per account)."]);
    expect((await board(45)).limits.find((l: { task: string }) => l.task === "ursus").users).toEqual(["Hyp"]);
  });

  it("another owner's ticks never count toward a limit", async () => {
    const mine = await character("Mine");
    const theirs = await character("Theirs", { ownerId: "someone-else" });
    await db().checklistPlan.create({ data: { characterId: theirs, task: "ursus" } });
    await db().checklistTick.create({ data: { characterId: theirs, task: "ursus", period: "2026-10-20", doneAt: NOW } });
    await ok(plan(mine, ["ursus"]));
    await ok(tick(mine, "ursus"));
    expect((await board()).limits.find((l: { task: string }) => l.task === "ursus").users).toEqual(["Mine"]);
  });
});

describe("your own tasks", () => {
  it("are made, offered on their worlds, planned and ticked like presets", async () => {
    const id = await character();
    const t = await custom({ name: "  Mondays  ", reset: "weekly", weekday: 1, worlds: "45", limitScope: "account", limitCount: 2 });
    expect(t).toEqual({ id: expect.stringMatching(/^custom-\d+$/), name: "Mondays", category: "other", reset: "weekly", weekday: 1, level: null, limit: { scope: "account", count: 2 }, custom: { worlds: "45" }, resetsAt: "2026-10-26T00:00:00.000Z" });
    expect((await board(45)).tasks.at(-1).id).toBe(t.id);
    expect((await board(70)).tasks.some((x: { id: string }) => x.id === t.id)).toBe(false);
    await ok(plan(id, [t.id]));
    await ok(tick(id, t.id));
    expect((await board()).characters[0].done).toEqual([t.id]);
    // its week runs Monday to Monday: still done on Sunday, not on Monday
    at("2026-10-25T23:00:00Z");
    expect((await board()).characters[0].done).toEqual([t.id]);
    at("2026-10-26T00:00:00Z");
    expect((await board()).characters[0].done).toEqual([]);
  });

  it("a one-off stays done until unticked", async () => {
    const id = await character();
    const t = await custom({ reset: "none" });
    expect(t.resetsAt).toBeNull();
    await ok(plan(id, [t.id]));
    await ok(tick(id, t.id));
    at("2027-03-01T00:00:00Z");
    expect((await board()).characters[0].done).toEqual([t.id]);
  });

  it("a per-character task stores no count; a non-weekly one no day", async () => {
    const t = await custom({ limitScope: "character", limitCount: 9 });
    expect(t.limit).toBeNull();
    expect((await db().checklistTask.findFirst())!.limitCount).toBe(1);
  });

  it("can be changed, and deleted (off every character, with its ticks)", async () => {
    const id = await character();
    const t = await custom();
    await ok(plan(id, ["cernium", t.id]));
    await ok(tick(id, t.id));
    const n = Number(t.id.split("-")[1]);
    const changed = (await ok(api().put(`/api/checklist/tasks/${n}`).send({ ...TASK, name: "Renamed", worlds: "70" }))).body;
    expect([changed.name, changed.custom]).toEqual(["Renamed", { worlds: "70" }]);
    // now on Hyperion only: it's no longer on this Kronos character's checklist
    expect((await board()).characters[0].plan).toEqual(["cernium"]);
    await ok(tick(id, "cernium"));
    expect((await api().delete(`/api/checklist/tasks/${n}`)).status).toBe(204);
    // its plan entry and ticks go; the others stay
    expect(await db().checklistPlan.findMany({ select: { task: true } })).toEqual([{ task: "cernium" }]);
    expect(await db().checklistTick.findMany({ select: { task: true } })).toEqual([{ task: "cernium" }]);
    expect(await db().checklistTask.count()).toBe(0);
  });

  it("moving a task to one world takes it off the other world's characters, with their ticks (which could block a per-account limit)", async () => {
    const k = await character("Kro");
    const h = await character("Hyp", { worldId: 70 });
    const t = await custom({ worlds: "both", limitScope: "account", limitCount: 1 });
    await ok(plan(k, [t.id]));
    await ok(plan(h, [t.id]));
    await ok(tick(h, t.id));
    expect((await tick(k, t.id)).status).toBe(409); // Hyp used it
    await ok(plan(h, [t.id, "cernium"]));
    await ok(tick(h, "cernium")); // another task's plan and tick on Hyperion stay
    await ok(api().put(`/api/checklist/tasks/${t.id.split("-")[1]}`).send({ ...TASK, worlds: "45", limitScope: "account", limitCount: 1 }));
    expect(await db().checklistPlan.findMany({ select: { characterId: true, task: true }, orderBy: { characterId: "asc" } })).toEqual([{ characterId: k, task: t.id }, { characterId: h, task: "cernium" }]);
    expect(await db().checklistTick.findMany({ select: { task: true } })).toEqual([{ task: "cernium" }]);
    await ok(tick(k, t.id)); // no longer blocked
  });

  it("moving a task to one world keeps that world's ticks", async () => {
    const k = await character("Kro");
    const h = await character("Hyp", { worldId: 70 });
    const t = await custom();
    for (const id of [k, h]) {
      await ok(plan(id, [t.id]));
      await ok(tick(id, t.id));
    }
    await ok(api().put(`/api/checklist/tasks/${t.id.split("-")[1]}`).send({ ...TASK, worlds: "45" }));
    expect(await db().checklistTick.findMany({ select: { characterId: true } })).toEqual([{ characterId: k }]);
    expect((await board(45)).characters[0].done).toEqual([t.id]);
  });

  it("changing a daily task to weekly doesn't turn today's tick into this week's (Fri 23 Oct, weekly from Friday)", async () => {
    at("2026-10-23T12:00:00Z");
    const id = await character();
    const t = await custom({ reset: "daily" });
    await ok(plan(id, [t.id]));
    await ok(tick(id, t.id));
    await ok(api().put(`/api/checklist/tasks/${t.id.split("-")[1]}`).send({ ...TASK, reset: "weekly", weekday: 5 }));
    expect((await board()).characters[0].done).toEqual([]);
  });

  it("another owner's task, or one that doesn't exist, is not found", async () => {
    const theirs = await db().checklistTask.create({ data: { ownerId: "someone-else", ...TASK } });
    expect((await api().put(`/api/checklist/tasks/${theirs.id}`).send(TASK)).status).toBe(404);
    expect((await api().delete(`/api/checklist/tasks/${theirs.id}`)).status).toBe(404);
    const missing = await api().delete("/api/checklist/tasks/99999");
    expect([missing.status, missing.body.error]).toEqual([404, "Not found"]);
    expect((await board()).tasks.some((t: { id: string }) => t.id === `custom-${theirs.id}`)).toBe(false);
  });

  it.each([
    [{ name: "" }, "Give the task a name"],
    [{ name: "   " }, "Give the task a name"],
    [{ reset: "weekly", weekday: null }, "A weekly task needs its reset day, and only a weekly one has one"],
    [{ reset: "daily", weekday: 3 }, "A weekly task needs its reset day, and only a weekly one has one"],
  ])("refuses %j", async (over, message) => {
    const res = await api().post("/api/checklist/tasks").send({ ...TASK, ...over });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain(message);
  });

  it("refuses bad fields", async () => {
    for (const over of [{ name: "x".repeat(41) }, { category: "boss" }, { reset: "monthly" }, { weekday: 7, reset: "weekly" }, { worlds: "1" }, { limitScope: "guild" }, { limitCount: 0 }, { limitCount: 51 }, { extra: 1 }]) {
      expect((await api().post("/api/checklist/tasks").send({ ...TASK, ...over })).status).toBe(400);
    }
  });
});
