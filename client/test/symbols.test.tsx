import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SymbolInfo, SymbolsBoard, SymbolsCharacter } from "../src/api/types";
import { App } from "../src/App";
import { allMaxedWith, blankState, daysToMax, fit, forecast, left, mesoToMax, mostForce, need, perDay, room, soonest, summary, type SymbolState } from "../src/lib/symbols";
import { BASE_ROUTES, fakeServer, renderWithApp } from "./server";

// Made-up symbols with small numbers, worked out by hand: up to Lv. 4, needing 10, 20, then 30
// symbols, costing 100, 200, then 300 meso, with 10 Force a level.
const toy = (id: string, extra: Partial<SymbolInfo> = {}): SymbolInfo => ({
  id,
  name: id.toUpperCase(),
  kind: "arcane",
  grand: false,
  daily: 10,
  weeklyPerClear: 20,
  maxLevel: 4,
  selector: "arcane",
  steps: [
    { symbols: 10, meso: 100 },
    { symbols: 20, meso: 200 },
    { symbols: 30, meso: 300 },
  ],
  force: [0, 10, 20, 30, 40],
  ...extra,
});
const A = toy("a");
const B = toy("b");
const C = toy("c");
const D = toy("d");
const st = (level: number, held = 0, days = 7, weekly = 0): SymbolState => ({ level, held, days, weekly });

describe("the calculator's maths", () => {
  it("need and room: what the next level takes, and the most a level can hold", () => {
    expect([need(A, 1), need(A, 3)]).toEqual([10, 30]);
    expect([room(A, 0), room(A, 1), room(A, 3), room(A, 4)]).toEqual([0, 9, 29, 0]);
  });

  it("fit keeps a typed state within what the symbol allows", () => {
    expect(fit(A, st(9, 99, 9, 9))).toEqual(st(4, 0, 7, 3)); // too high everywhere: the top, nothing held
    expect(fit(A, st(2, 99, -1, -1))).toEqual(st(2, 19, 0, 0));
    expect(fit(A, st(-3, 5))).toEqual(st(0, 0));
    expect(fit(toy("s", { weeklyPerClear: null }), st(2, 3, 5, 3))).toEqual(st(2, 3, 5, 0)); // no weekly content
    expect(blankState()).toEqual(st(0, 0, 7, 0));
  });

  it("perDay averages the dailies and weekly clears over the week", () => {
    expect(perDay(A, st(1, 0, 7, 0))).toBe(10);
    expect(perDay(A, st(1, 0, 5, 3))).toBe(110 / 7); // 5 × 10 + 3 × 20
    expect(perDay(A, st(1, 0, 0, 0))).toBe(0);
  });

  it("left, daysToMax and mesoToMax", () => {
    expect([left(A, st(2, 5)), left(A, st(1)), left(A, st(4)), left(A, st(0))]).toEqual([45, 60, 0, null]);
    expect(left(A, st(2, 5), 40)).toBe(5);
    expect(left(A, st(2, 5), 50)).toBe(0); // never below zero
    expect([daysToMax(A, st(2, 5)), daysToMax(A, st(4)), daysToMax(A, st(0)), daysToMax(A, st(2, 5, 0))]).toEqual([4.5, 0, null, null]);
    expect(daysToMax(A, st(2, 5), 25)).toBe(2);
    expect(daysToMax(A, st(4, 0, 0))).toBe(0); // maxed, whatever the days
    expect([mesoToMax(A, 1), mesoToMax(A, 2), mesoToMax(A, 4), mesoToMax(A, 0)]).toEqual([600, 500, 0, null]);
  });

  it("summary: Force now and at the top, when everything unlocked is maxed, meso to go", () => {
    const states = { a: st(2, 5), b: st(4), c: st(0) };
    expect(summary([A, B, C], states)).toEqual({ unlocked: 2, force: 60, maxForce: 120, allMaxed: 4.5, meso: 500 });
    expect(summary([A, B, C], { ...states, a: st(2, 5, 0) }).allMaxed).toBeNull(); // one never gets there
    expect(summary([C], { c: st(0) })).toMatchObject({ unlocked: 0, allMaxed: null }); // none unlocked
    expect(summary([B], { b: st(4) }).allMaxed).toBe(0);
  });

  it("forecast: Force day by day, levelling up as symbols come in, until all are maxed", () => {
    // A: Lv. 2 with 5, 10 a day: Lv. 3 on day 2 (25 − 20 = 5 left over), Lv. 4 on day 5; B maxed (40)
    expect(forecast([A, B], { a: st(2, 5), b: st(4) })).toEqual([0, 1, 2, 3, 4, 5].map((day) => ({ day, force: 40 + [20, 20, 30, 30, 30, 40][day]! })));
    expect(forecast([A], { a: st(2, 5, 0) })).toEqual([{ day: 0, force: 20 }]); // nothing coming in
    // 7 dailies of 10 and 3 weekly clears of 20 = 130 / 7 ≈ 18.6 a day: Lv. 2 on day 1, Lv. 3 on day 2; stopped at 3 days
    expect(forecast([A], { a: st(1, 0, 7, 3) }, 3).map((p) => p.force)).toEqual([10, 20, 30, 30]);
    expect(forecast([A, C], { a: st(1, 9), c: st(0) }, 1)).toEqual([{ day: 0, force: 10 }, { day: 1, force: 20 }]); // locked C adds nothing
    expect(forecast([A], { a: st(1) }, 1)).toEqual([{ day: 0, force: 10 }, { day: 1, force: 20 }]); // exactly the 10 needed: up a level
    expect(forecast([A, C], { a: st(4), c: st(0, 0, 7) })).toEqual([{ day: 0, force: 40 }]); // only a maxed and a locked one: nothing grows
  });

  it("soonest: one coupon at a time to the longest wait (the earlier on a tie)", () => {
    // A needs 45 at 10 a day (4.5 days), D needs 20 (2 days): A first, until both need 20, then in turns, A first
    expect(soonest([A, D], { a: st(2, 5), d: st(3, 10) }, "arcane", 30)).toEqual({ a: 28, d: 2 });
    expect(soonest([A, D], { a: st(2, 5), d: st(3, 10) }, "arcane", 0)).toEqual({});
    // more coupons than everything needs: each gets only what it needs
    expect(soonest([A, D], { a: st(2, 5), d: st(3, 10) }, "arcane", 999)).toEqual({ a: 45, d: 20 });
    // one that never gets there (no days) goes first
    expect(soonest([A, D], { a: st(2, 5), d: st(3, 10, 0) }, "arcane", 5)).toEqual({ d: 5 });
    // a slower one waits longer: D needs 20 at 10 / 7 a day (14 days), A 45 at 10 (4.5 days)
    expect(soonest([A, D], { a: st(2, 5), d: st(3, 10, 1) }, "arcane", 5)).toEqual({ d: 5 });
  });

  it("only symbols this coupon can go into: its kind, unlocked, not maxed, with a selector", () => {
    const sac = toy("s", { kind: "sacred", selector: "sacred" });
    const none = toy("n", { kind: "sacred", selector: null });
    const states = { a: st(2), s: st(2), n: st(2), b: st(4), c: st(0) };
    expect(Object.keys(soonest([A, sac, none, B, C], states, "sacred", 10))).toEqual(["s"]);
    expect(Object.keys(soonest([A, sac, none, B, C], states, "arcane", 10))).toEqual(["a"]);
    expect(mostForce([A, sac, none, B, C], states, "sacred", 10).give).toEqual({ s: 10 });
    expect(mostForce([A, B, C], states, "arcane", 10).give).toEqual({ a: 10 }); // not the locked C, nor the maxed B
  });

  it("mostForce: whole level-ups cheapest first, the rest toward the next cheapest; the Force gained", () => {
    // A: 15 to Lv. 3; D: 20 to Lv. 4; then A's 30 to Lv. 4 is too much for the 5 left
    expect(mostForce([A, D], { a: st(2, 5), d: st(3, 10) }, "arcane", 40)).toEqual({ give: { a: 20, d: 20 }, gain: 20 });
    expect(mostForce([A, D], { a: st(2, 5), d: st(3, 10) }, "arcane", 14)).toEqual({ give: { a: 14 }, gain: 0 });
    expect(mostForce([A, D], { a: st(2, 5), d: st(3, 10) }, "arcane", 0)).toEqual({ give: {}, gain: 0 });
    // of equal costs, the earlier; everything maxed: the rest isn't used
    expect(mostForce([A, D], { a: st(3, 10), d: st(3, 10) }, "arcane", 100)).toEqual({ give: { a: 20, d: 20 }, gain: 20 });
    expect(mostForce([A, D], { a: st(3, 10), d: st(3, 10) }, "arcane", 20)).toEqual({ give: { a: 20 }, gain: 10 });
  });

  it("allMaxedWith: when everything unlocked is maxed with the coupons put in", () => {
    const states = { a: st(2, 5), d: st(3, 10), c: st(0) };
    expect(allMaxedWith([A, D, C], states, {})).toBe(4.5);
    expect(allMaxedWith([A, D, C], states, { a: 28, d: 2 })).toBe(1.8);
    expect(allMaxedWith([A, D], { a: st(2, 5, 0), d: st(3) }, {})).toBeNull();
    expect(allMaxedWith([C], { c: st(0) }, {})).toBeNull();
  });
});

// The page, with two Arcane and three Sacred symbols (real-looking, smaller lists).
const ARC1 = toy("vanishing-journey", { name: "Vanishing Journey" });
const ARC2 = toy("esfera", { name: "Esfera" });
const SAC1 = toy("cernium", { name: "Cernium", kind: "sacred", selector: "sacred", weeklyPerClear: null });
const SAC2 = toy("tallahart", { name: "Tallahart", kind: "sacred", selector: "sacred", weeklyPerClear: null, grand: true });
const SAC3 = toy("geardock", { name: "Geardock", kind: "sacred", selector: null, weeklyPerClear: null, grand: true });
const char = (id: number, name: string, symbols: Record<string, SymbolState>): SymbolsCharacter => ({ id, name, job: "Ren", level: 278, avatar: null, symbols });
const REMY = char(1, "Remy", { "vanishing-journey": st(4), esfera: st(2, 5), cernium: st(1, 0, 7) });
const MEOW = char(2, "Meow", {});
const board = (characters: SymbolsCharacter[]): SymbolsBoard => ({ patch: "v.271", symbols: [ARC1, ARC2, SAC1, SAC2, SAC3], characters });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(Date.UTC(2026, 9, 20, 19, 0)));
});
afterEach(() => vi.useRealTimers());

function show(b: unknown = board([REMY, MEOW]), routes: Record<string, unknown> = {}) {
  const s = fakeServer({ ...BASE_ROUTES, "GET /symbols": b, "PUT /symbols/:id/vanishing-journey": undefined, "PUT /symbols/:id/esfera": undefined, "PUT /symbols/:id/cernium": undefined, ...routes });
  renderWithApp(<App />, "/symbols");
  return s;
}
const card = async (name: string) => within(await screen.findByRole("group", { name }));

describe("the Symbols tab", () => {
  it("each symbol's card, the totals, each time to max, the coupons and the forecast", async () => {
    show();
    const vj = await card("Vanishing Journey");
    expect((vj.getByRole("spinbutton", { name: "Vanishing Journey level" }) as HTMLInputElement).value).toBe("4");
    expect(vj.getByText("max")).toBeTruthy();
    expect(vj.getByText("Force 40")).toBeTruthy();
    const esfera = await card("Esfera");
    expect((esfera.getByRole("spinbutton", { name: "Esfera symbols held" }) as HTMLInputElement).value).toBe("5");
    expect(esfera.getByText("/ 20", { exact: false })).toBeTruthy();
    expect((esfera.getByRole("combobox", { name: "Esfera weekly clears" }) as HTMLSelectElement).value).toBe("0");
    const ttm = within(screen.getByRole("region", { name: "Time to max" }));
    expect(ttm.getByText("60")).toBeTruthy(); // Force 40 + 20
    expect(ttm.getByText("/ 80")).toBeTruthy();
    expect(ttm.getAllByText("4.5 days")).toHaveLength(2); // all maxed, and Esfera's own
    expect(ttm.getByText(/500 meso to go/)).toBeTruthy();
    expect(within(ttm.getByText("Vanishing Journey").parentElement!).getByText("maxed")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Force from 60 now to 80 on day 5" })).toBeTruthy();
  });

  it("Sacred: its own symbols (Grand marked, Geardock without a selector), no weekly clears", async () => {
    show();
    await card("Esfera");
    await userEvent.click(screen.getByRole("button", { name: "Sacred" }));
    const tall = await card("Tallahart");
    expect(tall.getByText("Grand")).toBeTruthy();
    expect((await card("Geardock")).getByText("no selector")).toBeTruthy();
    expect((await card("Cernium")).queryByRole("combobox", { name: "Cernium weekly clears" })).toBeNull();
    expect(screen.getByText(/Geardock has none/)).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Esfera" })).toBeNull();
  });

  it("a typed level is saved when leaving the box, not on every key; a day count at once", async () => {
    const s = show();
    const esfera = await card("Esfera");
    const level = esfera.getByRole("spinbutton", { name: "Esfera level" });
    await userEvent.clear(level);
    await userEvent.type(level, "3");
    expect(s.sent("PUT", "/symbols/1/esfera")).toEqual([]);
    await userEvent.tab();
    // Lv. 3 holds at most 29: the 5 held stay
    await waitFor(() => expect(s.sent("PUT", "/symbols/1/esfera")).toEqual([{ level: 3, held: 5, days: 7, weekly: 0 }]));
    await userEvent.selectOptions(esfera.getByRole("combobox", { name: "Esfera days a week" }), "5");
    await waitFor(() => expect(s.sent("PUT", "/symbols/1/esfera")).toHaveLength(2));
    expect(s.sent("PUT", "/symbols/1/esfera")[1]).toMatchObject({ days: 5 });
  });

  it("a saved symbol marks the Stats page's boards to be worked out again (its sacred symbol buff follows the Sacred symbols)", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(["stats", 1], { input: {} });
    fakeServer({ ...BASE_ROUTES, "GET /symbols": board([REMY, MEOW]), "PUT /symbols/:id/esfera": undefined });
    renderWithApp(<App />, "/symbols", qc);
    const esfera = await card("Esfera");
    const level = esfera.getByRole("spinbutton", { name: "Esfera level" });
    await userEvent.clear(level);
    await userEvent.type(level, "3{Enter}");
    await waitFor(() => expect(qc.getQueryState(["stats", 1])!.isInvalidated).toBe(true));
  });

  it("Enter saves too; a value past what the symbol allows is fitted first; nonsense is put back", async () => {
    const s = show();
    const esfera = await card("Esfera");
    const held = esfera.getByRole("spinbutton", { name: "Esfera symbols held" });
    await userEvent.clear(held);
    await userEvent.type(held, "99{Enter}");
    await waitFor(() => expect(s.sent("PUT", "/symbols/1/esfera")).toEqual([{ level: 2, held: 19, days: 7, weekly: 0 }]));
    const level = esfera.getByRole("spinbutton", { name: "Esfera level" });
    fireEvent.change(level, { target: { value: "" } });
    fireEvent.blur(level);
    expect((level as HTMLInputElement).value).not.toBe("");
    expect(s.sent("PUT", "/symbols/1/esfera")).toHaveLength(1);
  });

  it("a symbol not entered yet starts as not unlocked; entering a level saves the whole state", async () => {
    const s = show();
    await card("Esfera");
    await userEvent.click(screen.getByRole("tab", { name: /Meow/ }));
    const esfera = await card("Esfera");
    expect(esfera.getByText("not unlocked")).toBeTruthy();
    const level = esfera.getByRole("spinbutton", { name: "Esfera level" });
    await userEvent.clear(level);
    await userEvent.type(level, "1{Enter}");
    await waitFor(() => expect(s.sent("PUT", "/symbols/2/esfera")).toEqual([{ level: 1, held: 0, days: 7, weekly: 0 }]));
  });

  it("coupons: both suggestions follow the number typed", async () => {
    show();
    await card("Esfera");
    const box = within(screen.getByRole("region", { name: "Selector coupons" }));
    expect(box.getAllByText("Nothing to put in.")).toHaveLength(2);
    await userEvent.clear(box.getByRole("spinbutton", { name: "Selector coupons" }));
    await userEvent.type(box.getByRole("spinbutton", { name: "Selector coupons" }), "15");
    // Esfera (Lv. 2, 5 held) is the only one to grow: all 15 go there either way
    expect(box.getAllByText("Esfera")).toHaveLength(2);
    expect(box.getByText("+10 Force right away")).toBeTruthy(); // 15 reaches Lv. 3
    expect(box.getByText(/Then all maxed: ≈ 3.0 days/)).toBeTruthy(); // 30 left at 10 a day
  });

  it("a refused save says why until another character or world is picked", async () => {
    show(board([REMY, MEOW]), { "PUT /symbols/:id/esfera": () => new Response(JSON.stringify({ error: "Esfera goes up to Lv. 20" }), { status: 400 }), "PUT /settings": { theme: "ren", worldId: 70 } });
    const esfera = await card("Esfera");
    await userEvent.selectOptions(esfera.getByRole("combobox", { name: "Esfera days a week" }), "3");
    expect((await screen.findByRole("alert")).textContent).toBe("Esfera goes up to Lv. 20");
    await userEvent.click(screen.getByRole("tab", { name: /Meow/ }));
    expect(screen.queryByRole("alert")).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: /Remy/ }));
    await userEvent.selectOptions((await card("Esfera")).getByRole("combobox", { name: "Esfera days a week" }), "4");
    expect(await screen.findByRole("alert")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Hyperion" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("nothing unlocked: no 'never', just a dash, and no graph", async () => {
    show(board([MEOW]));
    await card("Esfera");
    expect(screen.getByText(/Then all maxed/).textContent).toBe("Then all maxed: —");
    expect(screen.getByText(/Nothing is levelling up/)).toBeTruthy();
  });

  it("the graph's dates appear once each, starting today", async () => {
    show(board([char(1, "Remy", { esfera: st(1, 0, 1) })])); // 50 symbols at 10 / 7 a day: 35 days
    await card("Esfera");
    const labels = [...document.querySelectorAll(".force-graph .graph-label")].map((t) => t.textContent);
    expect(labels.filter((d) => d === "today")).toHaveLength(1);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.length).toBe(7); // max, the starting Force, and five dates
  });

  it("a typed value fitted back to what's there: the box shows what's kept, and nothing is sent", async () => {
    const s = show();
    const vj = await card("Vanishing Journey"); // at its top, Lv. 4
    const level = vj.getByRole("spinbutton", { name: "Vanishing Journey level" }) as HTMLInputElement;
    await userEvent.clear(level);
    await userEvent.type(level, "25{Enter}");
    expect(level.value).toBe("4");
    expect(s.sent("PUT", "/symbols/1/vanishing-journey")).toEqual([]);
    // fitted to something new: saved, and the box shows that
    const held = (await card("Esfera")).getByRole("spinbutton", { name: "Esfera symbols held" }) as HTMLInputElement;
    await userEvent.clear(held);
    await userEvent.type(held, "99{Enter}");
    expect(held.value).toBe("19");
  });

  it("saved values past what the symbol now allows (a later patch) are fitted, not shown as NaN", async () => {
    show(board([char(1, "Remy", { esfera: st(9, 999) })]));
    const esfera = await card("Esfera");
    expect(esfera.getByText("Force 40")).toBeTruthy(); // fitted to Lv. 4, the top
    expect(screen.getByRole("region", { name: "Time to max" }).textContent).not.toContain("NaN");
  });

  it("the graph says when it's cut at two years, and when nothing is levelling up", async () => {
    show(board([char(1, "Remy", { esfera: st(1, 0, 0) })]));
    await card("Esfera");
    expect(screen.getByText(/Nothing is levelling up/)).toBeTruthy();
    expect(document.querySelector(".force-graph")).toBeNull();
  });

  it("a slow symbol: the graph shows its first two years and says so", async () => {
    const slow = toy("slow", { name: "Slow", steps: [{ symbols: 5000, meso: 1 }, { symbols: 5000, meso: 1 }, { symbols: 5000, meso: 1 }] });
    show({ patch: "v.271", symbols: [slow], characters: [char(1, "Remy", { slow: st(1, 0, 1) })] });
    await card("Slow");
    expect(screen.getByText(/first two years/)).toBeTruthy();
  });

  it("with no characters, says to add them on Home; a failed load says why", async () => {
    show(board([]));
    expect(await screen.findByText("No characters on Kronos yet. Add them on Home first.")).toBeTruthy();
  });

  it("a board that fails to load says why", async () => {
    show(new Response(JSON.stringify({ error: "Database is busy" }), { status: 500 }));
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't load the symbols: Database is busy");
  });

  it("saves go one at a time, in order; the instant change touches only that character", async () => {
    const answers: (() => void)[] = [];
    const remy2 = char(3, "Remy2", { esfera: st(2, 5) });
    const s = show(board([REMY, remy2]), { "PUT /symbols/:id/esfera": () => new Promise<undefined>((r) => answers.push(() => r(undefined))) });
    const esfera = await card("Esfera");
    await userEvent.selectOptions(esfera.getByRole("combobox", { name: "Esfera weekly clears" }), "1");
    await userEvent.selectOptions(esfera.getByRole("combobox", { name: "Esfera weekly clears" }), "2");
    expect(s.sent("PUT", "/symbols/1/esfera")).toEqual([{ level: 2, held: 5, days: 7, weekly: 1 }]); // the second waits
    await userEvent.click(screen.getByRole("tab", { name: /Remy2/ }));
    expect(((await card("Esfera")).getByRole("combobox", { name: "Esfera weekly clears" }) as HTMLSelectElement).value).toBe("0"); // not changed
    answers.shift()!();
    await waitFor(() => expect(s.sent("PUT", "/symbols/1/esfera")).toHaveLength(2));
    answers.shift()!();
  });

  it("a save doesn't interrupt other loading (the saved settings)", async () => {
    let release = () => {};
    show(board([REMY]), { "GET /settings": () => new Promise((r) => (release = () => r({ theme: "pochacco", worldId: 45 }))) });
    await userEvent.selectOptions((await card("Esfera")).getByRole("combobox", { name: "Esfera weekly clears" }), "1");
    release();
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("pochacco"));
  });

  it("after each check of Nexon, the symbols load again (levels and avatars)", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 20, 11, 59)));
    let finishedAt = "2026-10-20T08:00:30.000Z";
    const s = show(board([REMY]), { "GET /refresh": () => ({ last: { startedAt: "2026-10-20T08:00:00.000Z", finishedAt, checked: 1, updated: 1, missing: 0, failed: 0, problem: null } }) });
    const loads = () => s.calls.filter((c) => c.method === "GET" && c.path.startsWith("/symbols")).length;
    await vi.waitFor(() => expect(loads()).toBe(1));
    await new Promise((r) => setTimeout(r, 50)); // the first answer about the last check has arrived
    finishedAt = "2026-10-20T12:00:30.000Z";
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.waitFor(() => expect(loads()).toBe(2));
  });

  it("a save shows at once and reloads only the symbols", async () => {
    let answer = () => {};
    const s = show(board([REMY]), { "PUT /symbols/:id/esfera": () => new Promise<undefined>((r) => (answer = () => r(undefined))) });
    const esfera = await card("Esfera");
    await userEvent.selectOptions(esfera.getByRole("combobox", { name: "Esfera weekly clears" }), "2");
    expect((esfera.getByRole("combobox", { name: "Esfera weekly clears" }) as HTMLSelectElement).value).toBe("2");
    answer();
    await waitFor(() => expect(s.calls.filter((c) => c.method === "GET" && c.path.startsWith("/symbols")).length).toBe(2));
    expect(s.calls.filter((c) => c.method === "GET" && c.path === "/settings")).toHaveLength(1);
  });
});
