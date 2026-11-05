import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App";
import type { GearBoard, GearCharacter, StarForceBoard, StarForceDetail, StarForceItem } from "../src/api/types";
import { BASE_ROUTES, fakeServer, renderWithApp } from "./server";

// A made-up character with two items that can take stars. The numbers are the server's to work out
// (tested there); here, what the page shows and sends.
const VALUES = { att: 4, allStat: 14.65, secRatio: 0.125, bossDmg: 12, fdPer100: 0.785, strPct: null, dexPct: null, intPct: null, lukPct: null, hpPct: null, attPct: 53.82, mainFlat: 0.29, critDmg: 42.38, ied300: 15.6, ied380: 20.52, bossDef: 380 as const, cd2: null, cd3: null, cd4: null, cd5: null, cd6: null, cdMin: 0 as const };
const SLOTS = ["ring1", "hat", "emblem", "ring2", "pendant1", "face", "badge", "ring3", "pendant2", "eye", "earrings", "medal", "ring4", "weapon", "top", "shoulder", "secondary", "pocket", "belt", "bottom", "gloves", "android", "shoes", "cape", "heart", "ringP", "totem1", "totem2", "totem3"].map((key) => ({ key, label: key, kind: key.replace(/\d$|P$/, "") }));
const char = (id: number, name: string, extra: Partial<GearCharacter> = {}): GearCharacter => ({ id, name, job: "Ren", level: 279, avatar: null, knownJob: true, fits: [], equipped: {}, details: {}, statBoxes: { pct: [{ stat: "STR" as const, field: "strPct" as const, main: true, default: 12.97 }, { stat: "DEX" as const, field: "dexPct" as const, main: false, default: 1.68 }], magic: false, secondary: true, allStat: true }, statValues: { values: VALUES, typed: VALUES, worked: null }, ...extra });
const GEAR: GearBoard = { generated: "2026-10-27", slots: SLOTS, items: [], jobs: {}, characters: [char(1, "RemyRabbit", { details: { hat: { stars: 17, flames: { STR: 6 }, potential: null, hammers: 1 } } }), char(2, "Second")] };

const item = (slot: string, name: string, over: Partial<StarForceItem> = {}): StarForceItem => ({
  slot, name, icon: `/item-icons/${slot}.png`, level: 200, star: 17, min: 0, max: 30, boomCost: 0, safety: null,
  next: { pick: "Mode 1", success: 0.1575, boom: 0.0674 }, best: { from: 17, to: 18, cost: 2.88e9, fd: 0.65, perFd: 4.42e9 }, stop: { star: 19, cost: 9.4e9, fd: 1.34 }, ...over,
});
const BOARD: StarForceBoard = {
  known: true, mvp: "none", events: [], budget: 10e9,
  items: [
    item("belt", "Gollux Belt", { star: 12, next: { pick: "—", success: 0.42, boom: 0 }, best: { from: 12, to: 17, cost: 637e6, fd: 0.87, perFd: 732e6 } }),
    item("hat", "Eternal Helm"),
    item("cape", "Arcane Cape", { star: 21, best: { from: 21, to: 22, cost: 29e9, fd: 0.81, perFd: null }, stop: { star: 21, cost: 0, fd: 0 } }),
  ],
};
const row = (from: number, to: number, over: Partial<StarForceDetail["rows"][number]> = {}) => ({ from, to, pick: "Mode 1", success: 0.1575, boom: 0.0674, tapCost: 255e6, avgCost: 2.88e9, fd: 0.65, perFd: 4.42e9, costFrom: 2.88e9, fdFrom: 0.65, ...over });
const DETAIL: StarForceDetail = {
  target: 18,
  rows: [row(17, 18), row(18, 19, { costFrom: 9.4e9 }), row(19, 20, { boom: 0.08425 }), row(20, 21, { success: 0.315, boom: 0.10275 }), row(21, 22, { boom: 0.126375 }), row(22, 23, { pick: "—" })],
  jumps: [{ from: 17, to: 18, cost: 2.88e9, fd: 0.65, perFd: 4.42e9 }, { from: 18, to: 19, cost: 6.5e9, fd: 0.68, perFd: 9.52e9 }, { from: 19, to: 21, cost: 22e9, fd: 1.4, perFd: 15.5e9 }, { from: 21, to: 22, cost: 29e9, fd: 0.8, perFd: 35.9e9 }, { from: 22, to: 23, cost: 67e9, fd: 0.7, perFd: 93.8e9 }],
  summary: { median: 1.28e9, average: 2.88e9, unlucky: [4.03e9, 7.48e9, 16.6e9], fd: 0.65, perFd: 4.42e9, medianBooms: 0, averageBooms: 0.49, anyBoom: 0.3, canBoom: true },
  graphs: { cost: { width: 1e8, bins: [0.16, 0.12, 0.05], marks: { median: 1.28e9, p75: 4.03e9, p90: 7.48e9, p99: 16.6e9 } }, booms: { width: 1, counts: [0.7, 0.2, 0.1], more: false }, perStar: [{ to: 18, avgCost: 2.88e9 }] },
};

function show(board: StarForceBoard = BOARD, routes: Record<string, unknown> = {}, path = "/gear/starforce") {
  const s = fakeServer({
    ...BASE_ROUTES,
    "GET /gear": GEAR,
    "GET /gear/:id/starforce": board,
    "GET /gear/:id/starforce/hat": DETAIL,
    "GET /gear/:id/starforce/belt": { ...DETAIL, target: 17 },
    "GET /gear/:id/starforce/cape": DETAIL,
    "PUT /gear/:id/hat/details": undefined,
    "PUT /gear/:id/belt/details": undefined,
    "PUT /settings": (body: object) => ({ theme: "ren", worldId: 45, blackFlamePrice: 3_000_000, mvp: "none", ...body }),
    "PUT /gear/:id/stat-values": undefined,
    ...routes,
  });
  renderWithApp(<App />, path);
  return s;
}
const itemRow = () => within(screen.getByRole("group", { name: /Items, cheapest/ }));
const cells = () => itemRow().getAllByRole("button").map((b) => b.closest(".flame-cell")!);
const asked = (s: ReturnType<typeof fakeServer>, start: string) => s.calls.filter((c) => c.method === "GET" && c.path.startsWith(start)).map((c) => c.path);
const pickHat = async () => {
  await screen.findByRole("group", { name: /Items, cheapest/ });
  await userEvent.click(itemRow().getByRole("button", { name: "Eternal Helm" }));
  return within(await screen.findByRole("region", { name: "Eternal Helm Star Force" }));
};

describe("the Star Force page: the item row", () => {
  it("a link with ?item= opens on that item (the Upgrades page's rows)", async () => {
    show(BOARD, {}, "/gear/starforce?item=hat");
    expect(await screen.findByRole("region", { name: "Eternal Helm Star Force" })).toBeTruthy();
  });

  it("cheapest first: each item's best jump (meso per 1% FD and its star) above, the next tap's success below, its stars on the icon", async () => {
    show();
    await screen.findByRole("group", { name: /Items, cheapest/ });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Star Force");
    expect(itemRow().getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Gollux Belt", "Eternal Helm", "Arcane Cape"]);
    expect(cells().map((c) => c.querySelector(".above")!.textContent)).toEqual(["732m", "4.42B", "—"]);
    expect(cells().map((c) => c.querySelector(".tiny")!.textContent)).toEqual(["→ 17★", "→ 18★", "→ 22★"]);
    expect(cells().map((c) => c.querySelector(".below")!.textContent)).toEqual(["42% next", "15.75% next", "15.75% next"]);
    expect(cells().map((c) => c.classList.contains("cheapest"))).toEqual([true, false, false]);
    expect(cells().map((c) => c.querySelector(".icon-stars")!.textContent)).toEqual(["12", "17", "21"]);
  });

  it("nothing is asked for before the characters are known; switching characters never shows the last one's items", async () => {
    const s = show(BOARD, { "GET /gear/2/starforce": () => new Promise(() => {}) });
    await screen.findByRole("group", { name: /Items, cheapest/ });
    expect(s.calls.some((c) => c.path.includes("undefined"))).toBe(false);
    await userEvent.click(screen.getByRole("tab", { name: /Second/ }));
    await waitFor(() => expect(screen.getByRole("tab", { name: /Second/ }).getAttribute("aria-selected")).toBe("true"));
    expect(screen.queryByRole("group", { name: /Items, cheapest/ })).toBeNull();
    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("no cheapest mark when even the first item has nothing to gain", async () => {
    show({ ...BOARD, items: [item("cape", "Arcane Cape", { best: { from: 21, to: 22, cost: 1, fd: 0, perFd: null } })] });
    await screen.findByRole("group", { name: /Items, cheapest/ });
    expect(cells()[0]!.classList.contains("cheapest")).toBe(false);
  });

  it("an item's plan starts at its best jump's star (the belt: 12→17★)", async () => {
    const s = show();
    await screen.findByRole("region", { name: "Gollux Belt Star Force" });
    await waitFor(() => expect(asked(s, "/gear/1/starforce/belt")).toContain("/gear/1/starforce/belt?events=&target=17"));
  });
});

describe("the Star Force page: one item", () => {
  it("the summary for the target, and each next star with its exact rates and the best jumps", async () => {
    const s = show();
    const p = await pickHat();
    await p.findByRole("group", { name: "Summary" });
    // the best jump's star to start with
    expect(asked(s, "/gear/1/starforce/hat")).toContain("/gear/1/starforce/hat?events=&target=18");
    const tiles = within(p.getByRole("group", { name: "Summary" }));
    for (const text of ["1.28B", "2.88B", "4.03B · 7.48B · 16.6B", "+0.65%", "4.42B per 1%", "0.49", "30%"]) expect(tiles.getByText(text)).toBeTruthy();
    const rows = p.getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell")[2]!.textContent)).toEqual(["15.75%", "15.75%", "15.75%", "31.5%", "15.75%", "15.75%"]);
    expect(rows.map((r) => within(r).getAllByRole("cell")[3]!.textContent)).toEqual(["6.74%", "6.74%", "8.425%", "10.275%", "12.6375%", "6.74%"]);
    // the best jumps: one cell per jump, 19→21★ spanning two rows; the first in gold
    const jumps = p.getAllByRole("cell").filter((c) => c.classList.contains("jump"));
    expect(jumps.map((c) => [c.querySelector("b")!.textContent, c.getAttribute("rowspan")])).toEqual([["17→18★", "1"], ["18→19★", "1"], ["19→21★", "2"], ["21→22★", "1"], ["22→23★", "1"]]);
    expect(jumps[0]!.classList.contains("first")).toBe(true);
    expect(rows[0]!.className).toContain("target");
  });

  it("no star on the way can boom: said so", async () => {
    show(BOARD, { "GET /gear/:id/starforce/hat": { ...DETAIL, summary: { ...DETAIL.summary, anyBoom: 0, canBoom: false } } });
    const p = await pickHat();
    expect(await p.findByText("no star up to 18★ can boom")).toBeTruthy();
  });

  it("a new target keeps showing the last numbers until its own come", async () => {
    show(BOARD, { "GET /gear/1/starforce/hat": (_: unknown, path: string) => (path.includes("target=18") ? DETAIL : new Promise(() => {})) });
    const p = await pickHat();
    await p.findByRole("group", { name: "Summary" });
    await userEvent.click(p.getByRole("button", { name: "20→21★" }));
    expect(p.getByRole("group", { name: "Summary" })).toBeTruthy();
    expect(p.queryByText("Working it out…")).toBeNull();
  });

  it("clicking a row plans to its star", async () => {
    const s = show();
    const p = await pickHat();
    await p.findByRole("group", { name: "Summary" });
    await userEvent.click(p.getByRole("button", { name: "20→21★" }));
    await waitFor(() => expect(asked(s, "/gear/1/starforce/hat")).toContain("/gear/1/starforce/hat?events=&target=21"));
  });

  it("stars: picked, then saved (with the item's other details), like on Equipment; Cancel puts them back", async () => {
    const s = show();
    const p = await pickHat();
    const stars = within(p.getByRole("group", { name: "Star Force" }));
    expect(p.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
    await userEvent.click(stars.getByRole("button", { name: "21 stars" }));
    expect(p.getByText(/Unsaved/)).toBeTruthy();
    await userEvent.click(p.getByRole("button", { name: "Cancel" }));
    expect(p.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
    await userEvent.click(stars.getByRole("button", { name: "21 stars" }));
    await userEvent.click(p.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(s.sent("PUT", "/gear/1/hat/details")).toEqual([{ stars: 21, flames: { STR: 6 }, potential: null, hammers: 1 }]));
    // the numbers load again (the new star, the new order)
    await waitFor(() => expect(asked(s, "/gear/1/starforce?").length).toBeGreaterThanOrEqual(2));
  });

  it("the boom cost (plain meso) and the boxes save at once with the item's other details", async () => {
    const s = show();
    const p = await pickHat();
    const box = p.getByRole("spinbutton", { name: "Boom cost (meso)" });
    await userEvent.clear(box);
    await userEvent.type(box, "1500000000{Enter}");
    await waitFor(() => expect(s.sent("PUT", "/gear/1/hat/details")).toEqual([{ stars: 17, flames: { STR: 6 }, potential: null, hammers: 1, boomCost: 1_500_000_000 }]));
    const four = within(p.getByRole("group", { name: "Too rare to risk" })).getByRole("checkbox", { name: "Modes 4 4 4 4" });
    await userEvent.click(four);
    // ticked at once, before the save comes back
    expect(four).toHaveProperty("checked", true);
    await waitFor(() => expect(s.sent("PUT", "/gear/1/hat/details")).toHaveLength(2));
    expect(s.sent("PUT", "/gear/1/hat/details")[1]).toMatchObject({ safety: "4444" });
    // nonsense goes back unsaved
    await userEvent.clear(box);
    await userEvent.type(box, "-3{Enter}");
    expect(s.sent("PUT", "/gear/1/hat/details")).toHaveLength(2);
  });

  it("a cost typed and then a box ticked straight away: the last save has both", async () => {
    const s = show();
    const p = await pickHat();
    await userEvent.clear(p.getByRole("spinbutton", { name: "Boom cost (meso)" }));
    await userEvent.type(p.getByRole("spinbutton", { name: "Boom cost (meso)" }), "500000000");
    await userEvent.click(within(p.getByRole("group", { name: "Too rare to risk" })).getByRole("checkbox", { name: "Modes 1 1 4 4" }));
    await waitFor(() => expect(s.sent("PUT", "/gear/1/hat/details").at(-1)).toMatchObject({ boomCost: 500_000_000, safety: "1144" }));
  });

  it("an item with nothing saved yet starts its details at the stars it comes with", async () => {
    const s = show({ ...BOARD, items: [item("belt", "Gollux Belt", { star: 22, min: 22 })] });
    await screen.findByRole("group", { name: /Items, cheapest/ });
    const p = within(await screen.findByRole("region", { name: "Gollux Belt Star Force" }));
    await userEvent.click(within(p.getByRole("group", { name: "Too rare to risk" })).getByRole("checkbox", { name: "Modes 1 1 4 4" }));
    await waitFor(() => expect(s.sent("PUT", "/gear/1/belt/details")).toEqual([{ stars: 22, flames: {}, potential: null, hammers: 0, safety: "1144" }]));
  });
});

describe("the Star Force page: events and MVP", () => {
  it("events are checkboxes, any combination, sent in a fixed order; the MVP tier is a saved setting", async () => {
    const s = show();
    await screen.findByRole("group", { name: /Items, cheapest/ });
    await userEvent.click(screen.getByRole("checkbox", { name: "30% fewer booms" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "30% off" }));
    await waitFor(() => expect(asked(s, "/gear/1/starforce?")).toContain("/gear/1/starforce?events=thirtyOff,fewerBooms&budget=10000000000"));
    await userEvent.click(screen.getByRole("checkbox", { name: "30% off" }));
    await waitFor(() => expect(asked(s, "/gear/1/starforce?").at(-1)).toBe("/gear/1/starforce?events=fewerBooms&budget=10000000000"));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "MVP" }), "diamond");
    await waitFor(() => expect(s.sent("PUT", "/settings")).toEqual([{ mvp: "diamond" }]));
  });
});

describe("the Star Force page: staying on the item", () => {
  it("a save that re-orders the row keeps the panel on the item saved, and its plan", async () => {
    let saved = false;
    // the hat is first (shown without a click); after the save it's the dearer one: the board comes back re-sorted
    const first = { ...BOARD, items: [item("hat", "Eternal Helm"), item("belt", "Gollux Belt", { star: 12 })] };
    const after = { ...BOARD, items: [item("belt", "Gollux Belt", { star: 12 }), item("hat", "Eternal Helm", { star: 18 })] };
    const s = show(first, { "GET /gear/:id/starforce": () => (saved ? after : first), "PUT /gear/:id/hat/details": () => { saved = true; return undefined; } });
    const p = within(await screen.findByRole("region", { name: "Eternal Helm Star Force" }));
    await userEvent.click(within(p.getByRole("group", { name: "Star Force" })).getByRole("button", { name: "18 stars" }));
    await userEvent.click(p.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(asked(s, "/gear/1/starforce?").length).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(itemRow().getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Gollux Belt", "Eternal Helm"]));
    // still the hat, not the new first item
    expect(screen.getByRole("region", { name: "Eternal Helm Star Force" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Gollux Belt Star Force" })).toBeNull();
  });

  it("another item starts at its own best jump, not the last item's target", async () => {
    const s = show();
    const p = await pickHat();
    await p.findByRole("group", { name: "Summary" });
    await userEvent.click(p.getByRole("button", { name: "21→22★" }));
    await userEvent.click(itemRow().getByRole("button", { name: "Gollux Belt" }));
    await waitFor(() => expect(asked(s, "/gear/1/starforce/belt").at(-1)).toBe("/gear/1/starforce/belt?events=&target=17"));
  });

  it("switching world starts afresh (no item or target carried over)", async () => {
    const s = show();
    const p = await pickHat();
    await p.findByRole("group", { name: "Summary" });
    await userEvent.click(p.getByRole("button", { name: "21→22★" }));
    await userEvent.click(screen.getByRole("button", { name: "Hyperion" }));
    await waitFor(() => expect(s.sent("PUT", "/settings")).toEqual([{ worldId: 70 }]));
    // back to the first item (the belt), at its best jump
    expect(await screen.findByRole("region", { name: "Gollux Belt Star Force" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Eternal Helm Star Force" })).toBeNull();
    await waitFor(() => expect(asked(s, "/gear/1/starforce/belt").at(-1)).toBe("/gear/1/starforce/belt?events=&target=17"));
  });

  it("the MVP menu shows the setting as soon as it's saved, before the numbers come back", async () => {
    // (the board keeps saying "none": only the saved setting says gold)
    show();
    await screen.findByRole("group", { name: /Items, cheapest/ });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "MVP" }), "gold");
    await waitFor(() => expect((screen.getByRole("combobox", { name: "MVP" }) as HTMLSelectElement).value).toBe("gold"));
  });
});

describe("the Star Force page: new settings", () => {
  it("an event ticked keeps showing the last numbers until the new ones come", async () => {
    show(BOARD, { "GET /gear/1/starforce": (_: unknown, path: string) => (path.includes("events=&") ? BOARD : new Promise(() => {})) });
    await screen.findByRole("group", { name: /Items, cheapest/ });
    await userEvent.click(screen.getByRole("checkbox", { name: "30% off" }));
    expect(screen.getByRole("group", { name: /Items, cheapest/ })).toBeTruthy();
    expect(screen.queryByText("Loading…")).toBeNull();
  });
});

describe("the Star Force page: the graph", () => {
  it("the cost to reach the target, booms on the way, cost per star (one step: a sentence)", async () => {
    show();
    await pickHat();
    const g = within(await screen.findByRole("region", { name: "Star Force graph" }));
    expect(g.getByRole("img", { name: "Cost to reach it" })).toBeTruthy();
    expect(g.getByText(/median 1.28B/)).toBeTruthy();
    await userEvent.click(g.getByRole("button", { name: "Booms on the way" }));
    expect(g.getByRole("img", { name: "Booms on the way" })).toBeTruthy();
    await userEvent.click(g.getByRole("button", { name: "Cost per star" }));
    expect(g.getByText(/Just one step \(to 18★\)/)).toBeTruthy();
  });

  it("every run costing the same: a sentence instead of a spike", async () => {
    show(BOARD, { "GET /gear/:id/starforce/hat": { ...DETAIL, graphs: { ...DETAIL.graphs, cost: { ...DETAIL.graphs.cost, marks: { median: 41000, p75: 41000, p90: 41000, p99: 41000 } } } } });
    await pickHat();
    expect(await within(await screen.findByRole("region", { name: "Star Force graph" })).findByText(/Nearly every run costs the same here: about 41k/)).toBeTruthy();
  });

  it("many boom counts are drawn as ranges", async () => {
    show(BOARD, { "GET /gear/:id/starforce/hat": { ...DETAIL, graphs: { ...DETAIL.graphs, booms: { width: 1000, counts: [0.5, 0.3, 0.2], more: true } } } });
    await pickHat();
    const g = within(await screen.findByRole("region", { name: "Star Force graph" }));
    await userEvent.click(g.getByRole("button", { name: "Booms on the way" }));
    expect(g.getAllByText("2,000").length).toBeGreaterThan(0);
  });
});

describe("the Star Force page: Targets", () => {
  it("each item's stop star for the budget, with what getting there costs and adds, or ✓ there; a preset asks again", async () => {
    const s = show();
    await screen.findByRole("group", { name: /Items, cheapest/ });
    await userEvent.click(screen.getByRole("button", { name: "Targets" }));
    const t = within(screen.getByRole("region", { name: "Targets" }));
    const rows = t.getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell")[3]!.textContent)).toEqual(["19★", "19★", "21★"]);
    expect(within(rows[1]!).getByText("9.40B · +1.34% final damage")).toBeTruthy();
    expect(within(rows[2]!).getByText("✓ there")).toBeTruthy();
    await userEvent.click(t.getByRole("button", { name: "40B" }));
    await waitFor(() => expect(asked(s, "/gear/1/starforce?")).toContain("/gear/1/starforce?events=&budget=40000000000"));
  });
});

describe("the Star Force page: nothing to show", () => {
  it("a job the list doesn't know, or nothing that can take more stars", async () => {
    show({ ...BOARD, known: false, items: [] });
    expect(await screen.findByText(/isn't in the item list yet/)).toBeTruthy();
  });

  it("no items", async () => {
    show({ ...BOARD, items: [] });
    expect(await screen.findByText(/No equipped items that can take more stars/)).toBeTruthy();
  });
});
