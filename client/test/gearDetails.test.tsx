import { describe, expect, it } from "vitest";
import type { DetailOptions } from "../src/api/types";
import { detailsAfter, SLOT_ORDER } from "../src/lib/gear";
import { blankDetails, clickStar, draftOf, fitDraft, isDirty, lineChoices, summary, toggleFlame, withRank } from "../src/lib/gearDetails";

// A made-up item with small numbers: 0–5★, each star +2 STR and +1 ATT; flames STR 10 per tier and
// HP 100 per tier at tiers 3–7; two potential ranks.
const g = (n: number) => ({ str: 2 * n, dex: 0, int: 0, luk: 0, hp: 0, mp: 0, att: n, matt: 0, speed: 0, jump: 0 });
const OPTIONS: DetailOptions = {
  stars: { min: 0, max: 5, gains: [0, 1, 2, 3, 4, 5].map(g), notes: [] },
  flames: [
    { stat: "STR", values: [null, null, 30, 40, 50, 60, 70] },
    { stat: "STR+DEX", values: [null, null, 15, 20, 25, 30, 35] },
    { stat: "Max HP", values: [null, null, 300, 400, 500, 600, 700] },
    { stat: "M. ATT", values: [null, null, 3, 4, 5, 6, 7] },
    { stat: "All Stats %", values: [null, null, 3, 4, 5, 6, 7] },
    { stat: "Req. level", values: [null, null, -15, -20, -25, -30, -35] },
    { stat: "Speed", values: [null, null, 3, 4, 5, 6, 7] },
  ],
  potential: {
    unique: [[{ line: "STR +10%", chance: 10 }, { line: "STR +10%", chance: 5 }, { line: "All Stats +7%", chance: 8 }], [{ line: "STR +7%", chance: 9 }], [{ line: "STR +7%", chance: 9 }, { line: "DEX +7%", chance: 9 }]],
    legendary: [[{ line: "STR +13%", chance: 10 }, { line: "STR +10%", chance: 9 }], [{ line: "STR +10%", chance: 9 }], [{ line: "STR +10%", chance: 9 }]],
  },
  hammers: { count: 3, per: { allStat: 20, hp: 1000, mp: 1000, att: 15, matt: 15 } },
};
const ITEM = { stats: { str: 40, dex: 40, att: 5, boss: 10, ied: 15, hpPct: 5 }, hammers: OPTIONS.hammers! };

describe("drafts", () => {
  it("a draft starts from what's saved, or blank; never below the item's minimum stars", () => {
    expect(draftOf(undefined, undefined)).toEqual(blankDetails());
    const saved = { ...blankDetails(), stars: 3, flames: { STR: 4 } };
    const d = draftOf(saved, OPTIONS);
    expect(d).toEqual(saved);
    d.flames.STR = 5;
    expect(saved.flames.STR).toBe(4); // a copy
    expect(draftOf(undefined, { ...OPTIONS, stars: { ...OPTIONS.stars, min: 22, max: 22 } }).stars).toBe(22);
  });

  it("isDirty: compares with what's saved, ignoring the flames' order", () => {
    const saved = { ...blankDetails(), stars: 3, flames: { STR: 4, "Max HP": 5 } };
    expect(isDirty({ ...saved, flames: { "Max HP": 5, STR: 4 } }, saved, OPTIONS)).toBe(false);
    expect(isDirty({ ...saved, stars: 4 }, saved, OPTIONS)).toBe(true);
    expect(isDirty(blankDetails(), undefined, OPTIONS)).toBe(false);
    expect(isDirty({ ...blankDetails(), hammers: 1 }, undefined, OPTIONS)).toBe(true);
  });
});

describe("fitDraft and detailsAfter", () => {
  it("fitDraft keeps a draft within what the item can now have", () => {
    const d = { stars: 9, flames: { STR: 7, "Max HP": 2, Speed: 4 }, potential: { rank: "unique" as const, lines: ["STR +10%", "STR +7%", "DEX +7%"] }, hammers: 5 };
    expect(fitDraft(d, OPTIONS)).toEqual({ stars: 5, flames: { STR: 7, Speed: 4 }, potential: { rank: "unique", lines: ["STR +10%", "STR +7%", "DEX +7%"] }, hammers: 3 });
    const narrow: DetailOptions = { ...OPTIONS, stars: { ...OPTIONS.stars, min: 2 }, flames: [{ stat: "STR", values: [1, 2, 3, 4, 5, null, null] }], potential: null, hammers: null };
    expect(fitDraft({ ...d, stars: 0 }, narrow)).toEqual({ stars: 2, flames: {}, potential: null, hammers: 0 });
    expect(fitDraft({ ...d, potential: { rank: "unique", lines: ["All Stats +7%", "Nope", null] } }, OPTIONS).potential).toEqual({ rank: "unique", lines: ["All Stats +7%", null, null] });
    expect(fitDraft(blankDetails(), OPTIONS)).toEqual(blankDetails());
  });

  it("detailsAfter: the same item (or typed name) keeps its details; another item or emptying drops them", () => {
    const c = { equipped: { hat: { item: "1000001" }, pocket: { other: "Cup" } }, details: { hat: { ...blankDetails(), stars: 5 }, pocket: { ...blankDetails(), stars: 1 } } } as unknown as Parameters<typeof detailsAfter>[0];
    expect(detailsAfter(c, "hat", { item: "1000001" })).toBe(c.details);
    expect(Object.keys(detailsAfter(c, "hat", { item: "1000009" }))).toEqual(["pocket"]);
    expect(Object.keys(detailsAfter(c, "hat", { clear: true }))).toEqual(["pocket"]);
    expect(detailsAfter(c, "pocket", { other: " Cup " })).toBe(c.details);
    expect(Object.keys(detailsAfter(c, "pocket", { other: "Mug" }))).toEqual(["hat"]);
    expect(Object.keys(detailsAfter(c, "pocket", { item: "1000001" }))).toEqual(["hat"]);
    expect(Object.keys(detailsAfter(c, "hat", { other: "1000001" }))).toEqual(["pocket"]);
    expect(Object.keys(detailsAfter(c, "face", { item: "1000001" }))).toEqual(["hat", "pocket"]);
  });

  it("SLOT_ORDER: the window's slots in order, then the passive ring and the totems", () => {
    expect([SLOT_ORDER.length, SLOT_ORDER[0], SLOT_ORDER[1], SLOT_ORDER.at(-4), SLOT_ORDER.at(-1)]).toEqual([29, "ring1", "hat", "ringP", "totem3"]);
  });
});

describe("toggleFlame and clickStar", () => {
  it("picks a tier, changes it, un-picks it; never a 5th stat", () => {
    expect(toggleFlame({}, "STR", 5)).toEqual({ STR: 5 });
    expect(toggleFlame({ STR: 5 }, "STR", 6)).toEqual({ STR: 6 });
    expect(toggleFlame({ STR: 5, DEX: 3 }, "STR", 5)).toEqual({ DEX: 3 });
    const four = { STR: 3, DEX: 3, LUK: 3, INT: 3 };
    expect(toggleFlame(four, "ATT", 4)).toBe(four);
    expect(toggleFlame(four, "LUK", 7)).toEqual({ STR: 3, DEX: 3, LUK: 7, INT: 3 });
  });

  it("clicking a star sets that many; the current top star takes one off; kept in range", () => {
    expect([clickStar(0, 5, 0, 30), clickStar(5, 5, 0, 30), clickStar(5, 3, 0, 30)]).toEqual([5, 4, 3]);
    expect([clickStar(22, 22, 22, 25), clickStar(22, 30, 22, 25)]).toEqual([22, 25]);
  });
});

describe("potential", () => {
  it("withRank keeps the lines the new rank also has", () => {
    const unique = { rank: "unique" as const, lines: ["STR +10%", "STR +7%", "DEX +7%"] };
    expect(withRank(unique, "legendary", OPTIONS)).toEqual({ rank: "legendary", lines: ["STR +10%", null, null] });
    expect(withRank(null, "unique", OPTIONS)).toEqual({ rank: "unique", lines: [null, null, null] });
    expect(withRank(unique, "rare", OPTIONS)).toBeNull();
    expect(withRank(unique, "unique", { ...OPTIONS, potential: null })).toBeNull();
  });

  it("lineChoices: each line once, in order", () => {
    expect(lineChoices(OPTIONS, "unique", 0)).toEqual(["STR +10%", "All Stats +7%"]);
    expect(lineChoices(OPTIONS, "epic", 0)).toEqual([]);
    expect(lineChoices({ ...OPTIONS, potential: null }, "unique", 0)).toEqual([]);
  });
});

describe("summary", () => {
  it("base + stars + flames + hammers, per stat; two-stat lines to both; percentages as extras", () => {
    const d = { ...blankDetails(), stars: 4, flames: { STR: 5, "STR+DEX": 4, "Max HP": 3, "All Stats %": 6 }, hammers: 2 };
    const s = summary(ITEM, OPTIONS, d);
    expect(s.rows).toEqual([
      { stat: "STR", base: 40, stars: 8, flames: 70, hammers: 40, total: 158 }, // 50 + 20 flames; 2 × 20
      { stat: "DEX", base: 40, stars: 0, flames: 20, hammers: 40, total: 100 },
      { stat: "INT", base: 0, stars: 0, flames: 0, hammers: 40, total: 40 },
      { stat: "LUK", base: 0, stars: 0, flames: 0, hammers: 40, total: 40 },
      { stat: "Max HP", base: 0, stars: 0, flames: 300, hammers: 2000, total: 2300 },
      { stat: "Max MP", base: 0, stars: 0, flames: 0, hammers: 2000, total: 2000 },
      { stat: "ATT", base: 5, stars: 4, flames: 0, hammers: 30, total: 39 },
      { stat: "Magic ATT", base: 0, stars: 0, flames: 0, hammers: 30, total: 30 },
    ]);
    expect(s.extras).toEqual(["Ignore Enemy DEF +15%", "Boss Damage +10%", "Max HP +5%", "All Stats +6%"]);
  });

  it("magic attack, required level and speed flames; stats it doesn't have aren't listed", () => {
    const d = { ...blankDetails(), flames: { "M. ATT": 7, "Req. level": 3, Speed: 4 } };
    const s = summary({ stats: { int: 10 } }, OPTIONS, d);
    expect(s.rows).toEqual([
      { stat: "INT", base: 10, stars: 0, flames: 0, hammers: 0, total: 10 },
      { stat: "Magic ATT", base: 0, stars: 0, flames: 7, hammers: 0, total: 7 },
    ]);
    expect(s.extras).toEqual(["Required level -15", "Speed +4"]);
  });

  it("a typed item (no item): only what was picked; a star count past the limit uses the limit", () => {
    const s = summary(null, OPTIONS, { ...blankDetails(), stars: 9 });
    expect(s.rows).toEqual([
      { stat: "STR", base: 0, stars: 10, flames: 0, hammers: 0, total: 10 },
      { stat: "ATT", base: 0, stars: 5, flames: 0, hammers: 0, total: 5 },
    ]);
    expect(summary(null, OPTIONS, { ...blankDetails(), flames: { Nope: 3 } }).extras).toEqual(["Nope +0"]);
    // a listed item without stats (only hammers): its rows come from what was picked
    expect(summary({ hammers: OPTIONS.hammers! }, OPTIONS, { ...blankDetails(), hammers: 1 }).rows[0]).toEqual({ stat: "STR", base: 0, stars: 0, flames: 0, hammers: 20, total: 20 });
  });
});

// ── The editor on the page ──────────────────────────────────────────────────────────────────────
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GearBoard, GearCharacter, GearItemView } from "../src/api/types";
import { App } from "../src/App";
import { BASE_ROUTES, fakeServer, renderWithApp } from "./server";

const SLOTS = [
  ["ring1", "Ring", "ring"], ["hat", "Hat", "hat"], ["emblem", "Emblem", "emblem"],
  ["ring2", "Ring", "ring"], ["pendant1", "Pendant", "pendant"], ["face", "Face", "face"], ["badge", "Badge", "badge"],
  ["ring3", "Ring", "ring"], ["pendant2", "Pendant", "pendant"], ["eye", "Eye", "eye"], ["earrings", "Earrings", "earrings"], ["medal", "Medal", "medal"],
  ["ring4", "Ring", "ring"], ["weapon", "Weapon", "weapon"], ["top", "Top", "top"], ["shoulder", "Shoulder", "shoulder"], ["secondary", "Secondary", "secondary"],
  ["pocket", "Pocket", "pocket"], ["belt", "Belt", "belt"], ["bottom", "Bottom", "bottom"], ["gloves", "Gloves", "gloves"], ["android", "Android", "android"],
  ["shoes", "Shoes", "shoes"], ["cape", "Cape", "cape"], ["heart", "Heart", "heart"],
  ["ringP", "Passive ring", "ring"], ["totem1", "Totem", "totem"], ["totem2", "Totem", "totem"], ["totem3", "Totem", "totem"],
].map(([key, label, kind]) => ({ key: key!, label: label!, kind: kind! }));
const view = (key: string, name: string, slot: string, extra: Partial<GearItemView> = {}): GearItemView => ({ id: Number(key.slice(0, 7)), key, name, slot, jobs: null, level: 200, set: null, group: "g", icon: null, ...extra });
const HAT = view("1000001", "Test Hat", "hat", { stats: { str: 40, dex: 40, att: 5 }, starMax: 5, flames: "boss", potential: "hat" });
const MEDAL = view("1000002", "Test Medal", "medal", { stats: { str: 10 }, starMax: 0, flames: "boss", hammers: OPTIONS.hammers! });
const OZ = view("1000003-4", "Test Oz Ring Lv. 4", "ring", { oz: { kind: "active", level: 4 }, starMax: 0 });
const HAT2 = view("1000004", "Other Hat", "hat", { stats: { str: 10 }, starMax: 5, flames: "boss", potential: "hat" });
const DEFAULTS = { att: 2.44, allStat: 12.21, secRatio: 0.08, bossDmg: 10.12, hp: 0.014, fdPer100: 0.785 };
const char = (over: Partial<GearCharacter> = {}): GearCharacter => ({ id: 7, name: "meowoblush", job: "Night Walker", level: 275, avatar: null, knownJob: true, fits: [HAT.key, MEDAL.key, OZ.key, HAT2.key], equipped: { hat: { item: HAT.key }, medal: { item: MEDAL.key }, ring1: { item: OZ.key } }, details: {}, statValues: DEFAULTS, ...over });
const gearBoard = (c: GearCharacter): GearBoard => ({ generated: "2026-10-24", slots: SLOTS, items: [HAT, MEDAL, OZ, HAT2], jobs: {}, characters: [c] });

async function show(c: GearCharacter, routes: Record<string, unknown> = {}) {
  let saved = gearBoard(c);
  const s = fakeServer({
    ...BASE_ROUTES,
    "GET /gear": () => saved,
    "GET /gear/options": (_: unknown, path: string) => (path.includes("1000002") ? { ...OPTIONS, stars: { min: 0, max: 0, gains: [g(0)], notes: [] }, potential: null } : OPTIONS),
    "PUT /gear/:id/hat/details": (body: GearCharacter["details"][string]) => {
      saved = { ...saved, characters: saved.characters.map((x) => ({ ...x, details: { ...x.details, hat: body } })) };
      return undefined;
    },
    "PUT /gear/:id/medal/details": undefined,
    "PUT /gear/:id/pocket/details": undefined,
    "PUT /gear/:id/stat-values": (body: GearCharacter["statValues"]) => {
      saved = { ...saved, characters: saved.characters.map((x) => ({ ...x, statValues: body })) };
      return undefined;
    },
    ...routes,
  });
  renderWithApp(<App />, "/gear");
  await screen.findByRole("group", { name: "Equipped items" }); // the board has loaded
  return s;
}
const editor = () => within(screen.getByRole("region", { name: /details$/ }));
const icons = () => within(screen.getByRole("group", { name: "Equipped items" }));
const tip = () => within(screen.getByLabelText("Item summary"));

describe("the details editor", () => {
  it("lists the equipped items; the first is edited; stars, the summary and Save", async () => {
    const s = await show(char());
    expect(await icons().findByRole("button", { name: "Test Hat" })).toBeTruthy();
    expect(icons().getByRole("button", { name: /Test Oz Ring Lv\. 4 \(nothing to set\)/ })).toBeTruthy();
    expect(icons().getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Test Oz Ring Lv. 4 (nothing to set)", "Test Hat", "Test Medal"]);
    // the first equipped item in the window's order is the one edited: here the Oz ring, which takes nothing
    expect(icons().getByRole("button", { name: /Oz Ring/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/Test Oz Ring Lv\. 4: nothing to set/)).toBeTruthy();
    await userEvent.click(icons().getByRole("button", { name: "Test Hat" }));
    const stars = await editor().findAllByRole("button", { name: /stars$/ });
    expect(stars).toHaveLength(5);
    expect(editor().getByText("Saved")).toBeTruthy();
    await userEvent.click(editor().getByRole("button", { name: "3 stars" }));
    expect(editor().getByText("Unsaved changes")).toBeTruthy();
    expect(tip().getByText("STR +46")).toBeTruthy(); // 40 + 3 × 2
    expect(editor().getByText(/adds STR \+6, ATT \+3/)).toBeTruthy();
    await userEvent.click(editor().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(s.sent("PUT", "/gear/7/hat/details")).toEqual([{ stars: 3, flames: {}, potential: null, hammers: 0 }]));
    await waitFor(() => expect(editor().getByText("Saved")).toBeTruthy());
    expect(icons().getByRole("button", { name: "Test Hat" }).textContent).toContain("3"); // stars on its icon
  });

  it("an item that takes nothing says so", async () => {
    await show(char());
    await userEvent.click(await icons().findByRole("button", { name: /Oz Ring/ }));
    expect(screen.getByText(/nothing to set \(it takes no stars, potential, flames or hammers\)/)).toBeTruthy();
  });

  it("flames: tiers it can't roll aren't buttons; up to 4 picks; Cancel puts it back", async () => {
    const s = await show(char());
    await userEvent.click(await icons().findByRole("button", { name: "Test Hat" }));
    const grid = within(await screen.findByRole("table"));
    expect(grid.queryByRole("button", { name: "STR tier 2: 20" })).toBeNull();
    for (const name of ["STR tier 5: 50", "STR+DEX tier 4: 20", "Max HP tier 3: 300", "All Stats % tier 6: 6"]) await userEvent.click(grid.getByRole("button", { name }));
    expect(editor().getByText("4 / 4")).toBeTruthy();
    expect(grid.getByRole("button", { name: "Speed tier 3: 3" })).toHaveProperty("disabled", true);
    expect(grid.getByRole("button", { name: "STR tier 6: 60" })).toHaveProperty("disabled", false); // a picked stat can change tier
    expect(tip().getByText("STR +110")).toBeTruthy(); // 40 + 50 + 20
    expect(tip().getByText("All Stats +6%")).toBeTruthy();
    await userEvent.click(editor().getByRole("button", { name: "Cancel" }));
    expect(editor().getByText("0 / 4")).toBeTruthy();
    expect(s.calls.filter((c) => c.method === "PUT")).toEqual([]);
  });

  it("switching to another item drops unsaved changes, without asking", async () => {
    await show(char());
    await userEvent.click(await icons().findByRole("button", { name: "Test Hat" }));
    await userEvent.click(await editor().findByRole("button", { name: "4 stars" }));
    await userEvent.click(icons().getByRole("button", { name: "Test Medal" }));
    await userEvent.click(icons().getByRole("button", { name: "Test Hat" }));
    expect((await editor().findByRole("button", { name: "4 stars" })).getAttribute("aria-pressed")).toBe("false");
    expect(editor().getByText("Saved")).toBeTruthy();
  });

  it("hammers on the items that take them; no stars or potential there", async () => {
    const s = await show(char());
    await userEvent.click(await icons().findByRole("button", { name: "Test Medal" }));
    expect(await editor().findByText("This item can't take stars.")).toBeTruthy();
    expect(editor().getByText("This item can't have potential.")).toBeTruthy();
    await userEvent.click(within(editor().getByRole("group", { name: "Exceptional Hammers" })).getByRole("button", { name: "2" }));
    expect(tip().getByText("STR +50")).toBeTruthy(); // 10 + 2 × 20
    await userEvent.click(editor().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(s.sent("PUT", "/gear/7/medal/details")).toEqual([{ stars: 0, flames: {}, potential: null, hammers: 2 }]));
  });

  it("potential: a rank, then each line from that rank's lines", async () => {
    await show(char());
    await userEvent.click(await icons().findByRole("button", { name: "Test Hat" }));
    await userEvent.selectOptions(await editor().findByRole("combobox", { name: "Potential rank" }), "unique");
    const line1 = editor().getByRole("combobox", { name: "Potential line 1" });
    expect(within(line1).getAllByRole("option").map((o) => o.textContent)).toEqual(["— pick a line —", "STR +10%", "All Stats +7%"]);
    await userEvent.selectOptions(line1, "STR +10%");
    await userEvent.selectOptions(editor().getByRole("combobox", { name: "Potential rank" }), "legendary");
    expect((editor().getByRole("combobox", { name: "Potential line 1" }) as HTMLSelectElement).value).toBe("STR +10%");
    expect(tip().getByText("Legendary potential")).toBeTruthy();
    expect(within(editor().getByRole("combobox", { name: "Potential rank" })).getAllByRole("option").map((o) => o.textContent)).toEqual(["None", "Unique", "Legendary"]);
  });

  it("a typed item asks for its level first, then gets the editor", async () => {
    const s = await show(char({ equipped: { pocket: { other: "Pink Holy Cup" } } }));
    expect(await screen.findByText(/Give its level first/)).toBeTruthy();
    expect(s.calls.filter((c) => c.path.startsWith("/gear/options"))).toEqual([]); // nothing to ask about yet
    await userEvent.type(editor().getByRole("spinbutton", { name: "Item level" }), "140");
    await userEvent.click(editor().getByRole("checkbox", { name: "Boss item" }));
    expect(await editor().findAllByRole("button", { name: /stars$/ })).toHaveLength(5);
    expect(s.calls.some((c) => c.path === "/gear/options?kind=pocket&level=140&boss=1&att=0&matt=0")).toBe(true);
    await userEvent.click(editor().getByRole("button", { name: "Save" }));
    await waitFor(() => expect(s.sent("PUT", "/gear/7/pocket/details")).toEqual([{ stars: 0, flames: {}, potential: null, hammers: 0, other: { kind: "pocket", level: 140, boss: true, att: 0, matt: 0 } }]));
  });

  it("fixed stars (Genesis weapons) are shown, not picked; a minimum above 0 has no 0★ button", async () => {
    const fixed = { ...OPTIONS, stars: { min: 3, max: 3, gains: [0, 1, 2, 3].map(g), notes: [] } };
    await show(char(), { "GET /gear/options": fixed });
    await userEvent.click(icons().getByRole("button", { name: "Test Hat" }));
    expect(await editor().findByText(/3★, fixed \(can't be enhanced\)\. Adds STR \+6, ATT \+3\./)).toBeTruthy();
    expect(editor().queryByRole("button", { name: /stars$/ })).toBeNull();
    expect(tip().getByText("STR +46")).toBeTruthy(); // the draft starts at the minimum
  });

  it("stars below the minimum can't be picked; unconfirmed figures say so", async () => {
    const ranged = { ...OPTIONS, stars: { min: 2, max: 5, gains: [0, 1, 2, 3, 4, 5].map(g), notes: [{ from: 4, text: "From 4★ a note." }, { from: 5, text: "From 5★ another." }] } };
    await show(char(), { "GET /gear/options": ranged });
    await userEvent.click(icons().getByRole("button", { name: "Test Hat" }));
    expect((await editor().findByRole("button", { name: "1 stars" })).hasAttribute("disabled")).toBe(true);
    expect(editor().queryByRole("button", { name: "0★" })).toBeNull();
    expect(editor().queryByText(/a note/)).toBeNull();
    await userEvent.click(editor().getByRole("button", { name: "4 stars" }));
    expect(editor().getByText("From 4★ a note.")).toBeTruthy();
    expect(editor().queryByText("From 5★ another.")).toBeNull(); // each note from its own star
    await userEvent.click(editor().getByRole("button", { name: "5 stars" }));
    expect(editor().getByText("From 5★ another.")).toBeTruthy();
  });

  it("swapping the item in the window drops the old item's details at once", async () => {
    await show(char({ details: { hat: { stars: 4, flames: { STR: 5 }, potential: null, hammers: 0 } } }), { "PUT /gear/:id/hat": () => new Promise(() => {}) });
    expect(icons().getByRole("button", { name: "Test Hat" }).textContent).toContain("4");
    await userEvent.click(within(screen.getByRole("region", { name: "Hat slot" })).getByRole("button", { name: /Other Hat/ }));
    const newIcon = await icons().findByRole("button", { name: "Other Hat" });
    expect(newIcon.textContent).not.toContain("4"); // before the server answers
    await userEvent.click(newIcon);
    expect(await editor().findByText("0 / 4")).toBeTruthy();
    expect(editor().getByText("Saved")).toBeTruthy();
  });

  it("a typed weapon needs its attack before its options", async () => {
    const s = await show(char({ equipped: { weapon: { other: "Event Sword" } } }));
    await userEvent.type(editor().getByRole("spinbutton", { name: "Item level" }), "200");
    expect(await editor().findByText(/Give the weapon's ATT or Magic ATT first/)).toBeTruthy();
    expect(s.calls.filter((c) => c.path.startsWith("/gear/options"))).toEqual([]);
    await userEvent.clear(editor().getByRole("spinbutton", { name: "Weapon attack" }));
    await userEvent.type(editor().getByRole("spinbutton", { name: "Weapon attack" }), "300");
    await waitFor(() => expect(s.calls.some((c) => c.path === "/gear/options?kind=weapon&level=200&boss=0&att=300&matt=0")).toBe(true));
  });

  it("typed gloves have attack boxes too; a typed item's draft is fitted when its level changes", async () => {
    const two = { ...OPTIONS, stars: { min: 0, max: 2, gains: [0, 1, 2].map(g), notes: [] } };
    await show(char({ equipped: { gloves: { other: "Event Gloves" } } }), { "GET /gear/options": (_: unknown, path: string) => (path.includes("level=100&") ? two : OPTIONS), "PUT /gear/:id/gloves/details": undefined });
    await userEvent.type(editor().getByRole("spinbutton", { name: "Item level" }), "140");
    expect(editor().getByRole("spinbutton", { name: "Weapon attack" })).toBeTruthy();
    await userEvent.click(await editor().findByRole("button", { name: "5 stars" }));
    await userEvent.clear(editor().getByRole("spinbutton", { name: "Item level" }));
    await userEvent.type(editor().getByRole("spinbutton", { name: "Item level" }), "100");
    await waitFor(() => expect(editor().getAllByRole("button", { name: /stars$/ })).toHaveLength(2));
    expect(editor().getByText(/^2★$/)).toBeTruthy();
  });

  it("a saved star count below the item's minimum is flagged too (items that now come with 22★)", async () => {
    const fixed = { ...OPTIONS, stars: { min: 3, max: 5, gains: [0, 1, 2, 3, 4, 5].map(g), notes: [] } };
    await show(char({ details: { hat: { stars: 1, flames: {}, potential: null, hammers: 0 } } }), { "GET /gear/options": fixed });
    await userEvent.click(icons().getByRole("button", { name: "Test Hat" }));
    expect(await screen.findByText("Saved with 1★, but this item comes with 3★.")).toBeTruthy();
  });

  it("a typed secondary says it gains stars like armor", async () => {
    await show(char({ equipped: { secondary: { other: "Event Jewel" } } }));
    expect(editor().getByText(/a typed secondary gains stars like armor/)).toBeTruthy();
  });

  it("a saved star count above the item's limit is flagged, not changed", async () => {
    await show(char({ details: { hat: { stars: 9, flames: {}, potential: null, hammers: 0 } } }));
    await userEvent.click(await icons().findByRole("button", { name: "Test Hat" }));
    expect(await screen.findByText("Saved with 9★, but this item now goes to 5★.")).toBeTruthy();
  });

  it("a refused save shows the server's message", async () => {
    await show(char(), { "PUT /gear/:id/hat/details": () => new Response(JSON.stringify({ error: "Stars go from 0 to 5 on this item" }), { status: 400 }) });
    await userEvent.click(await icons().findByRole("button", { name: "Test Hat" }));
    await userEvent.click(await editor().findByRole("button", { name: "2 stars" }));
    await userEvent.click(editor().getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Stars go from 0 to 5 on this item");
  });
});

describe("saving", () => {
  it("Save shows at once, touches only that character, goes in order with other saves, then the board reloads", async () => {
    const answers: (() => void)[] = [];
    const other = char({ id: 8, name: "Second" });
    let board = gearBoard(char());
    board = { ...board, characters: [...board.characters, other] };
    const s = fakeServer({
      ...BASE_ROUTES,
      "GET /gear": () => board,
      "GET /gear/options": OPTIONS,
      "PUT /gear/:id/hat/details": () => new Promise<undefined>((r) => answers.push(() => r(undefined))),
      "PUT /gear/:id/stat-values": () => new Promise<undefined>((r) => answers.push(() => r(undefined))),
    });
    renderWithApp(<App />, "/gear");
    await screen.findByRole("group", { name: "Equipped items" });
    await userEvent.click(icons().getByRole("button", { name: "Test Hat" }));
    await userEvent.click(await editor().findByRole("button", { name: "2 stars" }));
    await userEvent.click(editor().getByRole("button", { name: "Save" }));
    expect(icons().getByRole("button", { name: "Test Hat" }).textContent).toContain("2"); // before the server answers
    expect(editor().getByText("Saved")).toBeTruthy();
    const att = within(screen.getByRole("group", { name: "Stat values" })).getByRole("spinbutton", { name: "1 ATT =" });
    await userEvent.clear(att);
    await userEvent.type(att, "3{Enter}");
    expect(await within(screen.getByRole("group", { name: "Stat values" })).findByText("(default 2.44)")).toBeTruthy(); // shown at once
    expect(s.calls.filter((c) => c.method === "PUT").map((c) => c.path)).toEqual(["/gear/7/hat/details"]); // the second waits
    await userEvent.click(screen.getByRole("tab", { name: /Second/ }));
    expect(within(await screen.findByRole("group", { name: "Stat values" })).getByRole("spinbutton", { name: "1 ATT =" })).toHaveProperty("value", "2.44");
    expect(icons().getByRole("button", { name: "Test Hat" }).textContent).not.toContain("2"); // the other character's hat
    const loads = () => s.calls.filter((c) => c.method === "GET" && c.path.startsWith("/gear?")).length;
    const before = loads();
    answers.shift()!();
    await waitFor(() => expect(s.calls.filter((c) => c.method === "PUT").map((c) => c.path)).toEqual(["/gear/7/hat/details", "/gear/7/stat-values"]));
    answers.shift()!();
    await waitFor(() => expect(loads()).toBeGreaterThan(before));
    expect(s.calls.filter((c) => c.method === "GET" && c.path === "/settings")).toHaveLength(1); // only the gear reloads
  });
});

describe("saving reloads only the gear, and doesn't interrupt other loading", () => {
  it.each([
    ["details", async () => {
      await userEvent.click(icons().getByRole("button", { name: "Test Hat" }));
      await userEvent.click(await editor().findByRole("button", { name: "2 stars" }));
      await userEvent.click(editor().getByRole("button", { name: "Save" }));
    }],
    ["stat values", async () => {
      const att = within(screen.getByRole("group", { name: "Stat values" })).getByRole("spinbutton", { name: "1 ATT =" });
      await userEvent.clear(att);
      await userEvent.type(att, "3{Enter}");
    }],
  ])("%s", async (_, act) => {
    let release = () => {};
    const s = await show(char(), { "GET /settings": () => new Promise((r) => (release = () => r({ theme: "pochacco", worldId: 45 }))) });
    const loads = () => s.calls.filter((c) => c.method === "GET" && c.path.startsWith("/gear?")).length;
    const before = loads();
    await act();
    await waitFor(() => expect(loads()).toBeGreaterThan(before));
    release();
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("pochacco"));
  });
});

describe("stat values", () => {
  it("shows the defaults, saves a change when you leave the box, and resets", async () => {
    const s = await show(char());
    const box = within(await screen.findByRole("group", { name: "Stat values" }));
    const att = box.getByRole("spinbutton", { name: "1 ATT =" }) as HTMLInputElement;
    expect([att.value, (box.getByRole("spinbutton", { name: "Final damage per 100 flame score" }) as HTMLInputElement).value]).toEqual(["2.44", "0.785"]);
    expect(box.getByRole("button", { name: "Reset to defaults" })).toHaveProperty("disabled", true);
    await userEvent.clear(att);
    await userEvent.type(att, "2.6{Enter}");
    await waitFor(() => expect(s.sent("PUT", "/gear/7/stat-values")).toEqual([{ ...DEFAULTS, att: 2.6 }]));
    expect(await box.findByText("(default 2.44)")).toBeTruthy();
    await userEvent.click(box.getByRole("button", { name: "Reset to defaults" }));
    await waitFor(() => expect(s.sent("PUT", "/gear/7/stat-values")).toEqual([{ ...DEFAULTS, att: 2.6 }, DEFAULTS]));
  });

  it("an emptied or negative box is put back, not saved", async () => {
    const s = await show(char());
    const att = within(await screen.findByRole("group", { name: "Stat values" })).getByRole("spinbutton", { name: "1 ATT =" }) as HTMLInputElement;
    await userEvent.clear(att);
    await userEvent.tab();
    expect(att.value).toBe("2.44");
    await userEvent.type(att, "{selectall}-3{Enter}");
    expect(att.value).toBe("2.44");
    expect(s.calls.filter((c) => c.method === "PUT")).toEqual([]);
  });
});
