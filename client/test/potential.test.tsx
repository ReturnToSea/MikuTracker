import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App";
import type { CubeMetrics, GearBoard, GearCharacter, PotentialBoard, PotentialGraph, PotentialItem } from "../src/api/types";
import { BASE_ROUTES, fakeServer, renderWithApp } from "./server";

// A made-up character with three items that can have potential. The numbers are the server's to work
// out (tested there); here, what the page shows and sends.
const VALUES = { att: 4, allStat: 14.65, secRatio: 0.125, bossDmg: 12, fdPer100: 0.785, strPct: null, dexPct: null, intPct: null, lukPct: null, hpPct: null, attPct: 53.82, critDmg: 42.38, ied300: 15.6, ied380: 20.52, bossDef: 380 as const, cd2: null, cd3: null, cd4: null, cd5: null, cd6: null, cdMin: 0 as const };
const char = (id: number, name: string, extra: Partial<GearCharacter> = {}): GearCharacter => ({ id, name, job: "Ren", level: 279, avatar: null, knownJob: true, fits: [], equipped: {}, details: {}, statBoxes: { pct: [{ stat: "STR" as const, field: "strPct" as const, main: true, default: 12.97 }, { stat: "DEX" as const, field: "dexPct" as const, main: false, default: 1.68 }], magic: false, secondary: true, allStat: true }, statValues: VALUES, ...extra });
const SLOTS = ["ring1", "hat", "emblem", "ring2", "pendant1", "face", "badge", "ring3", "pendant2", "eye", "earrings", "medal", "ring4", "weapon", "top", "shoulder", "secondary", "pocket", "belt", "bottom", "gloves", "android", "shoes", "cape", "heart", "ringP", "totem1", "totem2", "totem3"].map((key) => ({ key, label: key, kind: key.replace(/\d$|P$/, "") }));
const GEAR: GearBoard = { generated: "2026-10-24", slots: SLOTS, items: [], jobs: {}, characters: [char(1, "RemyRabbit", { details: { hat: { stars: 17, flames: { STR: 6 }, potential: { rank: "legendary", lines: ["STR +13%", "STR +10%", "STR +10%"] }, hammers: 1 } } }), char(2, "Second")] };

const metrics = (over: Partial<CubeMetrics & { price: number }> = {}): CubeMetrics & { price: number } => ({
  better: 0.0015, rankUp: 0, cubesToBetter: 676, mesoToBetter: 8_110_000_000, gainIfBetter: 96.3, fdIfBetter: 0.76, mesoPerFd: 10_700_000_000, price: 12_000_000,
  cubesForChance: [{ chance: 0.25, cubes: 195 }, { chance: 0.5, cubes: 469 }, { chance: 0.7, cubes: 814 }, { chance: 0.99, cubes: 3112 }],
  ...over,
});
const options = { rare: [["STR +3%", "DEX +3%"], ["STR +3%", "DEX +3%"], ["STR +3%", "DEX +3%"]], legendary: [["STR +13%", "DEX +13%"], ["STR +13%", "STR +10%", "DEX +10%"], ["STR +13%", "STR +10%", "DEX +10%"]] };
const points = { "STR +3%": 38.91, "DEX +3%": 5.04, "STR +13%": 168.61, "STR +10%": 129.7, "DEX +13%": 21.84, "DEX +10%": 16.8 };
const item = (slot: string, name: string, over: Partial<PotentialItem> = {}): PotentialItem => ({
  slot, name, icon: `/item-icons/${slot}.png`, level: 200, starMin: 0, rank: "legendary", lines: ["STR +13%", "STR +10%", "STR +10%"], options, points, ied: 20.52, score: 428.01, best: 505.83,
  cubes: { glowing: metrics(), bright: metrics({ better: 0.0019, cubesToBetter: 535, mesoToBetter: 11_800_000_000, mesoPerFd: 13_400_000_000, price: 22_000_000 }) }, cooldown: null, cheaper: "glowing",
  stop: { score: 421.2, reached: true, cube: "glowing", cubes: 840, meso: 10_080_000_000 }, ...over,
});
const BOARD: PotentialBoard = {
  known: true, budget: 10e9, prices: { glowing: 12_000_000, bright: 22_000_000 },
  items: [
    item("belt", "Gollux Belt", { level: 150, rank: null, lines: [null, null, null], score: 0, cubes: { glowing: metrics({ better: 0.68, rankUp: 0.14, mesoPerFd: 149_000_000 }), bright: metrics({ better: 0.68, rankUp: 0.17, mesoPerFd: 239_000_000 }) }, stop: { score: 250.5, reached: false, cube: "glowing", cubes: 83.6, meso: 1_003_000_000 } }),
    item("hat", "Arcane Hat"),
    item("top", "Eternal Armor", { cheaper: "bright", cubes: { glowing: metrics({ mesoPerFd: 416_000_000_000 }), bright: metrics({ better: 0.00025, mesoPerFd: 323_800_000_000 }) } }),
  ],
};
const GRAPH: PotentialGraph = {
  cubes: {
    glowing: { distribution: [[0, 0.5], [168.61, 0.3], [428.01, 0.15], [505.83, 0.05]], short: 0, curves: [{ score: 0, gain: 30, mesoPerScore: 400_000 }, { score: 300, gain: 1, mesoPerScore: 12_000_000 }] },
    bright: { distribution: [[0, 0.4], [168.61, 0.4], [505.83, 0.2]], short: 0, curves: [{ score: 0, gain: 40, mesoPerScore: 550_000 }, { score: 300, gain: 2, mesoPerScore: 11_000_000 }] },
  },
  target: null,
};

function show(board: PotentialBoard = BOARD, routes: Record<string, unknown> = {}, path = "/gear/potential") {
  // the graph, with what reaching a target costs when one is asked for
  const graph = (_: unknown, path: string) => (path.includes("target=") ? { ...GRAPH, target: { score: Number(/target=([\d.]+)/.exec(path)![1]), cubes: { glowing: { cubes: 6806, meso: 81_700_000_000 }, bright: null } } } : GRAPH);
  const s = fakeServer({ ...BASE_ROUTES, "GET /gear": GEAR, "GET /gear/:id/potential": board, "GET /gear/:id/potential/belt": graph, "GET /gear/:id/potential/hat": graph, "GET /gear/:id/potential/top": graph, "PUT /gear/:id/hat/details": undefined, "PUT /gear/:id/belt/details": undefined, ...routes });
  renderWithApp(<App />, path);
  return s;
}
const row = () => within(screen.getByRole("group", { name: /Items, cheapest/ }));
const cells = () => row().getAllByRole("button").map((b) => b.closest(".flame-cell")!);
const panel = (name: RegExp) => within(screen.getByRole("region", { name }));
const tile = (label: string) => screen.getByText(label).closest(".flame-tile")!;

describe("the Potential page: the item row", () => {
  it("a link with ?item= opens on that item (the Upgrades page's rows)", async () => {
    show(BOARD, {}, "/gear/potential?item=top");
    expect(await screen.findByRole("region", { name: /Eternal Armor potential/ })).toBeTruthy();
  });

  it("a link's events open ticked, and are asked for (only ones the page has)", async () => {
    const s = show(BOARD, {}, "/gear/potential?item=top&events=sale,free");
    await screen.findByRole("region", { name: /Eternal Armor potential/ });
    expect([screen.getByRole("checkbox", { name: "Cube sale (25% off)" }), screen.getByRole("checkbox", { name: "Double Miracle Time" })].map((c) => (c as HTMLInputElement).checked)).toEqual([true, false]);
    expect(s.calls.some((c) => c.path.startsWith("/gear/1/potential?events=sale&"))).toBe(true);
  });

  it("cheapest first: the cheaper cube's meso per 1% final damage above, which cube and 1 in how many cubes below; the border is the rank", async () => {
    const s = show();
    await screen.findByRole("group", { name: /Items, cheapest/ });
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Potential");
    expect(row().getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Gollux Belt", "Arcane Hat", "Eternal Armor"]);
    expect(cells().map((c) => c.querySelector(".above")!.textContent)).toEqual(["149m", "10.7B", "323.8B"]);
    expect(cells().map((c) => c.querySelector(".below")!.textContent)).toEqual(["Glowing 1/1.5", "Glowing 1/667", "Bright 1/4,000"]);
    expect(row().getAllByRole("button").map((b) => b.className.split(" ").find((k) => k.startsWith("rank-border")))).toEqual(["rank-border-none", "rank-border-legendary", "rank-border-legendary"]);
    expect(cells().map((c) => c.classList.contains("cheapest"))).toEqual([true, false, false]);
    expect(s.calls.some((c) => c.path.includes("undefined") || c.path.includes("/gear/0/"))).toBe(false);
  });

  it("a hat under its minimum cooldown (v2.4.1): its cube is 'needed', its seconds and the minimum shown, a gain below its lines signed", async () => {
    const hat = item("hat", "Arcane Hat", {
      lines: ["STR +13%", "STR +10%", "Skill Cooldown -2 sec"],
      score: 472.83,
      cooldown: { sec: 2, min: 4, points: [0, 0, 174.52, 174.52, 425.48, 425.48, 425.48] },
      cubes: { glowing: metrics({ better: 0.00026487, mesoPerFd: null, gainIfBetter: -12.5, mesoToBetter: 45_300_000_000 }), bright: metrics({ better: 0.00062523, mesoPerFd: null, gainIfBetter: -12.5, mesoToBetter: 35_200_000_000, price: 22_000_000 }) },
      cheaper: "bright",
    });
    show({ ...BOARD, items: [BOARD.items[0]!, BOARD.items[2]!, hat] }, { "GET /gear/:id/potential/hat": { ...GRAPH, cubes: { ...GRAPH.cubes, bright: { ...GRAPH.cubes.bright, short: 0.99937477 } } } }, "/gear/potential?item=hat");
    const head = await screen.findByText(/under the 4 s it must keep/);
    expect(head.textContent).toContain("cooldown 2 s");
    // the row: "needed" above it, not a cost
    expect(cells()[2]!.querySelector(".above")!.textContent).toBe("needed");
    await userEvent.click(within(screen.getByRole("group", { name: "Cube" })).getByRole("button", { name: /Bright/ }));
    // no meso per 1%, said why; the gain below its lines, with a minus
    expect(tile("Meso / 1% FD").textContent).toContain("needed");
    expect(tile("Avg gain when it beats it").textContent).toContain("−12.5");
    expect(tile("Avg gain when it beats it").textContent).toContain("−0.10%");
    // the graph leaves out the rolls under 4 s, saying how many
    expect((await screen.findByText(/Rolls under the 4 s the hat must keep/)).textContent).toContain(">99% of cubes");
  });

  it("a needed cube at the head of the list isn't marked cheapest; with no minimum, no 'needed' note even when nothing is priced", async () => {
    const needy = item("hat", "Arcane Hat", { cooldown: { sec: 0, min: 4, points: [0, 0, 1, 1, 1, 1, 1] }, cubes: { glowing: metrics({ mesoPerFd: null, gainIfBetter: -1 }), bright: metrics({ mesoPerFd: null, gainIfBetter: -1 }) }, cheaper: "bright" });
    show({ ...BOARD, items: [needy] }, {}, "/gear/potential?item=hat");
    await screen.findByText(/under the 4 s it must keep/);
    expect(cells()[0]!.classList.contains("cheapest")).toBe(false);
    expect(cells()[0]!.querySelector(".tag")!.textContent).toBe("");
  });
  it("no minimum and no final damage value: the hat's tile says nothing is needed", async () => {
    const plain = item("hat", "Arcane Hat", { cooldown: { sec: 2, min: 0, points: [0, 0, 1, 1, 1, 1, 1] }, cubes: { glowing: metrics({ mesoPerFd: null }), bright: metrics({ mesoPerFd: null }) }, cheaper: null });
    show({ ...BOARD, items: [plain] }, {}, "/gear/potential?item=hat");
    await screen.findByText(/cooldown 2 s/);
    expect(tile("Meso / 1% FD").textContent).not.toContain("needed");
  });

  it("a graph of small chances (a hat's rolls that keep its minimum) labels its scale readably, not 0.0% all the way up", async () => {
    const tiny = { ...GRAPH, cubes: { glowing: { ...GRAPH.cubes.glowing, distribution: [[425.48, 0.0005], [505.83, 0.0001]] as [number, number][], short: 0.9994 }, bright: { ...GRAPH.cubes.bright, distribution: [[425.48, 0.0005], [505.83, 0.0001]] as [number, number][], short: 0.9994 } } };
    show(BOARD, { "GET /gear/:id/potential/hat": tiny }, "/gear/potential?item=hat");
    const chart = await screen.findByRole("region", { name: "One cube's result" });
    await waitFor(() => expect(chart.querySelectorAll("svg text").length).toBeGreaterThan(3));
    const labels = [...chart.querySelectorAll("svg text")].map((t) => t.textContent ?? "").filter((t) => t.endsWith("%"));
    expect(labels.length).toBeGreaterThan(2);
    expect(labels.filter((t) => t === "0.0%")).toEqual([]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("a hat with no minimum: its seconds only; an item that isn't a hat: nothing about cooldown", async () => {
    const hat = item("hat", "Arcane Hat", { cooldown: { sec: 2, min: 0, points: [0, 0, 1, 1, 1, 1, 1] } });
    show({ ...BOARD, items: [hat, BOARD.items[0]!] }, {}, "/gear/potential?item=hat");
    expect((await screen.findByText(/cooldown 2 s/)).textContent).not.toContain("must keep");
    expect(screen.queryByText(/Rolls under/)).toBeNull();
    await userEvent.click(row().getByRole("button", { name: "Gollux Belt" }));
    await screen.findByRole("region", { name: /Gollux Belt potential/ });
    expect(screen.queryByText(/cooldown \d s/)).toBeNull();
  });

  it("no final damage value (0 per 100 score): no cost, but not called the best either", async () => {
    show({ ...BOARD, items: [item("belt", "Gollux Belt", { cheaper: null, cubes: { glowing: metrics({ mesoPerFd: null }), bright: metrics({ mesoPerFd: null }) } })] });
    await screen.findByRole("group", { name: /Items, cheapest/ });
    expect([cells()[0]!.querySelector(".above")!.textContent, cells()[0]!.querySelector(".below")!.textContent]).toEqual(["—", "—"]);
  });

  it("an item neither cube can improve: no cost, no cheapest mark", async () => {
    show({ ...BOARD, items: [item("hat", "Arcane Hat", { cheaper: null, cubes: { glowing: metrics({ better: 0, cubesToBetter: null, mesoToBetter: null, mesoPerFd: null }), bright: metrics({ better: 0, cubesToBetter: null, mesoToBetter: null, mesoPerFd: null }) } })] });
    await screen.findByRole("group", { name: /Items, cheapest/ });
    expect([cells()[0]!.querySelector(".above")!.textContent, cells()[0]!.querySelector(".below")!.textContent, cells()[0]!.classList.contains("cheapest")]).toEqual(["—", "best", false]);
  });
});

describe("the Potential page: the picked item", () => {
  it("the first item to start with: no potential saved, counted as Rare; the cheaper cube's figures with its rank-up chance", async () => {
    show();
    await screen.findByRole("region", { name: /Gollux Belt potential/ });
    const p = panel(/Gollux Belt potential/);
    expect(p.getByRole("combobox", { name: "Potential rank" })).toHaveProperty("value", "");
    expect(p.getByText(/No potential saved: counted as Rare/)).toBeTruthy();
    expect(within(p.getByRole("group", { name: "Cube" })).getByRole("button", { name: "Glowing · cheaper" }).getAttribute("aria-pressed")).toBe("true");
    expect(tile("Chance per cube of better").textContent).toContain("1 in 1.5");
    expect(tile("Chance per cube of better").textContent).toContain("rank-up 14% a cube");
  });

  it("a Legendary item: chance per cube as 1 in X with its exact percent, the cubes and meso for each chance; switching cubes shows the other's", async () => {
    show();
    await screen.findByRole("group", { name: /Items, cheapest/ });
    await userEvent.click(row().getByRole("button", { name: "Arcane Hat" }));
    expect(tile("Chance per cube of better").textContent).toBe("Chance per cube of better1 in 667 cubes0.15% a cube");
    expect(tile("Meso / 1% FD").textContent).toContain("10.7B");
    expect(tile("Mesos to any better roll").textContent).toContain("≈ 676 cubes on average");
    expect(tile("Avg gain when it beats it").textContent).toContain("+96.3");
    const chances = () => [...screen.getByRole("group", { name: "Cubes for a chance of a better result" }).querySelectorAll(".chance-row")].map((r) => r.textContent);
    expect(chances()).toEqual(["25%195 · 2.34B", "50%469 · 5.63B", "70%814 · 9.77B", "99%3,112 · 37.3B"]);
    await userEvent.click(within(screen.getByRole("group", { name: "Cube" })).getByRole("button", { name: "Bright" }));
    expect(tile("Meso / 1% FD").textContent).toContain("13.4B");
    expect(tile("Chance per cube of better").textContent).toContain("1 in 526");
    expect(chances()[0]).toBe("25%195 · 4.29B");
    // a new item shows its own cheaper cube again
    await userEvent.click(row().getByRole("button", { name: "Eternal Armor" }));
    expect(within(screen.getByRole("group", { name: "Cube" })).getByRole("button", { name: "Bright · cheaper" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("editing lines: each line's options with what it adds; Save sends the item's other details with the new lines; Cancel puts them back", async () => {
    const s = show();
    await screen.findByRole("group", { name: /Items, cheapest/ });
    await userEvent.click(row().getByRole("button", { name: "Arcane Hat" }));
    const p = panel(/Arcane Hat potential/);
    expect(p.getByRole("button", { name: "Save" })).toHaveProperty("disabled", true);
    const line3 = p.getByRole("combobox", { name: "Potential line 3" });
    expect(within(line3).getAllByRole("option").map((o) => o.textContent)).toEqual(["— pick a line —", "STR +13%", "STR +10%", "DEX +10%"]);
    await userEvent.selectOptions(line3, "STR +13%");
    expect(p.getByText(/Unsaved: 466\.9 score/)).toBeTruthy();
    expect(line3.closest("label")!.textContent).toContain("+168.6");
    await userEvent.click(p.getByRole("button", { name: "Cancel" }));
    expect((p.getByRole("combobox", { name: "Potential line 3" }) as HTMLSelectElement).value).toBe("STR +10%");
    await userEvent.selectOptions(p.getByRole("combobox", { name: "Potential line 3" }), "STR +13%");
    await userEvent.click(p.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(s.sent("PUT", "/gear/1/hat/details")).toEqual([{ stars: 17, flames: { STR: 6 }, potential: { rank: "legendary", lines: ["STR +13%", "STR +10%", "STR +13%"] }, hammers: 1 }]));
  });

  it("a rank change keeps only the lines that rank has; an item with nothing saved starts its details at the stars it comes with", async () => {
    const s = show();
    await screen.findByRole("region", { name: /Gollux Belt potential/ });
    const p = panel(/Gollux Belt potential/);
    await userEvent.selectOptions(p.getByRole("combobox", { name: "Potential rank" }), "legendary");
    expect([1, 2, 3].map((i) => (p.getByRole("combobox", { name: `Potential line ${i}` }) as HTMLSelectElement).value)).toEqual(["", "", ""]);
    await userEvent.selectOptions(p.getByRole("combobox", { name: "Potential line 1" }), "STR +13%");
    await userEvent.selectOptions(p.getByRole("combobox", { name: "Potential rank" }), "rare");
    expect((p.getByRole("combobox", { name: "Potential line 1" }) as HTMLSelectElement).value).toBe("");
    await userEvent.selectOptions(p.getByRole("combobox", { name: "Potential line 1" }), "STR +3%");
    await userEvent.click(p.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(s.sent("PUT", "/gear/1/belt/details")).toEqual([{ stars: 0, flames: {}, hammers: 0, potential: { rank: "rare", lines: ["STR +3%", null, null] } }]));
  });
});

describe("the Potential page: loading", () => {
  const asked = (s: ReturnType<typeof show>, start: string) => s.calls.filter((c) => c.path.startsWith(start)).map((c) => c.path);

  it("switching characters never shows the last one's items", async () => {
    show(BOARD, { "GET /gear/2/potential": () => new Promise(() => {}) });
    await screen.findByRole("group", { name: /Items, cheapest/ });
    await userEvent.click(screen.getByRole("tab", { name: /Second/ }));
    await waitFor(() => expect(screen.getByRole("tab", { name: /Second/ }).getAttribute("aria-selected")).toBe("true"));
    expect(screen.queryByRole("group", { name: /Items, cheapest/ })).toBeNull();
    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("switching characters or items never shows the last one's graph", async () => {
    show(BOARD, { "GET /gear/2/potential/belt": () => new Promise(() => {}), "GET /gear/1/potential/hat": () => new Promise(() => {}) });
    const graph = async () => within(await screen.findByRole("region", { name: "One cube's result" }));
    expect(await (await graph()).findByRole("img")).toBeTruthy();
    // the same item (the belt) of another character
    await userEvent.click(screen.getByRole("tab", { name: /Second/ }));
    await waitFor(() => expect(screen.getByRole("tab", { name: /Second/ }).getAttribute("aria-selected")).toBe("true"));
    expect((await graph()).queryByRole("img")).toBeNull();
    expect((await graph()).getByText("Loading…")).toBeTruthy();
    // another item of the first character
    await userEvent.click(screen.getByRole("tab", { name: /RemyRabbit/ }));
    expect(await (await graph()).findByRole("img")).toBeTruthy();
    await userEvent.click(row().getByRole("button", { name: "Arcane Hat" }));
    expect((await graph()).queryByRole("img")).toBeNull();
  });

  it("an event ticked keeps showing the last numbers until the new ones come", async () => {
    show(BOARD, { "GET /gear/1/potential": (_: unknown, path: string) => (path.includes("events=&") ? BOARD : new Promise(() => {})) });
    await screen.findByRole("group", { name: /Items, cheapest/ });
    await userEvent.click(screen.getByRole("checkbox", { name: "Cube sale (25% off)" }));
    expect(screen.getByRole("group", { name: /Items, cheapest/ })).toBeTruthy();
    expect(screen.queryByText("Loading…")).toBeNull();
  });

  it("a target picked keeps showing the graph until its numbers come", async () => {
    show(BOARD, { "GET /gear/1/potential/belt": (_: unknown, path: string) => (path.includes("target") ? new Promise(() => {}) : GRAPH) });
    const graph = within(await screen.findByRole("region", { name: "One cube's result" }));
    const svg = await graph.findByRole("img");
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 720, height: 240, right: 720, bottom: 240, x: 0, y: 0, toJSON() {} });
    const hit = svg.querySelector("rect[fill='transparent']")!;
    await userEvent.pointer([{ target: hit, coords: { clientX: 443.5, clientY: 100 } }, { keys: "[MouseLeft]", target: hit }]);
    expect(graph.getByRole("img")).toBeTruthy();
    expect(graph.queryByText("Loading…")).toBeNull();
  });

  it("a save asks for the Potential numbers again", async () => {
    const s = show();
    await screen.findByRole("group", { name: /Items, cheapest/ });
    await userEvent.click(row().getByRole("button", { name: "Arcane Hat" }));
    const before = asked(s, "/gear/1/potential?").length;
    const p = panel(/Arcane Hat potential/);
    await userEvent.selectOptions(p.getByRole("combobox", { name: "Potential line 3" }), "STR +13%");
    await userEvent.click(p.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(asked(s, "/gear/1/potential?").length).toBeGreaterThan(before));
  });
});

describe("the Potential page: events, the graph and Targets", () => {
  it("the events ask for new numbers (Double Miracle Time, a cube sale)", async () => {
    const s = show();
    await screen.findByRole("group", { name: /Items, cheapest/ });
    await userEvent.click(screen.getByRole("checkbox", { name: "Cube sale (25% off)" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Double Miracle Time" }));
    await waitFor(() => expect(s.calls.some((c) => c.path.startsWith("/gear/1/potential?events=miracle,sale&"))).toBe(true));
    expect(s.calls.some((c) => c.path.startsWith("/gear/1/potential/belt?events=miracle,sale"))).toBe(true);
    // no target picked: nothing more in the graph's address
    expect(s.calls.filter((c) => c.path.startsWith("/gear/1/potential/belt")).map((c) => c.path)).toEqual(["/gear/1/potential/belt?events=", "/gear/1/potential/belt?events=sale", "/gear/1/potential/belt?events=miracle,sale"]);
  });

  it("the graph shows the cube picked; clicking the distribution asks what reaching that score costs, shown by the figures; Clear removes it", async () => {
    const s = show();
    await screen.findByRole("group", { name: /Items, cheapest/ });
    await userEvent.click(row().getByRole("button", { name: "Arcane Hat" }));
    const graph = within(await screen.findByRole("region", { name: "One cube's result" }));
    expect(graph.getByRole("heading", { level: 2 }).textContent).toContain("Glowing");
    // jsdom can't lay out: the graph is 720 px wide, as drawn
    const svg = graph.getByRole("img");
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 720, height: 240, right: 720, bottom: 240, x: 0, y: 0, toJSON() {} });
    const hit = svg.querySelector("rect[fill='transparent']")!;
    // the last point (505.83) sits at the right end of the plot
    await userEvent.pointer([{ target: hit, coords: { clientX: 707, clientY: 100 } }, { keys: "[MouseLeft]", target: hit }]);
    await waitFor(() => expect(s.calls.filter((c) => c.path.includes("target")).map((c) => c.path)).toEqual(["/gear/1/potential/hat?events=&target=505.83"]));
    const target = within(await screen.findByLabelText("Target"));
    expect(target.getByText(/at least/).textContent).toContain("505.8");
    expect(target.getAllByText(/cubes|never/).map((e) => e.textContent)).toEqual(["≈ 6,806 cubes · 81.7B on average", "never"]);
    await userEvent.click(target.getByRole("button", { name: "Clear" }));
    expect(screen.queryByLabelText("Target")).toBeNull();
    await userEvent.click(within(screen.getByRole("group", { name: "Cube" })).getByRole("button", { name: "Bright" }));
    expect(graph.getByRole("heading", { level: 2 }).textContent).toContain("Bright");
  });

  it("clicking between the distribution's points picks the score under the pointer (to a tenth)", async () => {
    const s = show();
    await screen.findByRole("group", { name: /Items, cheapest/ });
    await userEvent.click(row().getByRole("button", { name: "Arcane Hat" }));
    const svg = within(await screen.findByRole("region", { name: "One cube's result" })).getByRole("img");
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 720, height: 240, right: 720, bottom: 240, x: 0, y: 0, toJSON() {} });
    const hit = svg.querySelector("rect[fill='transparent']")!;
    // the plot runs from x 58 to 708 for scores 0 to 505.83: x 443.5 is score 300.0, far from any point
    await userEvent.pointer([{ target: hit, coords: { clientX: 443.5, clientY: 100 } }, { keys: "[MouseLeft]", target: hit }]);
    await waitFor(() => expect(s.calls.filter((c) => c.path.includes("target")).map((c) => c.path)).toEqual(["/gear/1/potential/hat?events=&target=300"]));
  });

  it("Targets: each item's stop score, ✓ when reached, else the cheaper cube's way there", async () => {
    show();
    await screen.findByRole("group", { name: /Items, cheapest/ });
    await userEvent.click(screen.getByRole("button", { name: "Targets" }));
    const rows = within(screen.getByRole("region", { name: "Targets" })).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual(["Gollux BeltNone0250.5Glowing ≈ 83.6 cubes · 1.00B", "Arcane HatLegendary428421.2✓ reached", "Eternal ArmorLegendary428421.2✓ reached"]);
  });

  it("a job the item list doesn't know yet, or no items that can have potential: a note", async () => {
    show({ ...BOARD, known: false, items: [] });
    expect(await screen.findByText(/isn't in the item list yet/)).toBeTruthy();
  });

  it("no items that can have potential: a note", async () => {
    show({ ...BOARD, items: [] });
    expect(await screen.findByText(/No equipped items that can have potential/)).toBeTruthy();
  });
});
