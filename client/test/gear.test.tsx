import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GearBoard, GearCharacter, GearItemView } from "../src/api/types";
import { App } from "../src/App";
import { byKey, counted, grouped, LAYOUT, listed, opener, options, ozElsewhere, setCounts, TOTEMS, withGear, type Equipped } from "../src/lib/gear";
import { BASE_ROUTES, fakeServer, renderWithApp } from "./server";

afterEach(() => vi.useRealTimers());

// The window's slots, as the server sends them.
const SLOTS = [
  ["ring1", "Ring", "ring"], ["hat", "Hat", "hat"], ["emblem", "Emblem", "emblem"],
  ["ring2", "Ring", "ring"], ["pendant1", "Pendant", "pendant"], ["face", "Face", "face"], ["badge", "Badge", "badge"],
  ["ring3", "Ring", "ring"], ["pendant2", "Pendant", "pendant"], ["eye", "Eye", "eye"], ["earrings", "Earrings", "earrings"], ["medal", "Medal", "medal"],
  ["ring4", "Ring", "ring"], ["weapon", "Weapon", "weapon"], ["top", "Top", "top"], ["shoulder", "Shoulder", "shoulder"], ["secondary", "Secondary", "secondary"],
  ["pocket", "Pocket", "pocket"], ["belt", "Belt", "belt"], ["bottom", "Bottom", "bottom"], ["gloves", "Gloves", "gloves"], ["android", "Android", "android"],
  ["shoes", "Shoes", "shoes"], ["cape", "Cape", "cape"], ["heart", "Heart", "heart"],
  ["ringP", "Passive ring", "ring"], ["totem1", "Totem", "totem"], ["totem2", "Totem", "totem"], ["totem3", "Totem", "totem"],
].map(([key, label, kind]) => ({ key: key!, label: label!, kind: kind! }));

// Made-up items, a few per slot.
const item = (key: string, name: string, slot: string, extra: Partial<GearItemView> = {}): GearItemView => ({ id: Number(key.slice(0, 7)), key, name, slot, jobs: null, level: 200, set: null, group: "Other", icon: null, ...extra });
const absolab = (key: string, name: string, slot: string, extra: Partial<GearItemView> = {}) => item(key, name, slot, { set: "AbsoLab", group: "AbsoLab", level: 160, jobs: ["Thief"], ...extra });
const HAT = absolab("1000001", "AbsoLab Bandit Cap", "hat", { icon: "/item-icons/1000001.png" });
const ROYAL = item("1000009", "Royal Assassin Hood", "hat", { set: "Root Abyss", group: "Root Abyss", level: 150, jobs: ["Thief"] });
const SUIT = absolab("1000002", "AbsoLab Bandit Suit", "top", { overall: true });
const SHIRT = item("1000008", "Eternal Thief Shirt", "top", { set: "Eternal", group: "Eternal", level: 250 });
const PANTS = item("1000003", "Eternal Thief Pants", "bottom", { set: "Eternal", group: "Eternal", level: 250 });
const SHOES = absolab("1000004", "AbsoLab Bandit Shoes", "shoes");
const GLOVES = absolab("1000005", "AbsoLab Bandit Gloves", "gloves");
const GENESIS = item("1000010", "Genesis Guards", "weapon", { lucky: true, group: "Lucky weapons", weaponType: "Claw", jobs: ["Thief"] });
const CLAW = absolab("1000011", "AbsoLab Revenge Guard", "weapon", { weaponType: "Claw" });
const SWORD = item("1000030", "AbsoLab Furious Sword", "weapon", { set: "AbsoLab", weaponType: "Sword", jobs: ["Ren"] });
const PENDANT = item("1000020", "Dominator Pendant", "pendant", { set: "Boss Accessory", group: "Boss Accessory", level: 140 });
const oz = (key: string, name: string, kind: "active" | "passive", level: number) => item(key, `${name} Lv. ${level}`, "ring", { group: "Oz rings", level: 110, oz: { kind, level } });
const R3 = oz("1113098-3", "Ring of Restraint", "active", 3);
const R4 = oz("1113098-4", "Ring of Restraint", "active", 4);
const C4 = oz("1113329-4", "Continuous Ring", "active", 4);
const C5 = oz("1113329-5", "Continuous Ring", "active", 5);
const WJ = oz("1113116-4", "Weapon Jump L Ring", "passive", 4);
const RING = item("1000040", "Treasure Hunter John's Ring", "ring", { group: "Other rings", level: 50 });
const ITEMS = [HAT, ROYAL, SUIT, SHIRT, PANTS, SHOES, GLOVES, GENESIS, CLAW, SWORD, PENDANT, R4, R3, C5, C4, WJ, RING];
// Built by hand (not with byKey, which is tested on its own below).
const items = new Map(ITEMS.map((i) => [i.key, i]));

const walker = (equipped: Equipped = {}, extra: Partial<GearCharacter> = {}): GearCharacter => ({ id: 7, name: "meowoblush", job: "Night Walker", level: 275, avatar: null, knownJob: true, fits: ITEMS.filter((i) => i !== SWORD).map((i) => i.key), equipped, details: {}, statBoxes: { pct: [{ stat: "LUK" as const, field: "lukPct" as const, main: true, default: 12.97 }, { stat: "DEX" as const, field: "dexPct" as const, main: false, default: 1.68 }], magic: false, secondary: true, allStat: true }, statValues: { att: 4, allStat: 14.65, secRatio: 0.125, bossDmg: 12, fdPer100: 0.785, strPct: null, dexPct: null, intPct: null, lukPct: null, hpPct: null, attPct: 53.82, critDmg: 42.38, ied300: 15.6, ied380: 20.52, bossDef: 380 as const, cooldown: null }, ...extra });
const board = (characters: GearCharacter[]): GearBoard => ({ generated: "2026-10-23", slots: SLOTS, items: ITEMS, jobs: { "Night Walker": { branches: ["Thief"], weapons: ["Claw"] } }, characters });
const on = (...pairs: [string, GearItemView | string][]): Equipped => Object.fromEntries(pairs.map(([slot, x]) => [slot, typeof x === "string" ? { other: x } : { item: x.key }]));

describe("the gear rules", () => {
  it("the window is 5 × 6 with each slot once, the passive ring slot and totems outside it", () => {
    expect(LAYOUT).toHaveLength(30);
    const keys = LAYOUT.filter((k) => k !== null);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set([...keys, "ringP", ...TOTEMS])).toEqual(new Set(SLOTS.map((s) => s.key)));
    expect([LAYOUT[0], LAYOUT[1], LAYOUT[2], LAYOUT[29]]).toEqual(["ring1", null, "hat", "heart"]);
  });

  it("byKey: items by their key", () => {
    expect(byKey([HAT, R4])).toEqual(new Map([[HAT.key, HAT], [R4.key, R4]]));
  });

  it("listed: the item in a slot, not a typed one, an unknown key or an empty slot", () => {
    const eq = { ...on(["hat", HAT], ["top", "My event top"]), face: { item: "9999999" } };
    expect(listed(eq, "hat", items)).toBe(HAT);
    expect([listed(eq, "top", items), listed(eq, "face", items), listed(eq, "eye", items)]).toEqual([undefined, undefined, undefined]);
  });

  it("opener: the ring slot with Restraint or Continuous at Lv. 4+", () => {
    expect(opener(on(["ring1", R3]), items)).toBeNull();
    expect(opener(on(["ring1", WJ], ["ring3", R4]), items)).toBe("ring3");
    expect(opener(on(["ring4", C4]), items)).toBe("ring4");
    expect(opener(on(["ringP", R4], ["ring2", RING]), items)).toBeNull(); // only the four ring slots open it
    expect(opener({}, items)).toBeNull();
  });

  it("counted: a bottom under an overall doesn't count, nor a passive ring in a closed slot or doubling the Continuous", () => {
    expect(counted(on(["top", SUIT], ["bottom", PANTS]), "bottom", items)).toBe(false);
    expect(counted(on(["top", SHIRT], ["bottom", PANTS]), "bottom", items)).toBe(true);
    expect(counted(on(["top", "Typed overall"], ["bottom", PANTS]), "bottom", items)).toBe(true);
    expect(counted(on(["bottom", PANTS]), "bottom", items)).toBe(true);
    expect(counted(on(["ringP", WJ]), "ringP", items)).toBe(false);
    expect(counted(on(["ring1", R3], ["ringP", WJ]), "ringP", items)).toBe(false);
    expect(counted(on(["ring1", R4], ["ringP", WJ]), "ringP", items)).toBe(true);
    expect(counted(on(["ring1", R4], ["ringP", C5]), "ringP", items)).toBe(true);
    expect(counted(on(["ring1", C4], ["ringP", C5]), "ringP", items)).toBe(false);
    expect(counted(on(["ring1", C4], ["ringP", WJ]), "ringP", items)).toBe(true);
    expect(counted(on(["ring1", C4], ["ringP", "typed"]), "ringP", items)).toBe(true);
    expect(counted(on(["top", SUIT], ["hat", HAT]), "hat", items)).toBe(true);
  });

  it("setCounts: pieces per set, biggest first, a covered bottom left out", () => {
    const eq = on(["hat", HAT], ["top", SUIT], ["bottom", PANTS], ["shoes", SHOES], ["pendant1", PENDANT], ["face", "typed"]);
    expect(setCounts(eq, items)).toEqual({
      sets: [
        { set: "AbsoLab", count: 3, lucky: false },
        { set: "Boss Accessory", count: 1, lucky: false },
      ],
      lucky: null,
    });
    // with a shirt instead, the pants count: ties go by name
    expect(setCounts(on(["top", SHIRT], ["bottom", PANTS], ["hat", HAT], ["shoes", SHOES]), items).sets).toEqual([
      { set: "AbsoLab", count: 2, lucky: false },
      { set: "Eternal", count: 2, lucky: false },
    ]);
    expect(setCounts({}, items)).toEqual({ sets: [], lucky: null });
  });

  it("setCounts: a lucky weapon adds one to each armor set with 3+ pieces, not to smaller ones or accessory sets", () => {
    const eq = on(["weapon", GENESIS], ["hat", HAT], ["top", SUIT], ["shoes", SHOES], ["pendant1", PENDANT], ["pendant2", PENDANT], ["face", PENDANT], ["top2", SHIRT], ["bottom2", PANTS]);
    expect(setCounts(eq, items)).toEqual({
      sets: [
        { set: "AbsoLab", count: 4, lucky: true },
        { set: "Boss Accessory", count: 3, lucky: false },
        { set: "Eternal", count: 2, lucky: false },
      ],
      lucky: GENESIS,
    });
    expect(setCounts(on(["weapon", GENESIS], ["hat", HAT], ["shoes", SHOES]), items).sets).toEqual([{ set: "AbsoLab", count: 2, lucky: false }]);
    // each armor set gets it
    for (const set of ["Root Abyss", "AbsoLab", "Arcane Umbra", "Eternal"]) {
      const piece = (k: string, slot: string) => item(k, `${set} ${slot}`, slot, { set });
      const own = byKey([GENESIS, piece("2000001", "hat"), piece("2000002", "shoes"), piece("2000003", "cape")]);
      const worn = { weapon: { item: GENESIS.key }, hat: { item: "2000001" }, shoes: { item: "2000002" }, cape: { item: "2000003" } };
      expect(setCounts(worn, own).sets).toEqual([{ set, count: 4, lucky: true }]);
    }
    // the set's own weapon instead: no lucky item, the claw is a piece
    expect(setCounts(on(["weapon", CLAW], ["hat", HAT], ["shoes", SHOES]), items)).toEqual({ sets: [{ set: "AbsoLab", count: 3, lucky: false }], lucky: null });
  });

  it("options: the slot's kind that the character can wear; the passive slot's passive rings and Continuous", () => {
    const c = walker(on(["ring1", R4]));
    const b = board([c]);
    expect(options(b, c, "hat", items)).toEqual([HAT, ROYAL]);
    expect(options(b, c, "weapon", items)).toEqual([GENESIS, CLAW]); // not the sword
    expect(options(b, c, "ring2", items)).toEqual([R4, R3, C5, C4, WJ, RING]);
    expect(options(b, c, "ringP", items)).toEqual([C5, C4, WJ]);
    const cont = walker(on(["ring1", C4]));
    expect(options(board([cont]), cont, "ringP", items)).toEqual([WJ]);
    expect(options(b, c, "android", items)).toEqual([]);
    expect(options(b, c, "nowhere", items)).toEqual([]);
  });

  it("ozElsewhere: the special skill ring in another of the four ring slots", () => {
    const eq = on(["ring1", R4], ["ring2", RING], ["ringP", WJ]);
    expect(ozElsewhere(eq, "ring3", items)).toBe(R4);
    expect(ozElsewhere(eq, "ring1", items)).toBeNull();
    expect(ozElsewhere(eq, "ringP", items)).toBeNull();
    expect(ozElsewhere(eq, "hat", items)).toBeNull();
    expect(ozElsewhere(on(["ring1", RING]), "ring2", items)).toBeNull();
  });

  it("grouped: groups in the list's order, each by level then Oz level", () => {
    const noLevel = item("1000050", "No level", "ring", { group: "Other rings", level: null });
    const sameLevel = item("1000051", "Also Lv. 50", "ring", { group: "Other rings", level: 50 });
    expect(grouped([R4, RING, R3, noLevel, C5, sameLevel, WJ]).map((g) => [g.group, g.items.map((i) => i.name)])).toEqual([
      ["Oz rings", ["Ring of Restraint Lv. 3", "Ring of Restraint Lv. 4", "Weapon Jump L Ring Lv. 4", "Continuous Ring Lv. 5"]],
      ["Other rings", ["No level", "Treasure Hunter John's Ring", "Also Lv. 50"]], // same level: as listed
    ]);
    expect(grouped([])).toEqual([]);
  });

  it("withGear: what's equipped after a save", () => {
    const eq = on(["hat", HAT], ["face", "typed"]);
    expect(withGear(eq, "hat", { item: ROYAL.key })).toEqual(on(["hat", ROYAL], ["face", "typed"]));
    expect(withGear(eq, "eye", { other: "  Event eye  " })).toEqual(on(["hat", HAT], ["face", "typed"], ["eye", "Event eye"]));
    expect(withGear(eq, "hat", { clear: true })).toEqual(on(["face", "typed"]));
    expect(eq).toEqual(on(["hat", HAT], ["face", "typed"])); // unchanged
  });
});

// The fake server keeps what's saved, as the real one does, so the reload after a save shows it.
// The Flames board for these tests: nothing flameable (the scores have their own tests).
const NO_FLAMES = { known: true, price: 3_000_000, budget: 10_000_000_000, items: [] };
function show(b: GearBoard, routes: Record<string, unknown> = {}) {
  let saved = b;
  const put = (body: Record<string, string | boolean>, path: string) => {
    const [, , id, slot] = path.split("/");
    saved = {
      ...saved,
      characters: saved.characters.map((c) => {
        if (c.id !== Number(id)) return c;
        const equipped = { ...c.equipped };
        delete equipped[slot!];
        if (typeof body.item === "string") equipped[slot!] = { item: body.item };
        if (typeof body.other === "string") equipped[slot!] = { other: body.other };
        return { ...c, equipped };
      }),
    };
    return undefined;
  };
  const s = fakeServer({ ...BASE_ROUTES, "GET /gear": () => saved, "GET /gear/:id/flames": NO_FLAMES, "PUT /gear/:id/hat": put, "PUT /gear/:id/ring2": put, "PUT /gear/:id/ringP": put, "PUT /gear/:id/pendant1": put, ...routes });
  renderWithApp(<App />, "/gear");
  return s;
}
// Waits for the board to load.
const ready = () => screen.findByRole("region", { name: "Equipment window" });
const windowPart = () => within(screen.getByRole("region", { name: "Equipment window" }));
const panel = () => within(screen.getByRole("region", { name: /slot$/ }));
const slotButton = (label: RegExp) => windowPart().getByRole("button", { name: label });

describe("the Gear tab", () => {
  it("shows the window with what's equipped, and the hat slot's list", async () => {
    show(board([walker(on(["hat", HAT], ["face", "Event face"]))]));
    await ready();
    expect(await screen.findByRole("heading", { level: 1, name: "Gear" })).toBeTruthy();
    await waitFor(() => expect(slotButton(/^Hat: AbsoLab Bandit Cap/)).toBeTruthy());
    expect(slotButton(/^Hat/).querySelector("img")?.getAttribute("src")).toBe("/item-icons/1000001.png");
    expect(slotButton(/^Face: Event face/).textContent).toContain("Event face");
    expect(slotButton(/^Eye: empty/)).toBeTruthy();
    expect(within(screen.getByRole("group", { name: "Totems" })).getAllByRole("button")).toHaveLength(3);
    expect(panel().getByRole("heading").textContent).toBe("Hat");
    expect(panel().getByRole("button", { name: /AbsoLab Bandit Cap/ }).getAttribute("aria-pressed")).toBe("true");
    expect(panel().getByRole("button", { name: /Royal Assassin Hood/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("picking an item, None, or a typed one saves it and shows it at once", async () => {
    const s = show(board([walker(on(["hat", HAT]))]));
    await ready();
    await userEvent.click(await panel().findByRole("button", { name: /Royal Assassin Hood/ }));
    await waitFor(() => expect(slotButton(/^Hat: Royal Assassin Hood/)).toBeTruthy());
    expect(s.sent("PUT", "/gear/7/hat")).toEqual([{ item: ROYAL.key }]);
    await userEvent.click(panel().getByRole("button", { name: /None/ }));
    expect(s.sent("PUT", "/gear/7/hat")).toEqual([{ item: ROYAL.key }, { clear: true }]);
    await userEvent.type(panel().getByRole("textbox", { name: "Other item" }), "  Event hat {Enter}");
    expect(s.sent("PUT", "/gear/7/hat")).toEqual([{ item: ROYAL.key }, { clear: true }, { other: "Event hat" }]);
  });

  it("clicking another slot shows its list; the weapon list is the character's own", async () => {
    show(board([walker()]));
    await ready();
    await userEvent.click(await windowPart().findByRole("button", { name: /^Weapon: empty/ }));
    expect(panel().getByRole("heading").textContent).toBe("Weapon");
    expect(panel().getByRole("button", { name: /Genesis Guards/ }).textContent).toContain("lucky item");
    expect(panel().queryByRole("button", { name: /Furious Sword/ })).toBeNull();
    expect(panel().getByRole("group", { name: "Lucky weapons" })).toBeTruthy();
  });

  it("an overall greys out a saved bottom, which isn't counted, but can still be emptied", async () => {
    const s = show(board([walker(on(["top", SUIT], ["bottom", PANTS], ["hat", HAT], ["shoes", SHOES]))]), { "PUT /gear/:id/bottom": undefined });
    await ready();
    const bottom = await windowPart().findByRole("button", { name: /^Bottom: Eternal Thief Pants \(not counted/ });
    expect(bottom.className).toContain("covered");
    const sets = within(screen.getByLabelText("Sets"));
    expect(sets.getByText("AbsoLab").parentElement?.textContent).toContain("3");
    expect(sets.queryByText("Eternal")).toBeNull();
    await userEvent.click(bottom);
    expect(panel().getByRole("heading").textContent).toBe("Bottom");
    expect(panel().getByText(/overall covers the bottom/)).toBeTruthy();
    await userEvent.click(panel().getByRole("button", { name: /None/ }));
    expect(s.sent("PUT", "/gear/7/bottom")).toEqual([{ clear: true }]);
  });

  it("a name typed but not used doesn't follow you to another slot", async () => {
    const s = show(board([walker()]));
    await ready();
    await userEvent.click(slotButton(/^Pocket:/));
    await userEvent.type(panel().getByRole("textbox", { name: "Other item" }), "Pink Holy Cup");
    await userEvent.click(slotButton(/^Belt:/));
    expect(panel().getByRole("textbox", { name: "Other item" })).toHaveProperty("value", "");
    expect(s.calls.filter((c) => c.method === "PUT")).toEqual([]);
  });

  it("each group sits in the one scrolling list (groups don't scroll on their own)", async () => {
    show(board([walker()]));
    await ready();
    await userEvent.click(windowPart().getAllByRole("button", { name: /^Ring: empty/ })[0]!);
    const groups = panel().getAllByRole("group");
    expect(groups.length).toBeGreaterThan(1);
    expect(groups.every((g) => !g.classList.contains("gear-list") && g.closest(".gear-list") !== null)).toBe(true);
  });

  it("set counts show the lucky item's +1", async () => {
    show(board([walker(on(["weapon", GENESIS], ["top", SUIT], ["hat", HAT], ["shoes", SHOES]))]));
    await ready();
    const row = within(screen.getByLabelText("Sets")).getByText("AbsoLab").parentElement!;
    expect(row.textContent).toContain("+1 lucky (Genesis Guards)");
    expect(row.querySelector("b")?.textContent).toBe("4");
  });

  it("only one special skill ring in the ring slots: the others are off in the other ring slots", async () => {
    show(board([walker(on(["ring1", R3]))]));
    await ready();
    await userEvent.click(windowPart().getAllByRole("button", { name: /^Ring: empty/ })[0]!);
    expect(panel().getByRole("button", { name: /Ring of Restraint Lv\. 4/ })).toHaveProperty("disabled", true);
    expect(panel().getByRole("button", { name: /Weapon Jump L Ring/ })).toHaveProperty("disabled", true);
    expect(panel().getByRole("button", { name: /Treasure Hunter/ })).toHaveProperty("disabled", false);
    expect(panel().getByText(/Ring of Restraint Lv\. 3 is in one/)).toBeTruthy();
    // in its own slot it can be swapped
    await userEvent.click(slotButton(/^Ring: Ring of Restraint Lv\. 3/));
    expect(panel().getByRole("button", { name: /Ring of Restraint Lv\. 4/ })).toHaveProperty("disabled", false);
  });

  it("a Lv. 4+ Restraint shows the + for the passive ring slot, which lists the passive rings", async () => {
    const s = show(board([walker(on(["ring2", R4]))]));
    await ready();
    const plus = await windowPart().findByRole("button", { name: "Passive ring: empty" });
    expect(plus.textContent).toBe("+");
    await userEvent.click(plus);
    expect(panel().getByRole("heading").textContent).toBe("Passive ring");
    expect(panel().getAllByRole("button").map((b) => b.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("Weapon Jump L Ring Lv. 4"), expect.stringContaining("Continuous Ring Lv. 4")]));
    expect(panel().queryByRole("button", { name: /Ring of Restraint/ })).toBeNull();
    expect(panel().queryByRole("textbox")).toBeNull(); // no typed passive ring
    await userEvent.click(panel().getByRole("button", { name: /Weapon Jump L Ring/ }));
    expect(s.sent("PUT", "/gear/7/ringP")).toEqual([{ item: WJ.key }]);
  });

  it("with no Lv. 4+ opener, there's no +, and a kept passive ring shows faded on the first ring slot", async () => {
    show(board([walker(on(["ring2", R3], ["ringP", WJ]))]));
    await ready();
    const kept = await windowPart().findByRole("button", { name: /^Passive ring, kept but not counted: Weapon Jump L Ring Lv\. 4/ });
    expect(windowPart().queryByRole("button", { name: /^Passive ring: / })).toBeNull();
    await userEvent.click(kept);
    expect(panel().getByText(/passive ring slot is closed/)).toBeTruthy();
    expect(panel().queryByRole("button", { name: /Weapon Jump/ })).toBeNull();
    expect(panel().getByRole("button", { name: /None/ })).toBeTruthy();
  });

  it("an unknown job gets a note; a refused save shows the server's message", async () => {
    show(board([walker({}, { job: "Some New Job", knownJob: false })]), { "PUT /gear/:id/hat": () => new Response(JSON.stringify({ error: "meowoblush (Night Walker) can't wear Royal Assassin Hood" }), { status: 400 }) });
    await ready();
    expect(await screen.findByText(/Some New Job isn't in the item list yet/)).toBeTruthy();
    await userEvent.click(panel().getByRole("button", { name: /Royal Assassin Hood/ }));
    expect((await screen.findByRole("alert")).textContent).toBe("meowoblush (Night Walker) can't wear Royal Assassin Hood");
    await waitFor(() => expect(slotButton(/^Hat: empty/)).toBeTruthy());
  });

  it("switching character shows theirs", async () => {
    const other = walker(on(["hat", ROYAL]), { id: 8, name: "Second" });
    show(board([walker(on(["hat", HAT])), other]));
    await ready();
    await userEvent.click(await screen.findByRole("tab", { name: /Second/ }));
    expect(slotButton(/^Hat: Royal Assassin Hood/)).toBeTruthy();
  });

  it("a save shows at once, touches only that character, and goes one at a time; then only the gear reloads", async () => {
    const answers: (() => void)[] = [];
    const other = walker({}, { id: 8, name: "Second" });
    const s = show(board([walker(), other]), { "PUT /gear/:id/hat": () => new Promise<undefined>((r) => answers.push(() => r(undefined))) });
    await ready();
    await userEvent.click(panel().getByRole("button", { name: /Royal Assassin Hood/ }));
    expect(slotButton(/^Hat: Royal Assassin Hood/)).toBeTruthy(); // before the server answers
    await userEvent.click(panel().getByRole("button", { name: /AbsoLab Bandit Cap/ }));
    await waitFor(() => expect(s.sent("PUT", "/gear/7/hat")).toEqual([{ item: ROYAL.key }])); // the second waits
    await userEvent.click(screen.getByRole("tab", { name: /Second/ }));
    expect(slotButton(/^Hat: empty/)).toBeTruthy();
    answers.shift()!();
    await waitFor(() => expect(s.sent("PUT", "/gear/7/hat")).toHaveLength(2));
    answers.shift()!();
    await waitFor(() => expect(s.calls.filter((c) => c.method === "GET" && c.path.startsWith("/gear")).length).toBeGreaterThanOrEqual(2));
    expect(s.calls.filter((c) => c.method === "GET" && c.path === "/settings")).toHaveLength(1);
  });

  it("a save doesn't interrupt other loading (the saved settings)", async () => {
    let release = () => {};
    show(board([walker()]), { "GET /settings": () => new Promise((r) => (release = () => r({ theme: "pochacco", worldId: 45 }))) });
    await ready();
    await userEvent.click(await panel().findByRole("button", { name: /Royal Assassin Hood/ }));
    release();
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("pochacco"));
  });

  it("after each check of Nexon, the gear loads again (levels and jobs)", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 20, 11, 59)));
    let finishedAt = "2026-10-20T08:00:30.000Z";
    const s = show(board([walker()]), { "GET /refresh": () => ({ last: { startedAt: "2026-10-20T08:00:00.000Z", finishedAt, checked: 1, updated: 1, missing: 0, failed: 0, problem: null } }) });
    // the board itself (not the Flames numbers or an item's options, which also start with /gear)
    const loads = () => s.calls.filter((c) => c.method === "GET" && c.path === "/gear?world=45").length;
    await vi.waitFor(() => expect(loads()).toBe(1));
    await new Promise((r) => setTimeout(r, 50)); // the first answer about the last check has arrived
    finishedAt = "2026-10-20T12:00:30.000Z";
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.waitFor(() => expect(loads()).toBe(2));
  });

  it("no characters: says to add them on Home", async () => {
    show(board([]));
    expect(await screen.findByText(/No characters on Kronos yet/)).toBeTruthy();
  });
});
