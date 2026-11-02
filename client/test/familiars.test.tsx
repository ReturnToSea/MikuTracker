import { FAMILIAR_DEFAULTS, type FamiliarInput } from "@miku/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { focusManager } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { App } from "../src/App";
import type { CharacterList, FamiliarBoard } from "../src/api/types";
import { BASE_ROUTES, fakeServer, renderWithApp } from "./server";

// A made-up board: the totals are the server's to work out (tested there); here, what the page shows and does.
// (the tabs: the character list's; only what the tabs show)
const TABS = {
  characters: [
    { id: 1, name: "RemyRabbit", job: "Ren", level: 279, avatar: null },
    { id: 2, name: "PlumBlade", job: "Ren", level: 275, avatar: null },
  ],
  selectedId: 1,
} as unknown as CharacterList;
const L = (stat: FamiliarBoard["totals"][number]["stat"], value: number) => ({ stat, value });
// (made-up lines per rank: a few, to pick from)
const POOL = {
  common: [L("dmg", 1)],
  rare: [L("dmg", 2), L("ied", 15)],
  epic: [L("bossDmg", 30), L("ied", 30)],
  unique: [L("bossDmg", 40), L("attPct", 6)],
  legendary: [L("bossDmg", 50), L("critDmg", 6)],
};
const CHOICES: FamiliarBoard["choices"] = {
  common: { first: POOL.common, usual: null, rare: POOL.common },
  rare: { first: POOL.rare, usual: POOL.common, rare: POOL.rare },
  epic: { first: POOL.epic, usual: POOL.rare, rare: POOL.epic },
  unique: { first: POOL.unique, usual: POOL.epic, rare: POOL.unique },
  legendary: { first: POOL.legendary, usual: POOL.unique, rare: POOL.legendary },
};
const badge = (id: string, effects: string[], damage = true) => ({ id, name: `${id[0]!.toUpperCase()}${id.slice(1)} Badge`, effects, damage, icon: id === "rebel" ? "/item-icons/familiars/rebel.png" : null });
const BADGES = [badge("starter", ["Max HP: +5"], false), badge("rebel", ["Critical Rate: +1%"]), ...["a", "b", "c", "d", "e", "f", "g", "h"].map((x) => badge(`extra${x}`, ["Damage: +1%"]))];
const INPUT: FamiliarInput = {
  familiars: [
    { rank: "unique", lines: [L("bossDmg", 40), L("ied", 30)] },
    { rank: "rare", lines: [null, null] },
    { rank: "common", lines: [null, null] },
  ],
  badges: ["rebel"],
};
const BOARD: FamiliarBoard = {
  input: INPUT,
  choices: CHOICES,
  badges: BADGES,
  totals: [
    { stat: "bossDmg", familiars: 130, badges: 0, total: 120, over: 130 },
    { stat: "ied", familiars: 30, badges: 0, total: 30, over: null },
    { stat: "critRate", familiars: 0, badges: 1, total: 1, over: null },
    { stat: "att", familiars: 0, badges: 4, total: 4, over: null },
  ],
  bossCap: 120,
  source: "The wiki (read 2026-11-02)",
};

function show(board: FamiliarBoard = BOARD, routes: Record<string, unknown> = {}) {
  const s = fakeServer({ ...BASE_ROUTES, "GET /characters": TABS, "GET /familiars/1": board, "PUT /familiars/1": undefined, ...routes });
  renderWithApp(<App />, "/familiars");
  return s;
}
const region = async (name: string) => within(await screen.findByRole("region", { name }));
const sent = (s: ReturnType<typeof show>) => s.sent("PUT", "/familiars/1") as FamiliarInput[];
const optionTexts = (select: HTMLElement) => [...(select as HTMLSelectElement).options].map((o) => o.textContent);

describe("the Familiars page", () => {
  it("in the rail, with the world's characters as tabs; the first picked", async () => {
    show();
    expect(within(screen.getByRole("navigation")).getByRole("link", { name: /Familiars/ }).getAttribute("aria-current")).toBe("page");
    expect(within(await screen.findByRole("tablist", { name: "Characters" })).getAllByRole("tab").map((t) => t.textContent)).toEqual(["RemyRabbitLv. 279 · Ren", "PlumBladeLv. 275 · Ren"]);
    await screen.findByRole("region", { name: "Familiars" });
  });

  it("each familiar: its rank and two lines as saved; line 1 from its rank, line 2 from the rank below (usual) or its own (rare)", async () => {
    show();
    const fams = await region("Familiars");
    const one = within(fams.getByRole("group", { name: "Familiar 1" }));
    expect((one.getByRole("combobox", { name: "Familiar 1 rank" }) as HTMLSelectElement).value).toBe("unique");
    expect((one.getByRole("combobox", { name: "Familiar 1 line 1" }) as HTMLSelectElement).value).toBe("bossDmg:40");
    expect(optionTexts(one.getByRole("combobox", { name: "Familiar 1 line 1" }))).toEqual(["Not entered", "Boss DMG +40%", "ATT +6%", "Other line (no damage)"]);
    const second = one.getByRole("combobox", { name: "Familiar 1 line 2" });
    expect((second as HTMLSelectElement).value).toBe("ied:30");
    expect([...second.querySelectorAll("optgroup")].map((g) => [g.label, [...g.querySelectorAll("option")].map((o) => o.textContent)])).toEqual([
      ["Epic (usual)", ["Boss DMG +30%", "IED +30%"]],
      ["Unique (rare)", ["Boss DMG +40%", "ATT +6%"]],
    ]);
    // a Common familiar: nothing below, its own lines only
    const three = fams.getByRole("combobox", { name: "Familiar 3 line 2" });
    expect([...three.querySelectorAll("optgroup")].map((g) => g.label)).toEqual(["Common"]);
  });

  it("picking a line saves it, with everything else as it was", async () => {
    const s = show();
    const fams = await region("Familiars");
    await userEvent.selectOptions(fams.getByRole("combobox", { name: "Familiar 2 line 1" }), "ied:15");
    await waitFor(() => expect(sent(s)).toEqual([{ ...INPUT, familiars: [INPUT.familiars[0], { rank: "rare", lines: [L("ied", 15), null] }, INPUT.familiars[2]] }]));
    await userEvent.selectOptions(fams.getByRole("combobox", { name: "Familiar 1 line 2" }), "other");
    await waitFor(() => expect(sent(s).at(-1)!.familiars[0]).toEqual({ rank: "unique", lines: [L("bossDmg", 40), { stat: "other", value: 0 }] }));
    await userEvent.selectOptions(fams.getByRole("combobox", { name: "Familiar 1 line 1" }), "");
    await waitFor(() => expect(sent(s).at(-1)!.familiars[0].lines[0]).toBeNull());
  });

  it("a new rank keeps the lines it can still have and clears the others", async () => {
    const s = show();
    const fams = await region("Familiars");
    // Unique → Legendary: Boss 40 can't be a Legendary 1st line; IED 30 (Epic's) can't be its 2nd
    await userEvent.selectOptions(fams.getByRole("combobox", { name: "Familiar 1 rank" }), "legendary");
    await waitFor(() => expect(sent(s).at(-1)!.familiars[0]).toEqual({ rank: "legendary", lines: [null, null] }));
  });

  it("a lower rank keeps a line it can still have", async () => {
    const s = show();
    // Unique → Epic: Boss 40 isn't an Epic line; IED 30 (Epic's) still is, as the 2nd line's own rank
    await userEvent.selectOptions((await region("Familiars")).getByRole("combobox", { name: "Familiar 1 rank" }), "epic");
    await waitFor(() => expect(sent(s).at(-1)!.familiars[0]).toEqual({ rank: "epic", lines: [null, L("ied", 30)] }));
  });

  it("badges: every one with its picture (its first letter when not downloaded) and effects; ticking saves; untick all", async () => {
    // (the fake server keeps what's saved, as the real one does)
    let saved = BOARD;
    const s = show(BOARD, {
      "GET /familiars/1": () => saved,
      "PUT /familiars/1": (input: FamiliarInput) => {
        saved = { ...BOARD, input };
      },
    });
    const bad = await region("Badges");
    const rebel = bad.getByRole("checkbox", { name: /Rebel/ }) as HTMLInputElement;
    expect(rebel.checked).toBe(true);
    expect(rebel.closest("label")!.querySelector("img")!.getAttribute("src")).toBe("/item-icons/familiars/rebel.png");
    expect(rebel.closest("label")!.textContent).toContain("Critical Rate: +1%");
    expect(bad.getByRole("checkbox", { name: /Starter/ }).closest("label")!.textContent).toBe("SStarterMax HP: +5");
    expect(bad.getByText("1 / 8")).toBeTruthy();
    await userEvent.click(bad.getByRole("checkbox", { name: /Starter/ }));
    await waitFor(() => expect(sent(s).at(-1)!.badges).toEqual(["rebel", "starter"]));
    await userEvent.click(bad.getByRole("checkbox", { name: /Rebel/ }));
    await waitFor(() => expect(sent(s).at(-1)!.badges).toEqual(["starter"]));
    await userEvent.click(bad.getByRole("button", { name: "Untick all" }));
    await waitFor(() => expect(sent(s).at(-1)!.badges).toEqual([]));
  });

  it("damage badges only: hides the ones that give no damage stat", async () => {
    show();
    const bad = await region("Badges");
    expect(bad.queryByRole("checkbox", { name: /Starter/ })).toBeTruthy();
    await userEvent.click(bad.getByRole("checkbox", { name: "Damage badges only" }));
    expect(bad.queryByRole("checkbox", { name: /Starter/ })).toBeNull();
    expect(bad.getByRole("checkbox", { name: /Rebel/ })).toBeTruthy();
  });

  it("with 8 equipped, the others can't be ticked (and say why)", async () => {
    const eight = ["a", "b", "c", "d", "e", "f", "g", "h"].map((x) => `extra${x}`);
    show({ ...BOARD, input: { ...INPUT, badges: eight } });
    const bad = await region("Badges");
    expect(bad.getByText("8 / 8")).toBeTruthy();
    const starter = bad.getByRole("checkbox", { name: /Starter/ }) as HTMLInputElement;
    expect(starter.disabled).toBe(true);
    expect(starter.closest("label")!.getAttribute("title")).toMatch(/8 badges equipped/);
    expect((bad.getByRole("checkbox", { name: /Extraa/ }) as HTMLInputElement).disabled).toBe(false);
    expect((bad.getByRole("button", { name: "Untick all" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("untick all can't be pressed with none equipped", async () => {
    show({ ...BOARD, input: { ...INPUT, badges: [] } });
    expect(((await region("Badges")).getByRole("button", { name: "Untick all" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("the totals: each stat's familiars, badges and total, the Boss cap shown when passed", async () => {
    show();
    const tot = await region("Totals");
    const rows = tot.getAllByRole("row").slice(1).map((r) => [...r.querySelectorAll("td")].map((c) => c.textContent));
    expect(rows).toEqual([
      ["Boss DMG %", "130%", "–", "120%130% → 120%"],
      ["IED %", "30%", "–", "30%"],
      ["Crit Rate %", "–", "1%", "1%"],
      ["ATT", "–", "+4", "+4"],
    ]);
    expect(tot.getByText("130% → 120%").getAttribute("title")).toBe("The lines add up to 130%; only 120% counts");
  });

  it("nothing entered: says so instead of a table", async () => {
    show({ ...BOARD, input: FAMILIAR_DEFAULTS, totals: [] });
    const tot = await region("Totals");
    expect(tot.getByText("Nothing entered yet.")).toBeTruthy();
    expect(tot.queryByRole("table")).toBeNull();
  });

  it("a save the server refuses: its message shown", async () => {
    show(BOARD, { "PUT /familiars/1": new Response(JSON.stringify({ error: "Familiar 1's line 1 isn't one unique familiars can have" }), { status: 400 }) });
    await userEvent.selectOptions((await region("Familiars")).getByRole("combobox", { name: "Familiar 1 line 1" }), "attPct:6");
    expect((await screen.findByRole("alert")).textContent).toContain("isn't one unique familiars can have");
  });

  it("no characters on the world: says so, and no board is asked for", async () => {
    const s = fakeServer(BASE_ROUTES);
    renderWithApp(<App />, "/familiars");
    expect(await screen.findByText(/No characters on Kronos yet/)).toBeTruthy();
    expect(s.calls.filter((c) => c.path.startsWith("/familiars")).length).toBe(0);
  });

  it("coming back to the window doesn't reload the board (a reload during a save would bring back the input before it)", async () => {
    const s = show();
    await region("Familiars");
    const gets = () => s.calls.filter((c) => c.method === "GET" && c.path === "/familiars/1").length;
    expect(gets()).toBe(1);
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(gets()).toBe(1);
    focusManager.setFocused(undefined);
  });
});
