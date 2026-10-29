import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App";
import type { GearBoard, GearCharacter, UpgradesBoard, UpgradeStep } from "../src/api/types";
import { BASE_ROUTES, fakeServer, renderWithApp } from "./server";

// A made-up board: the numbers are the server's to work out (tested there); here, what the page shows and does.
const VALUES = { att: 4, allStat: 14.65, secRatio: 0.125, bossDmg: 12, fdPer100: 0.785, strPct: null, dexPct: null, intPct: null, lukPct: null, hpPct: null, attPct: 53.82, critDmg: 42.38, ied300: 15.6, ied380: 20.52, bossDef: 380 as const, cooldown: null };
const char = (id: number, name: string): GearCharacter => ({ id, name, job: "Ren", level: 279, avatar: null, knownJob: true, fits: [], equipped: {}, details: {}, statBoxes: null, statValues: VALUES });
const SLOTS = ["hat", "weapon", "belt"].map((key) => ({ key, label: key, kind: key }));
const GEAR: GearBoard = { generated: "2026-10-24", slots: SLOTS, items: [], jobs: {}, characters: [char(1, "RemyRabbit"), char(2, "Second")] };
const step = (over: Partial<UpgradeStep>): UpgradeStep => ({ system: "flames", slot: "hat", name: "Arcane Hat", icon: "/item-icons/hat.png", step: "Black Flame", perFd: 15_500_000, cost: 5_100_000, fd: 0.19, chance: 0.589, boom: null, now: { score: 37.13, best: 268.8 }, ...over });
const BOARD: UpgradesBoard = {
  known: true, blackFlamePrice: 3_000_000, mvp: "none", prices: { glowing: 12_000_000, bright: 22_000_000 },
  steps: [
    step({}),
    step({ system: "potential", slot: "belt", name: "Gollux Belt", icon: null, step: "Glowing Cube", perFd: 277_900_000, cost: 437_400_000, fd: 1.57, chance: 1 / 86, now: { rank: "unique", cube: "glowing", otherPerFd: 303_800_000 } }),
    step({ system: "starforce", step: "17→18★", perFd: 1_540_000_000, cost: 755_500_000, fd: 0.49, chance: 0.158, boom: 0.0674, now: { star: 17, boomCost: 0 } }),
  ],
};

function show(board: UpgradesBoard = BOARD, routes: Record<string, unknown> = {}, path = "/gear/upgrades") {
  const s = fakeServer({ ...BASE_ROUTES, "GET /gear": GEAR, "GET /gear/:id/upgrades": board, ...routes });
  renderWithApp(<App />, path);
  return s;
}
const rows = async () => within(await screen.findByRole("region", { name: "All steps" })).getAllByRole("row").slice(1);

describe("the Upgrades page", () => {
  it("every step, cheapest per 1% final damage first: the item, its system, the step, meso per 1%, the whole step's cost, what it adds, the chance", async () => {
    const s = show();
    const r = await rows();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Upgrades");
    expect(r.map((x) => x.textContent)).toEqual([
      "1Arcane Hatscore 37.1 / 268.8FlamesBlack Flame16m5maverage, to any better roll+0.19%1 in 1.7 flames better",
      "2Gollux BeltUnique · Bright 304m per 1%PotentialGlowing Cube278m437maverage, to any better roll+1.57%1 in 86 cubes better",
      "3Arcane Hat17★ · booms not pricedStar Force17→18★1.54B756maverage, booms included+0.49%next tap 15.8%, boom 6.74%",
    ]);
    // the cheapest in gold
    expect(r[0]!.querySelector(".gold")!.textContent).toBe("16m");
    // no icon: no name in its place (the name is beside it)
    expect(r[1]!.querySelector("img, .slot-text")).toBeNull();
    expect(s.calls.some((c) => c.path === "/gear/1/upgrades?sf=&cubes=")).toBe(true);
  });

  it("a row opens that system's page with the item picked", async () => {
    show();
    await userEvent.click((await rows())[1]!);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Potential"));
  });

  it("the events ask for new numbers, each page's in its own part of the address", async () => {
    const s = show();
    await rows();
    await userEvent.click(screen.getByRole("checkbox", { name: "Cube sale (25% off)" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "30% off" }));
    await waitFor(() => expect(s.calls.some((c) => c.path === "/gear/1/upgrades?sf=thirtyOff&cubes=sale")).toBe(true));
  });

  it("Chart: a dot per step; clicking one shows its figures and its item's other steps, with a link to its page", async () => {
    show();
    await rows();
    await userEvent.click(screen.getByRole("button", { name: "Chart" }));
    const chart = within(await screen.findByRole("region", { name: "Cost against gain" }));
    const dots = chart.getByRole("img").querySelectorAll("circle");
    expect(dots.length).toBe(3);
    // the cheapest picked to start
    expect(chart.getByText(/#1 on the list/)).toBeTruthy();
    await userEvent.click(dots[2]!);
    expect(chart.getByText(/#3 on the list/)).toBeTruthy();
    // the hat's other step: its flames
    const other = chart.getByRole("button", { name: /#1 Flames Black Flame/ });
    expect(chart.getByRole("link", { name: "Open it on the Star Force page" }).getAttribute("href")).toBe("/gear/starforce?item=hat");
    await userEvent.click(other);
    expect(chart.getByText(/#1 on the list/)).toBeTruthy();
  });

  it("Chart: the picked step stays picked when a new order comes (an event ticked)", async () => {
    // with a cube sale the belt's cube becomes the cheapest
    const sale = { ...BOARD, steps: [BOARD.steps[1]!, BOARD.steps[0]!, BOARD.steps[2]!] };
    show(BOARD, { "GET /gear/1/upgrades": (_: unknown, path: string) => (path.includes("cubes=sale") ? sale : BOARD) });
    await rows();
    await userEvent.click(screen.getByRole("button", { name: "Chart" }));
    const chart = within(await screen.findByRole("region", { name: "Cost against gain" }));
    // the hat's flames, first before the sale
    await userEvent.click(chart.getByRole("img").querySelectorAll("circle")[0]!);
    expect(chart.getByText(/#1 on the list/).closest(".flame-tile")!.textContent).toContain("Black Flame");
    await userEvent.click(screen.getByRole("checkbox", { name: "Cube sale (25% off)" }));
    await waitFor(() => expect(chart.getByRole("img").querySelectorAll("circle")[0]!.querySelector("title")!.textContent).toContain("Gollux Belt"));
    // still the hat's flames, now second: not whatever is first now (the belt's cube)
    expect(chart.getByText(/#2 on the list/).closest(".flame-tile")!.textContent).toContain("Black Flame");
  });

  it("a row's link carries that page's events (the page then shows the figures the row did)", async () => {
    const s = show(BOARD, { "GET /gear/:id/starforce": { known: true, mvp: "none", events: ["thirtyOff"], budget: 10e9, items: [] } });
    await rows();
    await userEvent.click(screen.getByRole("checkbox", { name: "30% off" }));
    await waitFor(() => expect(s.calls.some((c) => c.path.startsWith("/gear/1/upgrades?sf=thirtyOff"))).toBe(true));
    await userEvent.click((await rows())[2]!);
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Star Force"));
    await waitFor(() => expect(s.calls.some((c) => c.path.startsWith("/gear/1/starforce?events=thirtyOff&"))).toBe(true));
    expect(screen.getByRole("checkbox", { name: "30% off" })).toHaveProperty("checked", true);
  });

  it("Chart: a free step (a Black Flame price of 0) sits at the scale's start, not off the chart", async () => {
    show({ ...BOARD, blackFlamePrice: 0, steps: [step({ perFd: 0, cost: 0 }), ...BOARD.steps.slice(1)] });
    await rows();
    await userEvent.click(screen.getByRole("button", { name: "Chart" }));
    const dots = within(await screen.findByRole("region", { name: "Cost against gain" })).getByRole("img").querySelectorAll("circle");
    for (const d of dots) expect(Number.isFinite(Number(d.getAttribute("cx")))).toBe(true);
  });

  it("a job the item list doesn't know yet, or nothing to upgrade: a note", async () => {
    show({ ...BOARD, known: false, steps: [] });
    expect(await screen.findByText(/isn't in the item list yet/)).toBeTruthy();
  });

  it("nothing to upgrade: a note", async () => {
    show({ ...BOARD, steps: [] });
    expect(await screen.findByText(/Nothing to upgrade/)).toBeTruthy();
  });

  it("nothing is asked for before the character is known; a new event keeps showing the last numbers until the new ones come", async () => {
    const s = show(BOARD, { "GET /gear/1/upgrades": (_: unknown, path: string) => (path.includes("cubes=sale") ? new Promise(() => {}) : BOARD) });
    await rows();
    expect(s.calls.some((c) => c.path.includes("undefined"))).toBe(false);
    await userEvent.click(screen.getByRole("checkbox", { name: "Cube sale (25% off)" }));
    expect(screen.getByRole("region", { name: "All steps" })).toBeTruthy();
    expect(screen.queryByText("Loading…")).toBeNull();
  });

  it("saving stat values asks for the upgrades again", async () => {
    const s = show(BOARD, { "PUT /gear/:id/stat-values": undefined });
    await rows();
    const before = s.calls.filter((c) => c.path.startsWith("/gear/1/upgrades")).length;
    const att = within(screen.getByRole("group", { name: "Stat values" })).getByRole("spinbutton", { name: "1 ATT =" });
    await userEvent.clear(att);
    await userEvent.type(att, "3{Enter}");
    await waitFor(() => expect(s.calls.filter((c) => c.path.startsWith("/gear/1/upgrades")).length).toBeGreaterThan(before));
  });

  it("switching characters never shows the last one's steps", async () => {
    show(BOARD, { "GET /gear/2/upgrades": () => new Promise(() => {}) });
    await rows();
    await userEvent.click(screen.getByRole("tab", { name: /Second/ }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "All steps" })).toBeNull());
    expect(screen.getByText("Loading…")).toBeTruthy();
  });
});
