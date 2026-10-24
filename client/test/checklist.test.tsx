import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChecklistBoard, ChecklistCharacter, TaskView } from "../src/api/types";
import { App } from "../src/App";
import { byCategory, customNumber, doneCount, limitState, limitText, offDay, resetText, taskForm, togglePlanned, withReset, withTaskDone } from "../src/lib/checklist";
import { BASE_ROUTES, fakeServer, renderWithApp } from "./server";

const UTC = process.env.TZ === "UTC";
const DAILY = "2026-10-21T00:00:00.000Z";
const WEEKLY = "2026-10-22T00:00:00.000Z";
const task = (id: string, name: string, extra: Partial<TaskView> = {}): TaskView => ({ id, name, category: "other", reset: "daily", weekday: null, level: null, limit: null, custom: null, resetsAt: new Date(DAILY), ...extra });

const VJ = task("vanishing-journey", "Vanishing Journey", { category: "arcane", level: 200 });
const CERNIUM = task("cernium", "Cernium", { category: "sacred", level: 260 });
const TALLAHART = task("tallahart", "Tallahart", { category: "sacred", level: 290 });
const MP = task("monster-park", "Monster Park", { level: 105, limit: { scope: "world", count: 2 } });
const URSUS = task("ursus", "Ursus", { level: 100, limit: { scope: "account", count: 1 } });
const SPECTRUM = task("erda-spectrum", "Erda Spectrum", { category: "arcane", reset: "weekly", weekday: 4, level: 200, resetsAt: new Date(WEEKLY) });
const EPIC = task("epic-dungeon", "Epic Dungeon", { reset: "weekly", weekday: 4, level: 260, limit: { scope: "account", count: 2 }, resetsAt: new Date(WEEKLY) });
const MONDAY = task("custom-7", "Guild check", { reset: "weekly", weekday: 1, custom: { worlds: "both" }, resetsAt: new Date("2026-10-26T00:00:00.000Z") });
const STORY = task("custom-8", "Finish Geardock story", { reset: "none", custom: { worlds: "45" }, resetsAt: null });
const TASKS = [VJ, CERNIUM, TALLAHART, MP, URSUS, SPECTRUM, EPIC, MONDAY, STORY];

const character = (id: number, name: string, plan: string[], done: string[] = [], level = 278): ChecklistCharacter => ({ id, name, job: "Ren", level, avatar: null, plan, done });
// Remy: Vanishing Journey, Cernium and Tallahart done-ish, Ursus done; Meow: Monster Park and Ursus planned.
const REMY = character(1, "Remy", ["vanishing-journey", "cernium", "tallahart", "monster-park", "ursus", "erda-spectrum", "epic-dungeon", "custom-7", "custom-8"], ["cernium", "ursus", "erda-spectrum"]);
const MEOW = character(2, "Meow", ["monster-park", "ursus", "cernium"], ["monster-park"], 275);

function board(characters: ChecklistCharacter[], limits = [{ task: "monster-park", users: ["Meow"] }, { task: "ursus", users: ["Remy"] }, { task: "epic-dungeon", users: [] }]): ChecklistBoard {
  return { patch: "v.271", daily: { day: "2026-10-20", resetsAt: new Date(DAILY) }, weekly: { week: "2026-10-15", resetsAt: new Date(WEEKLY) }, tasks: TASKS, characters, limits };
}

describe("the checklist's logic", () => {
  it("byCategory: one reset's tasks, Arcane then Sacred then Other, empty categories left out", () => {
    expect(byCategory(TASKS, "daily").map((g) => [g.category, g.tasks.map((t) => t.id)])).toEqual([
      ["arcane", ["vanishing-journey"]],
      ["sacred", ["cernium", "tallahart"]],
      ["other", ["monster-park", "ursus"]],
    ]);
    expect(byCategory(TASKS, "weekly").map((g) => g.category)).toEqual(["arcane", "other"]);
    expect(byCategory(TASKS, "none").map((g) => g.tasks.map((t) => t.id))).toEqual([["custom-8"]]);
    expect(byCategory([], "daily")).toEqual([]);
  });

  it("doneCount: a character's planned tasks of one reset, and how many are done", () => {
    expect(doneCount(REMY, TASKS, "daily")).toEqual([2, 5]);
    expect(doneCount(REMY, TASKS, "weekly")).toEqual([1, 3]);
    expect(doneCount(REMY, TASKS, "none")).toEqual([0, 1]);
    expect(doneCount(MEOW, TASKS, "weekly")).toEqual([0, 0]);
  });

  it("limitState: who used a limit; blocked only when others used it all up", () => {
    const b = board([REMY, MEOW]);
    expect(limitState(b, MEOW, URSUS)).toEqual({ users: ["Remy"], blocked: true }); // once per account, Remy did it
    expect(limitState(b, REMY, URSUS)).toEqual({ users: ["Remy"], blocked: false }); // Remy's own tick can be undone
    expect(limitState(b, REMY, MP)).toEqual({ users: ["Meow"], blocked: false }); // 1 of 2 used
    const full = board([REMY, MEOW], [{ task: "monster-park", users: ["Meow", "Saku"] }]);
    expect(limitState(full, REMY, MP).blocked).toBe(true);
    expect(limitState(b, REMY, CERNIUM)).toEqual({ users: [], blocked: false }); // no limit
    expect(limitState(b, REMY, EPIC)).toEqual({ users: [], blocked: false });
  });

  it("limitText and resetText", () => {
    expect([limitText({ scope: "account", count: 1 }), limitText({ scope: "world", count: 2 })]).toEqual(["once per account", "2 per world"]);
    expect([resetText(CERNIUM), resetText(SPECTRUM), resetText(MONDAY), resetText(STORY)]).toEqual(["Daily", "Weekly (Thursday)", "Weekly (Monday)", "One-off"]);
    expect([0, 1, 2, 3, 4, 5, 6].map((d) => resetText({ reset: "weekly", weekday: d }))).toEqual(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d) => `Weekly (${d})`));
  });

  it("togglePlanned adds at the end or takes out", () => {
    expect(togglePlanned(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(togglePlanned(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("withTaskDone ticks or unticks one task of one character, leaving the rest", () => {
    const b = board([REMY, MEOW]);
    const t = withTaskDone(b, 2, "ursus", true);
    expect(t.characters.map((c) => c.done)).toEqual([["cernium", "ursus", "erda-spectrum"], ["monster-park", "ursus"]]);
    expect(withTaskDone(b, 1, "cernium", false).characters[0]!.done).toEqual(["ursus", "erda-spectrum"]);
    expect(withTaskDone(b, 1, "cernium", true).characters[0]!.done).toEqual(["ursus", "erda-spectrum", "cernium"]); // never twice
    expect(b.characters[0]!.done).toEqual(["cernium", "ursus", "erda-spectrum"]); // a new board
    expect({ ...t, characters: [] }).toEqual({ ...b, characters: [] });
  });

  it("taskForm: a new task's defaults, or a custom task's values", () => {
    expect(taskForm()).toEqual({ name: "", category: "other", reset: "daily", weekday: null, worlds: "both", limitScope: "character", limitCount: 1 });
    expect(taskForm(MONDAY)).toEqual({ name: "Guild check", category: "other", reset: "weekly", weekday: 1, worlds: "both", limitScope: "character", limitCount: 1 });
    expect(taskForm({ ...STORY, limit: { scope: "world", count: 3 } })).toEqual({ name: "Finish Geardock story", category: "other", reset: "none", weekday: null, worlds: "45", limitScope: "world", limitCount: 3 });
    expect(taskForm(CERNIUM).name).toBe(""); // a preset isn't editable: a fresh form
  });

  it("withReset: weekly gets a day (Thursday, unless one was set); the others none", () => {
    const f = taskForm();
    expect(withReset(f, "weekly").weekday).toBe(4);
    expect(withReset({ ...f, reset: "weekly", weekday: 1 }, "weekly").weekday).toBe(1);
    expect(withReset({ ...f, reset: "weekly", weekday: 1 }, "daily")).toMatchObject({ reset: "daily", weekday: null });
    expect(withReset(f, "none")).toMatchObject({ reset: "none", weekday: null });
  });

  it("offDay: a weekly task off the game's Thursday says its day; others nothing", () => {
    expect([offDay(MONDAY), offDay(SPECTRUM), offDay(CERNIUM), offDay(STORY)]).toEqual(["Mon", null, null, null]);
    expect(offDay({ reset: "weekly", weekday: 0 })).toBe("Sun");
    expect(offDay({ reset: "weekly", weekday: 6 })).toBe("Sat");
  });

  it("customNumber", () => {
    expect([customNumber("custom-7"), customNumber("custom-123")]).toEqual([7, 123]);
  });
});

// Tue 20 Oct 2026, 19:00 UTC: the daily reset is 5 hours away, the weekly 1 day 5 hours.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(Date.UTC(2026, 9, 20, 19, 0)));
});
afterEach(() => vi.useRealTimers());

function show(b: unknown = board([REMY, MEOW]), routes: Record<string, unknown> = {}) {
  const ticks = Object.fromEntries(TASKS.map((t) => [`PUT /checklist/:id/ticks/${t.id}`, undefined]));
  const s = fakeServer({ ...BASE_ROUTES, "GET /checklist": b, "PUT /checklist/:id/plan": undefined, "POST /checklist/tasks": {}, "PUT /checklist/tasks/:id": {}, "DELETE /checklist/tasks/:id": undefined, ...ticks, ...routes });
  renderWithApp(<App />, "/checklist");
  return s;
}
const column = async (name: string) => within(await screen.findByRole("region", { name }));
const loads = (s: ReturnType<typeof fakeServer>) => s.calls.filter((c) => c.method === "GET" && c.path.startsWith("/checklist")).length;

describe("the Checklist tab", () => {
  it("shows the first character's dailies and weeklies by category, and the side panel", async () => {
    show();
    const daily = await column("Daily");
    expect(daily.getByText("2 / 5")).toBeTruthy();
    expect(daily.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Arcane symbols", "Sacred symbols", "Other"]);
    expect((daily.getByRole("checkbox", { name: "Cernium done" }) as HTMLInputElement).checked).toBe(true);
    expect(daily.getByText("260+")).toBeTruthy();
    expect(daily.getByText("2 per world")).toBeTruthy();
    const weekly = await column("Weekly");
    expect(weekly.getByText("1 / 4")).toBeTruthy();
    expect(weekly.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Arcane symbols", "Other", "One-off · Other"]);
    expect(weekly.getByText("resets Mon")).toBeTruthy();
    expect(weekly.getAllByText("custom")).toHaveLength(2);
    const side = within(screen.getByRole("complementary", { name: "Kronos" }));
    expect(side.getByText(/Daily reset in/).textContent).toContain("Daily reset in 5h 0m");
    expect(side.getByText(/Weekly reset in/).textContent).toContain("Weekly reset in 1d 5h");
    expect(side.getAllByText(/your time/).map((x) => x.textContent)).toEqual(UTC ? ["Wed 12:00 AM your time", "Thu 12:00 AM your time"] : ["Tue 5:00 PM your time", "Wed 5:00 PM your time"]);
    expect(side.getByText("Monster Park").nextElementSibling!.textContent).toBe("1/2 per world · Meow");
    expect(side.getByText("Ursus").nextElementSibling!.textContent).toBe("1/1 per account · Remy");
    // the tabs: each character's counts
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["RemyD 2/5 · W 1/3", "MeowD 1/3 · W 0/0"]);
  });

  it("switching characters; a limit used up by another is greyed out with who did it", async () => {
    show();
    await column("Daily");
    await userEvent.click(screen.getByRole("tab", { name: /Meow/ }));
    const daily = await column("Daily");
    const ursus = daily.getByRole("checkbox", { name: "Ursus done" }) as HTMLInputElement;
    expect(ursus.disabled).toBe(true);
    expect(daily.getByText("done by Remy")).toBeTruthy();
    expect((daily.getByRole("checkbox", { name: "Monster Park done" }) as HTMLInputElement).disabled).toBe(false);
  });

  it("ticking shows at once and saves; unticking sends false", async () => {
    const answers: (() => void)[] = [];
    const s = show(board([REMY, MEOW]), { "PUT /checklist/:id/ticks/vanishing-journey": () => new Promise<undefined>((r) => answers.push(() => r(undefined))) });
    const daily = await column("Daily");
    const box = () => daily.getByRole("checkbox", { name: "Vanishing Journey done" }) as HTMLInputElement;
    await userEvent.click(box());
    expect(box().checked).toBe(true);
    await userEvent.click(box());
    expect(box().checked).toBe(false);
    expect(s.sent("PUT", "/checklist/1/ticks/vanishing-journey")).toEqual([{ done: true }]); // the second waits for the first
    answers.shift()!();
    await waitFor(() => expect(s.sent("PUT", "/checklist/1/ticks/vanishing-journey")).toEqual([{ done: true }, { done: false }]));
    answers.shift()!();
    await waitFor(() => expect(loads(s)).toBeGreaterThanOrEqual(2));
  });

  it("a tick reloads only the checklist, and doesn't interrupt other loading (the saved settings)", async () => {
    let release = () => {};
    const s = show(board([REMY, MEOW]), { "GET /settings": () => new Promise((r) => (release = () => r({ theme: "pochacco", worldId: 45 }))) });
    await column("Daily");
    await userEvent.click(screen.getByRole("checkbox", { name: "Vanishing Journey done" }));
    release();
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("pochacco"));
    await waitFor(() => expect(loads(s)).toBeGreaterThanOrEqual(2));
    expect(s.calls.filter((c) => c.method === "GET" && ["/settings", "/theme-art"].includes(c.path))).toHaveLength(2);
  });

  it("a refused tick says why, until another character or world is picked", async () => {
    show(board([REMY, MEOW]), { "PUT /checklist/:id/ticks/vanishing-journey": () => new Response(JSON.stringify({ error: "Vanishing Journey isn't in Remy's plan. Add it to the plan first." }), { status: 409 }), "PUT /settings": { theme: "ren", worldId: 70 } });
    await userEvent.click((await column("Daily")).getByRole("checkbox", { name: "Vanishing Journey done" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Vanishing Journey isn't in Remy's plan. Add it to the plan first.");
    await userEvent.click(screen.getByRole("tab", { name: /Meow/ }));
    expect(screen.queryByRole("alert")).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: /Remy/ }));
    await userEvent.click((await column("Daily")).getByRole("checkbox", { name: "Vanishing Journey done" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Hyperion" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("with no characters, says to add them on Home; a failed load says why", async () => {
    show(board([]));
    expect(await screen.findByText("No characters on Kronos yet. Add them on Home first.")).toBeTruthy();
  });

  it("a board that fails to load says why", async () => {
    show(new Response(JSON.stringify({ error: "Database is busy" }), { status: 500 }));
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't load the checklist: Database is busy");
  });

  it("a character with nothing planned says so", async () => {
    show(board([character(3, "Empty", [])]));
    expect((await column("Daily")).getByText("Nothing planned.")).toBeTruthy();
  });

  it("past the daily reset, the board is loaded again, once", async () => {
    vi.setSystemTime(new Date("2026-10-20T23:59:59Z"));
    const s = show();
    await column("Daily");
    await new Promise((r) => setTimeout(r, 1200));
    expect(loads(s)).toBe(1);
    vi.setSystemTime(new Date("2026-10-21T00:00:01Z"));
    await waitFor(() => expect(loads(s)).toBe(2), { timeout: 3000 });
    await new Promise((r) => setTimeout(r, 2200));
    expect(loads(s)).toBe(2);
    // still the old period 10 seconds on (this computer's clock ahead): asked once more
    vi.setSystemTime(new Date("2026-10-21T00:00:12Z"));
    await waitFor(() => expect(loads(s)).toBe(3), { timeout: 3000 });
  }, 15_000);

  it("after each check of Nexon, the board is loaded again", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 20, 11, 59)));
    let finishedAt = "2026-10-20T08:00:30.000Z";
    const s = show(board([REMY]), { "GET /refresh": () => ({ last: { startedAt: "2026-10-20T08:00:00.000Z", finishedAt, checked: 1, updated: 1, missing: 0, failed: 0, problem: null } }) });
    await vi.waitFor(() => expect(loads(s)).toBe(1));
    finishedAt = "2026-10-20T12:00:30.000Z";
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.waitFor(() => expect(loads(s)).toBe(2));
  });
});

describe("the planning menu", () => {
  async function open() {
    const s = show();
    await column("Daily");
    await userEvent.click(screen.getByRole("button", { name: "Plan tasks…" }));
    return { s, dialog: within(screen.getByRole("dialog", { name: "Plan tasks · Remy" })) };
  }

  it("every task by reset and category, with levels (warning above the character's) and badges; saves in the tasks' order", async () => {
    const { s, dialog } = await open();
    expect(dialog.getAllByRole("checkbox").filter((c) => (c as HTMLInputElement).checked)).toHaveLength(9);
    expect(dialog.getByText("290+ (above Lv. 278)").className).toContain("warning");
    expect(dialog.getAllByText("260+").every((x) => !x.className.includes("warning"))).toBe(true);
    expect(dialog.getByText("Mon")).toBeTruthy();
    expect(dialog.getByText(/5 daily · 3 weekly · 1 one-off/)).toBeTruthy();
    await userEvent.click(dialog.getByRole("checkbox", { name: "Plan Tallahart" }));
    await userEvent.click(dialog.getByRole("checkbox", { name: "Plan Vanishing Journey" }));
    await userEvent.click(dialog.getByRole("checkbox", { name: "Plan Vanishing Journey" }));
    expect(dialog.getByText(/4 daily/)).toBeTruthy();
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(s.sent("PUT", "/checklist/1/plan")).toEqual([{ tasks: ["vanishing-journey", "cernium", "monster-park", "ursus", "erda-spectrum", "epic-dungeon", "custom-7", "custom-8"] }]);
    // the checklist loads again, and nothing else
    await waitFor(() => expect(loads(s)).toBe(2));
    expect(s.calls.filter((c) => c.method === "GET" && c.path === "/settings")).toHaveLength(1);
  });

  it("Cancel, Escape and a click outside close it without saving", async () => {
    const { s } = await open();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Plan tasks…" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Plan tasks…" }));
    fireEvent.click(screen.getByRole("dialog").parentElement!);
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Plan tasks…" }));
    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    expect(s.sent("PUT", "/checklist/1/plan")).toEqual([]);
  });

  it("a failed save says why and stays open", async () => {
    show(board([REMY]), { "PUT /checklist/:id/plan": new Response(JSON.stringify({ error: 'Unknown task "nobody"' }), { status: 400 }) });
    await column("Daily");
    await userEvent.click(screen.getByRole("button", { name: "Plan tasks…" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await within(screen.getByRole("dialog")).findByRole("alert")).textContent).toBe('Unknown task "nobody"');
  });
});

describe("your own tasks", () => {
  it("New task: the form's choices are sent as the task", async () => {
    const s = show();
    await column("Daily");
    await userEvent.click(screen.getByRole("button", { name: "New task…" }));
    const form = within(screen.getByRole("dialog", { name: "New task" }));
    expect(document.activeElement).toBe(form.getByLabelText("Name"));
    await userEvent.type(form.getByLabelText("Name"), "Guild check");
    await userEvent.click(form.getByRole("button", { name: "Sacred symbols" }));
    await userEvent.click(form.getByRole("button", { name: "Weekly" }));
    expect((form.getByRole("combobox", { name: "Reset day" }) as HTMLSelectElement).value).toBe("4");
    await userEvent.selectOptions(form.getByRole("combobox", { name: "Reset day" }), "Monday");
    await userEvent.click(form.getByRole("button", { name: "Kronos" }));
    expect(form.queryByRole("spinbutton")).toBeNull(); // per character: no count
    await userEvent.click(form.getByRole("button", { name: "Per world" }));
    const n = form.getByRole("spinbutton", { name: "Characters per period" });
    await userEvent.clear(n);
    await userEvent.type(n, "3");
    expect(form.getByText(/characters each week/)).toBeTruthy();
    await userEvent.click(form.getByRole("button", { name: "Add task" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(s.sent("POST", "/checklist/tasks")).toEqual([{ name: "Guild check", category: "sacred", reset: "weekly", weekday: 1, worlds: "45", limitScope: "world", limitCount: 3 }]);
    await waitFor(() => expect(loads(s)).toBeGreaterThanOrEqual(2));
  });

  it("a weekly task left on the shown day saves that day (Thursday)", async () => {
    const s = show();
    await column("Daily");
    await userEvent.click(screen.getByRole("button", { name: "New task…" }));
    const form = within(screen.getByRole("dialog", { name: "New task" }));
    await userEvent.type(form.getByLabelText("Name"), "Weekly thing");
    await userEvent.click(form.getByRole("button", { name: "Weekly" }));
    await userEvent.click(form.getByRole("button", { name: "Add task" }));
    await waitFor(() => expect(s.sent("POST", "/checklist/tasks")).toEqual([expect.objectContaining({ reset: "weekly", weekday: 4 })]));
  });

  it("an empty or nonsense count is saved as 1; a refused task says why and stays open", async () => {
    const s = show(board([REMY]), { "POST /checklist/tasks": new Response(JSON.stringify({ error: "Give the task a name" }), { status: 400 }) });
    await column("Daily");
    await userEvent.click(screen.getByRole("button", { name: "New task…" }));
    const form = within(screen.getByRole("dialog", { name: "New task" }));
    await userEvent.click(form.getByRole("button", { name: "Per account" }));
    fireEvent.change(form.getByRole("spinbutton"), { target: { value: "" } });
    expect(form.getByText(/character each day/)).toBeTruthy();
    await userEvent.click(form.getByRole("button", { name: "Add task" }));
    expect((await form.findByRole("alert")).textContent).toBe("Give the task a name");
    // over 50, the browser refuses to send it (the field's own limit)
    fireEvent.change(form.getByRole("spinbutton"), { target: { value: "500" } });
    await userEvent.click(form.getByRole("button", { name: "Add task" }));
    expect((form.getByRole("spinbutton") as HTMLInputElement).validity.rangeOverflow).toBe(true);
    expect(s.sent("POST", "/checklist/tasks")).toHaveLength(1);
    expect(s.sent("POST", "/checklist/tasks")[0]).toMatchObject({ limitScope: "account", limitCount: 1 });
  });

  it("a failed delete's message doesn't follow onto a new task opened from the planning menu", async () => {
    show(board([REMY]), { "DELETE /checklist/tasks/:id": () => new Response(JSON.stringify({ error: "Not found" }), { status: 404 }) });
    await column("Daily");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await userEvent.click(screen.getByRole("button", { name: "Plan tasks…" }));
    await userEvent.click(screen.getByRole("button", { name: "Change Guild check" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect((await within(screen.getByRole("dialog", { name: "Change Guild check" })).findByRole("alert")).textContent).toBe("Not found");
    await userEvent.click(within(screen.getByRole("dialog", { name: "Change Guild check" })).getByRole("button", { name: "Cancel" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Plan tasks · Remy" })).getByRole("button", { name: "New task…" }));
    expect(within(screen.getByRole("dialog", { name: "New task" })).queryByRole("alert")).toBeNull();
  });

  it("Edit from the planning menu changes it; Delete asks first", async () => {
    const s = show();
    await column("Daily");
    await userEvent.click(screen.getByRole("button", { name: "Plan tasks…" }));
    await userEvent.click(screen.getByRole("button", { name: "Change Guild check" }));
    const form = within(screen.getByRole("dialog", { name: "Change Guild check" }));
    expect((form.getByLabelText("Name") as HTMLInputElement).value).toBe("Guild check");
    expect((form.getByRole("combobox", { name: "Reset day" }) as HTMLSelectElement).value).toBe("1");
    // Escape closes the form only, not the planning menu under it
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Change Guild check" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Plan tasks · Remy" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Change Guild check" }));
    const again = within(screen.getByRole("dialog", { name: "Change Guild check" }));
    await userEvent.clear(again.getByLabelText("Name"));
    await userEvent.type(again.getByLabelText("Name"), "Guild stuff");
    await userEvent.click(again.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(s.sent("PUT", "/checklist/tasks/7")).toEqual([{ name: "Guild stuff", category: "other", reset: "weekly", weekday: 1, worlds: "both", limitScope: "character", limitCount: 1 }]));
    // delete: cancelled, then confirmed
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await userEvent.click(screen.getByRole("button", { name: "Change Finish Geardock story" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(s.sent("DELETE", "/checklist/tasks/8")).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(s.calls.some((c) => c.method === "DELETE" && c.path === "/checklist/tasks/8")).toBe(true));
    expect(confirm.mock.calls[0]![0]).toBe("Delete Finish Geardock story? It comes off every character's checklist.");
  });
});
