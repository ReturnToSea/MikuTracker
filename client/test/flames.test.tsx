import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { useUpdateSettings } from "../src/api/hooks";
import type { FlameItem, FlamesBoard, GearBoard, GearCharacter } from "../src/api/types";
import { BASE_ROUTES, fakeServer, renderWithApp } from "./server";

// A made-up character with three flameable items. The numbers are the server's to work out (tested
// there); here, what the page shows and sends.
const VALUES = { att: 4, allStat: 10, secRatio: 0.125, bossDmg: 12, fdPer100: 0.785 };
const char = (id: number, name: string, extra: Partial<GearCharacter> = {}): GearCharacter => ({ id, name, job: "Ren", level: 279, avatar: null, knownJob: true, fits: [], equipped: {}, details: {}, statValues: VALUES, ...extra });
// The window's slots, as the server sends them (the Equipment page needs them).
const SLOTS = ["ring1", "hat", "emblem", "ring2", "pendant1", "face", "badge", "ring3", "pendant2", "eye", "earrings", "medal", "ring4", "weapon", "top", "shoulder", "secondary", "pocket", "belt", "bottom", "gloves", "android", "shoes", "cape", "heart", "ringP", "totem1", "totem2", "totem3"].map((key) => ({ key, label: key, kind: key.replace(/\d$|P$/, "") }));
const GEAR: GearBoard = { generated: "2026-10-24", slots: SLOTS, items: [], jobs: {}, characters: [char(1, "RemyRabbit", { details: { hat: { stars: 17, flames: { STR: 6 }, potential: null, hammers: 1 } } }), char(2, "Second")] };

const grid = [
  { stat: "STR", values: [null, null, 33, 44, 55, 66, 77] },
  { stat: "DEX", values: [null, null, 33, 44, 55, 66, 77] },
  { stat: "ATT", values: [null, null, 3, 4, 5, 6, 7] },
] as FlameItem["grid"];
const weights = { STR: 1, DEX: 0.125, ATT: 4 } as unknown as FlameItem["weights"];
const metrics = (over: Partial<FlameItem["metrics"]> = {}): FlameItem["metrics"] => ({
  better: 0.2124, beats: 0.75, gain: 4.7, gainIfBetter: 22.1, flamesToBetter: 4.7, mesoToBetter: 14_120_000, mesoPerFd: 81_300_000,
  flamesForChance: [{ chance: 0.25, flames: 2 }, { chance: 0.5, flames: 3 }, { chance: 0.7, flames: 6 }, { chance: 0.99, flames: 20 }],
  ...over,
});
const item = (slot: string, name: string, over: Partial<FlameItem> = {}): FlameItem => ({
  slot, name, icon: `/item-icons/${slot}.png`, level: 200, boss: true, starMin: 0, grid, weights, flames: {}, score: 0, best: 236.25, metrics: metrics(), stop: { score: 148.5, reached: false, flames: 265.6, meso: 796_800_000 }, ...over,
});
const BOARD: FlamesBoard = {
  known: true, price: 3_000_000, budget: 10e9,
  items: [
    item("gloves", "Arcane Gloves", { score: 75.5, metrics: metrics({ mesoPerFd: 81_300_000, better: 0.2124 }) }),
    item("weapon", "Genesis Sword", { starMin: 22, score: 896, best: 1169, metrics: metrics({ mesoPerFd: 7_150_000_000, better: 0.0011 }) }),
    item("hat", "Arcane Hat", { flames: { STR: 6 }, score: 66, metrics: metrics({ mesoPerFd: 31_400_000_000, better: 0.0013 }), stop: { score: 148.5, reached: true, flames: 100, meso: 300_000_000 } }),
  ],
};
const GRAPH = { distribution: [[0, 0.5], [33, 0.3], [66, 0.2]], curves: [{ score: 0, gain: 30, mesoPerScore: 100_000 }, { score: 33, gain: 13, mesoPerScore: 230_000 }, { score: 66, gain: 0, mesoPerScore: null }] };

function show(board: FlamesBoard = BOARD, routes: Record<string, unknown> = {}) {
  const s = fakeServer({ ...BASE_ROUTES, "GET /gear": GEAR, "GET /gear/:id/flames": board, "GET /gear/:id/flames/hat": GRAPH, "GET /gear/:id/flames/gloves": GRAPH, "GET /gear/:id/flames/weapon": GRAPH, "PUT /gear/:id/hat/details": undefined, "PUT /gear/:id/weapon/details": undefined, "PUT /settings": (body: object) => ({ theme: "ren", worldId: 45, blackFlamePrice: 3_000_000, ...body }), ...routes });
  renderWithApp(<App />, "/gear/flames");
  return s;
}
const row = () => within(screen.getByRole("group", { name: /Items, cheapest/ }));
const cells = () => row().getAllByRole("button").map((b) => b.closest(".flame-cell")!);
const panel = (name: RegExp) => within(screen.getByRole("region", { name }));

describe("the Flames page: the item row", () => {
  it("only the board's items, cheapest first, the meso per 1% final damage above and the chance of better below; the cheapest marked", async () => {
    const s = show();
    await screen.findByRole("group", { name: /Items, cheapest/ });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Flames");
    expect(row().getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Arcane Gloves", "Genesis Sword", "Arcane Hat"]);
    expect(cells().map((c) => c.querySelector(".above")!.textContent)).toEqual(["81m", "7.15B", "31.4B"]);
    expect(cells().map((c) => c.querySelector(".below")!.textContent)).toEqual(["21% better", "0.1% better", "0.1% better"]);
    expect(cells().map((c) => c.classList.contains("cheapest"))).toEqual([true, false, false]);
    expect(row().getAllByRole("button")[0]!.querySelector("img")!.getAttribute("src")).toBe("/item-icons/gloves.png");
    // nothing is asked for before the characters are known
    expect(s.calls.some((c) => c.path.includes("undefined"))).toBe(false);
  });

  it("no cheapest mark when even the first item can't be improved", async () => {
    show({ ...BOARD, items: [item("hat", "Arcane Hat", { metrics: metrics({ mesoPerFd: null, better: 0 }) })] });
    await screen.findByRole("group", { name: /Items, cheapest/ });
    expect(cells()[0]!.classList.contains("cheapest")).toBe(false);
    expect(cells()[0]!.querySelector(".above")!.textContent).toBe("—");
  });

  it("the first item is shown to start with; clicking another shows it", async () => {
    show();
    expect(await screen.findByRole("region", { name: "Arcane Gloves flames" })).toBeTruthy();
    await userEvent.click(row().getByRole("button", { name: "Arcane Hat" }));
    expect(screen.getByRole("region", { name: "Arcane Hat flames" })).toBeTruthy();
    expect(row().getByRole("button", { name: "Arcane Hat" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("the Flames page: one item", () => {
  it("its score, best, and what a flame would do", async () => {
    show();
    const p = within(await screen.findByRole("region", { name: "Arcane Gloves flames" }));
    expect(p.getByText(/75\.5/)).toBeTruthy();
    expect(p.getByText(/236\.3 best · beats 75% of rolls/)).toBeTruthy();
    expect(p.getByText("81m")).toBeTruthy(); // meso per 1% final damage
    expect(p.getByText("14m")).toBeTruthy(); // to any better roll
    expect(p.getByText(/≈ 4\.7 flames on average/)).toBeTruthy();
    expect(p.getByText("+22.1")).toBeTruthy();
    // flames for 25 / 50 / 70 / 99%, each with its meso at 3m a flame
    const chances = [...p.getByRole("group", { name: /Flames needed/ }).querySelectorAll("b")].map((b) => b.textContent!.replace(/\s+/g, " ").trim());
    expect(chances).toEqual(["2 · 6m", "3 · 9m", "6 · 18m", "20 · 60m"]);
  });

  it("clicking flames changes nothing until Save; Save sends the flames with the item's other saved details", async () => {
    const s = show();
    await screen.findByRole("group", { name: /Items, cheapest/ });
    await userEvent.click(row().getByRole("button", { name: "Arcane Hat" }));
    const p = panel(/Arcane Hat flames/);
    expect(p.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
    await userEvent.click(p.getByRole("button", { name: "ATT tier 7: 7" }));
    expect(p.getByText(/Unsaved changes/)).toBeTruthy();
    expect(p.getByText(/^66/)).toBeTruthy(); // the score is still the saved one
    await userEvent.click(p.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(s.sent("PUT", "/gear/1/hat/details")).toEqual([{ stars: 17, flames: { STR: 6, ATT: 7 }, potential: null, hammers: 1 }]));
    // the board and the gear load again (the new score and order come from the server)
    await waitFor(() => expect(s.calls.filter((c) => c.path.startsWith("/gear/1/flames?")).length).toBeGreaterThanOrEqual(2));
  });

  it("an item with nothing saved yet starts at the stars it comes with; Cancel puts the flames back", async () => {
    const s = show();
    await screen.findByRole("group", { name: /Items, cheapest/ });
    await userEvent.click(row().getByRole("button", { name: "Genesis Sword" }));
    const p = panel(/Genesis Sword flames/);
    await userEvent.click(p.getByRole("button", { name: "STR tier 5: 55" }));
    await userEvent.click(p.getByRole("button", { name: "Cancel" }));
    expect(p.getByRole("button", { name: "STR tier 5: 55" }).getAttribute("aria-pressed")).toBe("false");
    expect(p.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
    await userEvent.click(p.getByRole("button", { name: "STR tier 5: 55" }));
    await userEvent.click(p.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(s.sent("PUT", "/gear/1/weapon/details")).toEqual([{ stars: 22, flames: { STR: 5 }, potential: null, hammers: 0 }]));
  });

  it("switching items drops unsaved clicks", async () => {
    show();
    await screen.findByRole("group", { name: /Items, cheapest/ });
    await userEvent.click(panel(/Arcane Gloves flames/).getByRole("button", { name: "DEX tier 4: 44" }));
    await userEvent.click(row().getByRole("button", { name: "Arcane Hat" }));
    await userEvent.click(row().getByRole("button", { name: "Arcane Gloves" }));
    expect(panel(/Arcane Gloves flames/).getByRole("button", { name: "DEX tier 4: 44" }).getAttribute("aria-pressed")).toBe("false");
  });
});

describe("the Flames page: staying on the item", () => {
  it("a save that re-orders the row keeps the panel on the item saved", async () => {
    let saved = false;
    const first = { ...BOARD, items: [item("hat", "Arcane Hat"), item("gloves", "Arcane Gloves")] };
    const after = { ...BOARD, items: [item("gloves", "Arcane Gloves"), item("hat", "Arcane Hat", { flames: { ATT: 7 } })] };
    show(first, { "GET /gear/:id/flames": () => (saved ? after : first), "PUT /gear/:id/hat/details": () => { saved = true; return undefined; } });
    const p = within(await screen.findByRole("region", { name: "Arcane Hat flames" }));
    await userEvent.click(p.getByRole("button", { name: "ATT tier 7: 7" }));
    await userEvent.click(p.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(row().getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Arcane Gloves", "Arcane Hat"]));
    expect(screen.getByRole("region", { name: "Arcane Hat flames" })).toBeTruthy();
  });
});

describe("the Flames page: the graph", () => {
  it("the distribution to start with; the switch changes the series", async () => {
    show();
    const g = within(await screen.findByRole("region", { name: "One flame's score" }));
    expect(await g.findByRole("img", { name: "Distribution" })).toBeTruthy();
    expect(g.getByText(/\(3 of them\)/)).toBeTruthy();
    await userEvent.click(g.getByRole("button", { name: "Cost curve (+1 score)" }));
    expect(g.getByRole("img", { name: "Cost curve (+1 score)" })).toBeTruthy();
    await userEvent.click(g.getByRole("button", { name: "E[Gain] curve" }));
    expect(g.getByRole("img", { name: "E[Gain] curve" })).toBeTruthy();
    expect(g.getByText(/your score 75\.5/)).toBeTruthy();
  });
});

describe("the Flames page: the price and the stat values", () => {
  it("the Black Flame price is typed in millions and saved as whole meso; nonsense goes back", async () => {
    const s = show();
    const box = (await screen.findByRole("spinbutton", { name: /Black Flame price/ })) as HTMLInputElement;
    expect(box.value).toBe("3");
    await userEvent.clear(box);
    await userEvent.type(box, "4.5{Enter}");
    await waitFor(() => expect(s.sent("PUT", "/settings")).toEqual([{ blackFlamePrice: 4_500_000 }]));
    // the price changes every cost: the numbers load again
    await waitFor(() => expect(s.calls.filter((c) => c.path.startsWith("/gear/1/flames?")).length).toBeGreaterThanOrEqual(2));
    await userEvent.clear(box);
    await userEvent.type(box, "-2{Enter}");
    expect(s.sent("PUT", "/settings")).toHaveLength(1);
  });

  it("the character's stat values can be changed here too", async () => {
    const s = show(BOARD, { "PUT /gear/:id/stat-values": undefined });
    const v = within(await screen.findByRole("group", { name: "Stat values" }));
    const att = v.getByRole("spinbutton", { name: "1 ATT =" });
    await userEvent.clear(att);
    await userEvent.type(att, "3{Enter}");
    await waitFor(() => expect(s.sent("PUT", "/gear/1/stat-values")).toEqual([{ ...VALUES, att: 3 }]));
  });
});

describe("the Flames page: Targets", () => {
  it("each item's stop score for the budget: reached, or the flames and meso to get there; a preset asks again", async () => {
    const s = show();
    await screen.findByRole("group", { name: /Items, cheapest/ });
    await userEvent.click(screen.getByRole("button", { name: "Targets" }));
    const t = within(screen.getByRole("region", { name: "Targets" }));
    const rows = t.getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell")[1]!.textContent)).toEqual(["Arcane Gloves", "Genesis Sword", "Arcane Hat"]);
    expect(within(rows[0]!).getByText("≈ 265.6 flames · 797m")).toBeTruthy();
    expect(within(rows[2]!).getByText("✓ reached")).toBeTruthy();
    expect(t.getByRole("button", { name: "10B" }).getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(t.getByRole("button", { name: "2.5B" }));
    await waitFor(() => expect(s.calls.some((c) => c.path === "/gear/1/flames?budget=2500000000")).toBe(true));
    const budget = t.getByRole("spinbutton", { name: /Budget/ });
    await userEvent.clear(budget);
    await userEvent.type(budget, "7{Enter}");
    await waitFor(() => expect(s.calls.some((c) => c.path === "/gear/1/flames?budget=7000000000")).toBe(true));
  });
});

describe("the Flames page: nothing to show", () => {
  it("a job the list doesn't know, or no flameable items, says so", async () => {
    show({ known: false, price: 3e6, budget: 10e9, items: [] });
    expect(await screen.findByText(/isn't in the item list yet/)).toBeTruthy();
  });

  it("no flameable items", async () => {
    show({ ...BOARD, items: [] });
    expect(await screen.findByText(/No equipped items that can have flames/)).toBeTruthy();
  });
});

describe("switching characters", () => {
  it("clears a failed save's message (it was about the other character)", async () => {
    show(BOARD, { "PUT /gear/:id/hat/details": () => new Response(JSON.stringify({ error: "This item can't roll ATT at tier 7" }), { status: 400 }) });
    await screen.findByRole("group", { name: /Items, cheapest/ });
    await userEvent.click(row().getByRole("button", { name: "Arcane Hat" }));
    await userEvent.click(panel(/Arcane Hat flames/).getByRole("button", { name: "ATT tier 7: 7" }));
    await userEvent.click(panel(/Arcane Hat flames/).getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "This item can't roll ATT at tier 7");
    await userEvent.click(screen.getByRole("tab", { name: /Second/ }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("never shows the last character's items while the new one's load", async () => {
    show(BOARD, { "GET /gear/2/flames": () => new Promise(() => {}) });
    await screen.findByRole("group", { name: /Items, cheapest/ });
    await userEvent.click(screen.getByRole("tab", { name: /Second/ }));
    await waitFor(() => expect(screen.getByRole("tab", { name: /Second/ }).getAttribute("aria-selected")).toBe("true"));
    expect(screen.queryByRole("group", { name: /Items, cheapest/ })).toBeNull();
    expect(screen.getByText("Loading…")).toBeTruthy();
  });
});

describe("the Gear pages share the picked character", () => {
  it("picking a character on Flames keeps it on Equipment", async () => {
    show();
    await screen.findByRole("group", { name: /Items, cheapest/ });
    await userEvent.click(screen.getByRole("tab", { name: /Second/ }));
    await waitFor(() => expect(screen.getByRole("tab", { name: /Second/ }).getAttribute("aria-selected")).toBe("true"));
    await userEvent.click(within(screen.getByRole("group", { name: "Gear pages" })).getByRole("link", { name: "Equipment" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Gear"));
    expect(screen.getByRole("tab", { name: /Second/ }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("the rail on a narrow window", () => {
  it("pressing Gear while on a Gear page opens its menu without leaving the page", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("max-width"), media: q, addEventListener() {}, removeEventListener() {} }));
    show();
    await screen.findByRole("group", { name: /Items, cheapest/ });
    const gear = screen.getAllByRole("link").find((l) => l.classList.contains("tab") && l.textContent!.startsWith("Gear"))!;
    await userEvent.click(gear);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Flames");
    expect(gear.closest(".rail-group")!.classList.contains("menu")).toBe(true);
    // picking a page closes it
    await userEvent.click(within(screen.getByRole("group", { name: "Gear pages" })).getByRole("link", { name: "Equipment" }));
    expect(gear.closest(".rail-group")!.classList.contains("menu")).toBe(false);
    // so does going to another tab
    await userEvent.click(gear);
    expect(gear.closest(".rail-group")!.classList.contains("menu")).toBe(true);
    await userEvent.click(screen.getAllByRole("link").find((l) => l.classList.contains("tab") && l.textContent === "Home")!);
    expect(gear.closest(".rail-group")!.classList.contains("menu")).toBe(false);
  });
});

describe("saving settings", () => {
  it("only the Black Flame price makes the Flames numbers out of date, only the MVP tier the Star Force ones; not the theme or the world", async () => {
    fakeServer({ "PUT /settings": (body: object) => ({ theme: "ren", worldId: 45, blackFlamePrice: 3_000_000, mvp: "none", ...body }) });
    const qc = new QueryClient();
    qc.setQueryData(["flames", 1, 10e9], BOARD);
    qc.setQueryData(["starforce", 1, "", 10e9], {});
    qc.setQueryData(["gear", 45], GEAR);
    const { result } = renderHook(() => useUpdateSettings(), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> });
    const outOfDate = () => qc.getQueryState(["flames", 1, 10e9])!.isInvalidated;
    await act(() => result.current.mutateAsync({ theme: "pochacco" }));
    await act(() => result.current.mutateAsync({ worldId: 70 }));
    expect(outOfDate()).toBe(false);
    const sfOutOfDate = () => qc.getQueryState(["starforce", 1, "", 10e9])!.isInvalidated;
    // the theme and world saves above left both current
    expect(sfOutOfDate()).toBe(false);
    await act(() => result.current.mutateAsync({ mvp: "gold" }));
    // the MVP tier: the Star Force numbers, not the Flames ones
    expect([sfOutOfDate(), outOfDate()]).toEqual([true, false]);
    await act(() => result.current.mutateAsync({ blackFlamePrice: 4_000_000 }));
    expect(outOfDate()).toBe(true);
    // only the Flames numbers: the gear board is still current
    expect(qc.getQueryState(["gear", 45])!.isInvalidated).toBe(false);
  });
});
