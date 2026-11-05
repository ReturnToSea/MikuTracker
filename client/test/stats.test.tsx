import { STAT_VALUES_UNTYPED, STATS_DEFAULTS, type StatsInput } from "@miku/shared";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { App } from "../src/App";
import { useSaveGear, useSaveGearDetails, useSaveStatValues, useSaveSymbol } from "../src/api/hooks";
import type { CharacterList, StatsBoard } from "../src/api/types";
import { BASE_ROUTES, fakeServer, renderWithApp } from "./server";

// A made-up board: the numbers are the server's to work out (tested there); here, what the page shows and does.
const TABS = {
  characters: [
    { id: 1, name: "LeafDancer", job: "Mercedes", level: 286, avatar: null },
    { id: 2, name: "StarGazer", job: "Sia Astelle", level: 275, avatar: null },
    { id: 3, name: "Newcomer", job: "Jett", level: 270, avatar: null },
  ],
  selectedId: 1,
} as unknown as CharacterList;
const INPUT: StatsInput = { ...structuredClone(STATS_DEFAULTS), stats: { ...STATS_DEFAULTS.stats, main: { base: 7812, per: 784, abs: 28770 }, dmg: 120 }, liberation: true, buffA: "legendaryHero", guild: { ...STATS_DEFAULTS.guild, bossSlayers: 15 } };
const BOARD: StatsBoard = {
  known: true,
  shine: false,
  input: INPUT,
  labels: { main: "DEX", sub: "STR", third: null, atk: "Attack" },
  options: { ruinShield: false, oneHanded: false, magic: false },
  level: 286,
  heroic: true,
  sacred: false,
  hexa: [
    { node: "origin", name: "Wrath of Enlil", level: 1, icon: "/item-icons/hexa/Mercedes_1.png" },
    { node: "ascent", name: "Ascent", level: 2, icon: null },
  ],
  rings: { restraint: "/item-icons/1113098.png", continuous: null, weapon: null },
  icons: { sayramElixir: "/item-icons/stats/sayramElixir.png" },
  out: { finalDamage: 139.3523, generalRange: 272_801_300, atkTotal: 9_830, score380: 91_609, score300: 90_819, normal380: 99_001, normal300: 98_002 },
  efficiency: { bossDmg: 12.726, att: 3.929, attPct: 47.496, critDmg: 38.448, ied300: 14.146, ied380: 18.606, mainPct: 11.004, mainFlat: 0.222, sub: 0.13, subPct: 1.502, third: null, thirdPct: null, allStatPct: 12.506, fdPer100: 1.1, cooldown: { 2: 1.46, 3: 3.28, 4: 4.37, 5: 6.54, 6: 7.8 } },
  bosses: [
    { key: "normal_kalos", boss: "kalos", name: "Kalos", difficulty: "Normal", partyLimit: 6, partyOnly: false, rate: 0.405, shown: 0.405, tag: "Party-able", bossStat: 34_370, need: 50_458, icon: "/item-icons/bosses/normal_kalos.png", loss: 0.4624,
      gaps: [{ kind: "level", you: 278, boss: 280, full: 285, loss: 0.16 }, { kind: "sacred", you: 280, boss: 300, full: 350, loss: 0.36 }],
      phases: [{ name: "Phase 1", hp: [224_448e9] }, { name: "Phase 2", hp: [120_240e9, 120_240e9, 120_240e9, 120_240e9] }], cannotEnter: false },
    { key: "champion_seren", boss: "seren", name: "Seren", difficulty: "Champion", partyLimit: 1, partyOnly: false, rate: 0.957, shown: 0.957, tag: "Solo Min", bossStat: 44_063, need: 44_900, icon: null, loss: 0, gaps: [{ kind: "level", you: 290, boss: 285, full: 290, loss: 0 }], phases: null, cannotEnter: false },
    { key: "normal_lotus", boss: "lotus", name: "Lotus", difficulty: "Normal", partyLimit: 6, partyOnly: false, rate: 451.7, shown: 451.7, tag: "Easy", bossStat: 45_409, need: 900, icon: null, loss: 0, gaps: [{ kind: "level", you: 286, boss: 210, full: 215, loss: 0 }], phases: null, cannotEnter: false },
  ],
  source: "MapleScouter's (read 2026-11-03)",
};

// (the fake server keeps what's saved, as the real one does)
function show(board: StatsBoard = BOARD, routes: Record<string, unknown> = {}) {
  let saved = board;
  const s = fakeServer({
    ...BASE_ROUTES,
    "GET /characters": TABS,
    "GET /stats/1": () => saved,
    "PUT /stats/1": (input: StatsInput) => {
      saved = { ...board, input };
    },
    ...routes,
  });
  renderWithApp(<App />, "/stats");
  return s;
}
const region = async (name: string) => within(await screen.findByRole("region", { name }));
const sent = (s: ReturnType<typeof show>) => s.sent("PUT", "/stats/1") as StatsInput[];
const shown = (r: ReturnType<typeof within>, name: string) => r.getByRole("group", { name }).textContent;

describe("the Stats page", () => {
  it("in the rail; the world's characters as tabs; the score at 380% and 300%", async () => {
    show();
    expect(within(screen.getByRole("navigation")).getByRole("link", { name: /Stats/ }).getAttribute("aria-current")).toBe("page");
    expect(within(await screen.findByRole("tablist", { name: "Characters" })).getAllByRole("tab")).toHaveLength(3);
    const score = await region("Score");
    expect(score.getByText("91,609")).toBeTruthy();
    expect(score.getByText("90,819")).toBeTruthy();
  });

  it("the Stats window: the job's rows as typed; the worked-out boxes shown, not typed", async () => {
    show();
    const w = await region("Character Stats");
    expect((w.getByRole("textbox", { name: "DEX base" }) as HTMLInputElement).value).toBe("7812");
    expect((w.getByRole("textbox", { name: "DEX %" }) as HTMLInputElement).value).toBe("784");
    expect(w.getByRole("textbox", { name: "STR base" })).toBeTruthy();
    expect(w.queryByRole("textbox", { name: /LUK/ })).toBeNull();
    expect(shown(w, "General Range")).toBe("General Range272,801,300");
    expect(shown(w, "Final Damage")).toBe("Final Damage139.35");
    expect(shown(w, "Attack")).toBe("Attack9,830");
    expect(shown(w, "Level")).toBe("Level286");
    expect(shown(w, "World")).toBe("WorldHeroic");
    // the boxes MapleScouter works out aren't typed
    expect(w.queryByRole("textbox", { name: /General Range|Final Damage|^Attack$/ })).toBeNull();
    expect((w.getByRole("checkbox", { name: /Liberation/ }) as HTMLInputElement).checked).toBe(true);
    // a job without the Ruin Force Shield or a one-handed choice: not offered
    expect(w.queryByRole("checkbox", { name: /Ruin Force Shield|One-handed/ })).toBeNull();
  });

  it("typing a number saves it (decimals where the game has them), with everything else as it was; a number past its limit is kept to it", async () => {
    const s = show();
    const w = await region("Character Stats");
    const box = w.getByRole("textbox", { name: "Ignore Enemy Defense" });
    await userEvent.clear(box);
    await userEvent.type(box, "97.2644{Enter}");
    await waitFor(() => expect(sent(s)).toEqual([{ ...INPUT, stats: { ...INPUT.stats, ied: 97.2644 } }]));
    await userEvent.clear(box);
    await userEvent.type(box, "150{Enter}");
    await waitFor(() => expect(sent(s).at(-1)!.stats.ied).toBe(100));
    // a whole-number box: rounded
    const base = w.getByRole("textbox", { name: "STR base" });
    await userEvent.clear(base);
    await userEvent.type(base, "4388.6{Enter}");
    await waitFor(() => expect(sent(s).at(-1)!.stats.sub.base).toBe(4389));
    // not a number: back to what's saved
    await userEvent.clear(base);
    await userEvent.type(base, "abc{Enter}");
    expect((base as HTMLInputElement).value).not.toBe("abc");
  });

  it("a magic job's ATT row is Magic ATT; a Demon job gets the Ruin Force Shield; Hero the one-handed weapon", async () => {
    show({ ...BOARD, labels: { main: "INT", sub: "LUK", third: null, atk: "Magic ATT" }, options: { ruinShield: true, oneHanded: true, magic: true } });
    const w = await region("Character Stats");
    expect(w.getByRole("textbox", { name: "Magic ATT base" })).toBeTruthy();
    expect(w.getByRole("checkbox", { name: /Ruin Force Shield/ })).toBeTruthy();
    expect(w.getByRole("checkbox", { name: /One-handed/ })).toBeTruthy();
  });

  it("buffs: a tick saves; a group's pick swaps or comes off; the magic-only ones hidden from others; levels typed", async () => {
    const s = show();
    const buffs = await region("Buffs");
    const sayram = buffs.getByRole("button", { name: "Sayram's Elixir" });
    expect(sayram.getAttribute("aria-pressed")).toBe("false");
    expect(sayram.querySelector("img")!.getAttribute("src")).toBe("/item-icons/stats/sayramElixir.png");
    await userEvent.click(sayram);
    await waitFor(() => expect(sent(s).at(-1)!.buffs.sayramElixir).toBe(true));
    expect(buffs.getByRole("button", { name: "Legendary Hero Potion" }).getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(buffs.getByRole("button", { name: "Advanced Great Hero Boost Potion" }));
    await waitFor(() => expect(sent(s).at(-1)!.buffA).toBe("greatHeroBoost"));
    await userEvent.click(buffs.getByRole("button", { name: "Advanced Great Hero Boost Potion" }));
    await waitFor(() => expect(sent(s).at(-1)!.buffA).toBeNull());
    // not a magic job: no Magic Potion V or Ssiws Cheese, the ATT ones instead
    expect(buffs.queryByRole("button", { name: "Advanced Magic Potion V" })).toBeNull();
    expect(buffs.queryByRole("button", { name: "Ssiws Cheese" })).toBeNull();
    expect(buffs.getByRole("button", { name: "Advanced Attack Potion V" })).toBeTruthy();
    const guild = buffs.getByRole("textbox", { name: "For the Guild!" });
    await userEvent.clear(guild);
    await userEvent.type(guild, "20{Enter}");
    await waitFor(() => expect(sent(s).at(-1)!.guild.forTheGuild).toBe(15));
    await userEvent.click(buffs.getByRole("button", { name: "Advanced Stat Potion X" }));
    await waitFor(() => expect(sent(s).at(-1)!.statPotion).toBe(true));
  });

  it("the event stats: switched off as one (their buffs can't be ticked then); typed values saved", async () => {
    const s = show();
    const buffs = await region("Buffs");
    await userEvent.click(buffs.getByRole("checkbox", { name: "On" }));
    await waitFor(() => expect(sent(s).at(-1)!.eventOn).toBe(false));
    expect((buffs.getByRole("button", { name: "Gourmand Power" }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(buffs.getByRole("checkbox", { name: "On" }));
    await userEvent.click(buffs.getByRole("button", { name: "Gourmand Power" }));
    await waitFor(() => expect(sent(s).at(-1)!.events.gourmandPower).toBe(true));
    const att = buffs.getByRole("textbox", { name: "Event ATT" });
    await userEvent.clear(att);
    await userEvent.type(att, "30{Enter}");
    await waitFor(() => expect(sent(s).at(-1)!.eventStats.att).toBe(30));
  });

  it("the sacred symbol buff: shown, from the Symbols page, not ticked here", async () => {
    show({ ...BOARD, sacred: true });
    const buffs = await region("Buffs");
    expect(buffs.getByText("all maxed")).toBeTruthy();
    expect(buffs.queryByRole("button", { name: /Sacred symbols/ })).toBeNull();
  });

  it("links, the Wild Hunter card, HEXA from the HEXA page, the Artifact, Inner Ability and the Oz rings", async () => {
    const s = show();
    const links = await region("Links / Legion");
    const kain = links.getByRole("textbox", { name: "Time to Prepare" });
    await userEvent.clear(kain);
    await userEvent.type(kain, "5{Enter}");
    await waitFor(() => expect(sent(s).at(-1)!.links.kain).toBe(3));
    const rest = await region("HEXA, Artifact, Inner Ability and Oz Rings");
    // HEXA: the levels, not typed here
    expect(rest.getByTitle("Ascent").textContent).toContain("2");
    expect(rest.queryByRole("textbox", { name: /Ascent/ })).toBeNull();
    await userEvent.click(rest.getByRole("radio", { name: /Passive Skills \+1/ }));
    await waitFor(() => expect(sent(s).at(-1)!.innerAbility).toBe("passive"));
    expect(rest.getByTitle("Ring of Restraint").querySelector("img")!.getAttribute("src")).toBe("/item-icons/1113098.png");
    const ring = rest.getByRole("textbox", { name: "Continuous Ring" });
    await userEvent.clear(ring);
    await userEvent.type(ring, "9{Enter}");
    await waitFor(() => expect(sent(s).at(-1)!.rings.continuous).toBe(6));
  });

  it("a SHINE class, or a job not in the figures: says so instead of the sheet", async () => {
    show(BOARD, { "GET /stats/2": { ...BOARD, known: false, shine: true }, "GET /stats/3": { ...BOARD, known: false, shine: false } });
    await userEvent.click(await screen.findByRole("tab", { name: /StarGazer/ }));
    expect(await screen.findByText(/Sia Astelle is a SHINE class/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Score" })).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: /Newcomer/ }));
    expect(await screen.findByText(/Stats for Jett aren't in the figures yet/)).toBeTruthy();
  });

  it("a score the class has no curve for: —", async () => {
    show({ ...BOARD, out: { ...BOARD.out, score380: null, score300: null } });
    expect((await region("Score")).getAllByText("—")).toHaveLength(2);
  });

  it("coming back to the window doesn't reload the board", async () => {
    const s = show();
    await region("Score");
    const gets = () => s.calls.filter((c) => c.method === "GET" && c.path === "/stats/1").length;
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(gets()).toBe(1);
    focusManager.setFocused(undefined);
  });

  it("after each check of Nexon, the board is worked out again (the score follows the level)", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 20, 11, 59)));
    let finishedAt: string | null = "2026-10-20T08:00:30.000Z";
    const run = () => ({ last: { startedAt: "2026-10-20T08:00:00.000Z", finishedAt, checked: 1, updated: 1, missing: 0, failed: 0, problem: null } });
    const s = show(BOARD, { "GET /refresh": run });
    const loads = () => s.calls.filter((c) => c.method === "GET" && c.path === "/stats/1").length;
    await vi.waitFor(() => expect(loads()).toBe(1));
    await new Promise((r) => setTimeout(r, 50)); // the first answer about the last check has arrived
    finishedAt = "2026-10-20T12:00:30.000Z";
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.waitFor(() => expect(loads()).toBe(2));
    vi.useRealTimers();
  });

  it("no characters: says so, no board asked for", async () => {
    const s = fakeServer(BASE_ROUTES);
    renderWithApp(<App />, "/stats");
    expect(await screen.findByText(/No characters on Kronos yet/)).toBeTruthy();
    expect(s.calls.filter((c) => c.path.startsWith("/stats")).length).toBe(0);
  });
});

// ── v4.1.0 ──
const view = async (name: string) => userEvent.click(within(await screen.findByRole("group", { name: "View" })).getByRole("button", { name }));

describe("the Stats page's views (v4.1.0)", () => {
  it("the score with every core at 30 beside it; the three views, the sheet first", async () => {
    show();
    const score = await region("Score");
    expect(score.getByText(/every core at 30: 99,001/)).toBeTruthy();
    expect(score.getByText(/every core at 30: 98,002/)).toBeTruthy();
    const views = within(screen.getByRole("group", { name: "View" }));
    expect(views.getAllByRole("button").map((b) => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([["Stats sheet", "true"], ["Boss clear", "false"], ["Efficiency", "false"]]);
    expect(await region("Character Stats")).toBeTruthy();
    await view("Efficiency");
    expect(screen.queryByRole("region", { name: "Character Stats" })).toBeNull();
  });

  it("the boss clears: MapleScouter's 15–1,000% shown (Show all: every one); a tile's tag, %, score there / needed, its badges and losses", async () => {
    show();
    await view("Boss clear");
    const r = await region("Boss clear");
    const tiles = () => r.getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(tiles()).toEqual(["Normal Kalos", "Champion Seren"]);
    await userEvent.click(r.getByRole("checkbox", { name: /Show all \(3\)/ }));
    expect(tiles()).toEqual(["Normal Kalos", "Champion Seren", "Normal Lotus"]);
    const kalos = r.getByRole("button", { name: "Normal Kalos" });
    expect(kalos.textContent).toContain("Party-able");
    expect(kalos.textContent).toContain("40.5%");
    expect(kalos.textContent).toContain("34,370");
    expect(kalos.textContent).toContain("50,458");
    expect(kalos.title).toBe("Normal Kalos\nLevel: −16%\nSacred Force: −36%\nCombined: −46%");
    expect(within(kalos).getByText("Lvl").title).toBe("For full damage: Level 278 / 285 (7 more)");
    expect(within(kalos).getByText("F").title).toBe("For full damage:\nSacred Force 280 / 350 (70 more)");
    // at its best: no badges; Champion tinted
    const seren = r.getByRole("button", { name: "Champion Seren" });
    expect(within(seren).queryByText("Lvl")).toBeNull();
    expect(seren.className).toContain("champion");
  });

  it("the picked boss's details: the first one to start; its HP by phase (each HP bar), and the damage lost", async () => {
    show();
    await view("Boss clear");
    const panel = await region("Boss details");
    expect(panel.getByRole("heading", { name: "Normal Kalos" })).toBeTruthy();
    expect(panel.getByText("224.4T")).toBeTruthy();
    expect(panel.getByText("481.0T")).toBeTruthy();
    expect(panel.getAllByText("120.2T")).toHaveLength(4);
    expect(panel.getByText(/Total 705.4T/)).toBeTruthy();
    expect(panel.getByRole("row", { name: /Sacred Force/ }).textContent).toBe("Sacred Force280 / 350−36%");
    expect(panel.getByRole("row", { name: /Combined/ }).textContent).toBe("Combined−46%");
    await userEvent.click((await region("Boss clear")).getByRole("button", { name: "Champion Seren" }));
    const seren = await region("Boss details");
    expect(seren.getByRole("heading", { name: "Champion Seren" })).toBeTruthy();
    expect(seren.getByText("Not known")).toBeTruthy();
  });

  it("stat efficiency: each stat in the main stat, and an amount worked out", async () => {
    show();
    await view("Efficiency");
    const r = await region("Stat efficiency");
    expect(r.getByRole("row", { name: /Boss Damage/ }).textContent).toContain("12.73");
    const amount = r.getByRole("textbox", { name: "Amount of Boss Damage / Damage %" });
    await userEvent.clear(amount);
    await userEvent.type(amount, "30");
    expect(r.getByRole("row", { name: /Boss Damage/ }).textContent).toContain("381.78");
    expect(r.getByRole("row", { name: /100 DEX/ }).textContent).toContain("1.100%");
    expect(r.getByRole("row", { name: /4 s more/ }).textContent).toContain("4.37%");
  });
});

describe("the Stats page in MapleScouter's order (v4.1.0)", () => {
  it("the stat potion first; the guild skills Boss Slayers, Undeterred, For the Guild!, Hard Hitter; the Oz rings Restraint, Weapon Jump, Continuous", async () => {
    show();
    const buffs = await region("Buffs");
    const tiles = buffs.getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(tiles[0]).toBe("Advanced Stat Potion X");
    expect(tiles[1]).toBe("Sayram's Elixir");
    const guild = buffs.getAllByRole("textbox").map((t) => t.getAttribute("aria-label")).filter((n) => ["Boss Slayers", "Undeterred", "For the Guild!", "Hard Hitter"].includes(n!));
    expect(guild).toEqual(["Boss Slayers", "Undeterred", "For the Guild!", "Hard Hitter"]);
    const rings = (await region("HEXA, Artifact, Inner Ability and Oz Rings")).getAllByRole("textbox").map((t) => t.getAttribute("aria-label"));
    expect(rings.filter((n) => /Ring/.test(n!))).toEqual(["Ring of Restraint", "Weapon Jump Ring", "Continuous Ring"]);
  });

  it("Arctic Friends and Baby Dragon Food: shown, saying they count nothing yet; the event Arcane and Sacred Power saved", async () => {
    const s = show();
    const buffs = await region("Buffs");
    expect(buffs.getByRole("button", { name: "Arctic Friends" }).closest(".stp-tile")!.getAttribute("title")).toMatch(/counts nothing/);
    const arcane = buffs.getByRole("textbox", { name: "Event Arcane Power" });
    await userEvent.clear(arcane);
    await userEvent.type(arcane, "150{Enter}");
    await waitFor(() => expect(sent(s).at(-1)!.eventStats.arcane).toBe(150));
  });
});

describe("test mode (v4.1.0)", () => {
  it("Testing: the page works out the test (nothing saved), Level and HEXA typed, a changed box outlined, the change from the saved score; Reset; unticked, back to saved", async () => {
    const tried: unknown[] = [];
    const s = show(BOARD, {
      "POST /stats/1/try": (body: { input: StatsInput; level: number }) => {
        tried.push(body);
        return { ...BOARD, input: body.input, level: body.level, out: { ...BOARD.out, score380: body.level === 290 ? 92_525 : 91_609 } };
      },
    });
    const score = await region("Score");
    await userEvent.click(score.getByRole("checkbox", { name: "Testing" }));
    await waitFor(() => expect(tried).toHaveLength(1));
    expect(tried[0]).toMatchObject({ input: INPUT, level: 286, hexa: { janus: 0, origin: 1, ascent: 2, mastery1: 0 } });
    expect(screen.getByRole("status").textContent).toMatch(/nothing is saved/);
    const w = await region("Character Stats");
    const level = w.getByRole("textbox", { name: "Level" });
    await userEvent.clear(level);
    await userEvent.type(level, "290{Enter}");
    await waitFor(() => expect(score.getByLabelText("Change from saved").textContent).toBe("91,609 → 92,525 (+1.00%)"));
    expect(level.className).toContain("stp-changed");
    expect(level.title).toBe("Saved: 286");
    // a sheet box and a HEXA level, typed: not saved
    const dex = w.getByRole("textbox", { name: "DEX base" });
    await userEvent.clear(dex);
    await userEvent.type(dex, "8000{Enter}");
    const origin = (await region("HEXA, Artifact, Inner Ability and Oz Rings")).getByRole("textbox", { name: "Wrath of Enlil" });
    await userEvent.clear(origin);
    await userEvent.type(origin, "30{Enter}");
    await waitFor(() => expect(tried.at(-1)).toMatchObject({ level: 290, hexa: { origin: 30 }, input: { stats: { main: { base: 8000 } } } }));
    expect(sent(s)).toEqual([]);
    // Reset: back to the saved sheet, still testing
    await userEvent.click(screen.getByRole("button", { name: "Reset to saved" }));
    await waitFor(() => expect((w.getByRole("textbox", { name: "DEX base" }) as HTMLInputElement).value).toBe("7812"));
    // unticked: the saved page, Level not typed
    await userEvent.click(score.getByRole("checkbox", { name: "Testing" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(shown(w, "Level")).toBe("Level286");
    expect(sent(s)).toEqual([]);
  });

  it("kept in this browser until unticked: back on the page, still testing what was typed", async () => {
    show(BOARD, { "POST /stats/1/try": (body: { input: StatsInput; level: number }) => ({ ...BOARD, input: body.input, level: body.level }) });
    await userEvent.click((await region("Score")).getByRole("checkbox", { name: "Testing" }));
    const level = (await region("Character Stats")).getByRole("textbox", { name: "Level" });
    await userEvent.clear(level);
    await userEvent.type(level, "291{Enter}");
    cleanupAndShowAgain();
    await waitFor(async () => expect(((await region("Character Stats")).getByRole("textbox", { name: "Level" }) as HTMLInputElement).value).toBe("291"));
  });
});
function cleanupAndShowAgain() {
  cleanup();
  show(BOARD, { "POST /stats/1/try": (body: { input: StatsInput; level: number }) => ({ ...BOARD, input: body.input, level: body.level }) });
}

describe("stat efficiency per character (review, v4.1.0)", () => {
  it("an amount typed for one character isn't carried to another's", async () => {
    show(BOARD, { "GET /stats/3": { ...BOARD, labels: { main: "LUK", sub: "DEX", third: null, atk: "Attack" } } });
    await view("Efficiency");
    // (both pages loaded first: switching then shows the other at once, no loading in between)
    await userEvent.click(screen.getByRole("tab", { name: /Newcomer/ }));
    await (await region("Stat efficiency")).findByRole("textbox", { name: "Amount of LUK %" });
    await userEvent.click(screen.getByRole("tab", { name: /LeafDancer/ }));
    const amount = await (await region("Stat efficiency")).findByRole("textbox", { name: "Amount of DEX %" });
    await userEvent.clear(amount);
    await userEvent.type(amount, "30");
    await userEvent.click(screen.getByRole("tab", { name: /Newcomer/ }));
    const other = await region("Stat efficiency");
    await waitFor(() => expect(other.getByRole("textbox", { name: "Amount of LUK %" })).toHaveProperty("value", "1"));
    expect(other.getAllByRole("textbox").every((t) => (t as HTMLInputElement).value === "1")).toBe(true);
  });
});

describe("the Stats page's saves and test mode's numbers (survivors of mutation testing, v4.1.0)", () => {
  it("a saved sheet marks the gear pages and HEXA to be worked out again (their stat values follow it)", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const others = [["gear", 45], ["flames", 1, 0], ["starforce", 1, "", 0], ["potential", 1, "", 0], ["upgrades", 1, "", ""], ["hexa", 1]];
    for (const k of others) qc.setQueryData(k, {});
    // (a page the sheet doesn't touch stays as it was)
    qc.setQueryData(["familiars", 1], {});
    fakeServer({ ...BASE_ROUTES, "GET /characters": TABS, "GET /stats/1": BOARD, "PUT /stats/1": undefined });
    renderWithApp(<App />, "/stats", qc);
    const dex = (await region("Character Stats")).getByRole("textbox", { name: "DEX base" });
    await userEvent.clear(dex);
    await userEvent.type(dex, "8000{Enter}");
    await waitFor(() => {
      for (const k of others) expect(qc.getQueryState(k)!.isInvalidated, JSON.stringify(k)).toBe(true);
    });
    expect(qc.getQueryState(["familiars", 1])!.isInvalidated).toBe(false);
  });

  it("a gear save (the hat's cooldown lines), stat values or a symbol mark the Stats page and a test of it to be worked out again (review, v4.1.0)", async () => {
    fakeServer({ "PUT /gear/1/hat": undefined, "PUT /gear/1/hat/details": undefined, "PUT /gear/1/stat-values": undefined, "PUT /symbols/1/cernium": undefined });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => ({ gear: useSaveGear(45), details: useSaveGearDetails(45), values: useSaveStatValues(45), symbol: useSaveSymbol(45) }), { wrapper });
    const pages = [["stats", 1], ["stats-try", 1, "{}"], ["hexa", 1], ["gear", 45]];
    const marked = async (save: () => Promise<unknown>) => {
      for (const k of [...pages, ["familiars", 1]]) qc.setQueryData(k, { characters: [] });
      await act(save);
      return [...pages, ["familiars", 1]].map((k) => qc.getQueryState(k)!.isInvalidated);
    };
    const all = [true, true, true, true, false];
    expect(await marked(() => result.current.gear.mutateAsync({ id: 1, slot: "hat", input: { item: "1004810" } }))).toEqual(all);
    expect(await marked(() => result.current.details.mutateAsync({ id: 1, slot: "hat", details: { stars: 0, flames: {}, potential: null, hammers: 0 } }))).toEqual(all);
    expect(await marked(() => result.current.values.mutateAsync({ id: 1, values: STAT_VALUES_UNTYPED }))).toEqual(all);
    expect(await marked(() => result.current.symbol.mutateAsync({ id: 1, symbol: "cernium", state: { level: 11, held: 0, days: 0, weekly: 0 } as never }))).toEqual(all);
  });

  it("while a test's new numbers come, the last ones stay; coming back to the window asks nothing again", async () => {
    let answer: ((b: StatsBoard) => void) | null = null;
    const s = show(BOARD, {
      "POST /stats/1/try": (body: { level: number }) =>
        body.level === 286 ? { ...BOARD, out: { ...BOARD.out, score380: 92_525 } } : new Promise<StatsBoard>((r) => (answer = r)),
    });
    await userEvent.click((await region("Score")).getByRole("checkbox", { name: "Testing" }));
    const score = await region("Score");
    await waitFor(() => expect(score.getByLabelText("Change from saved").textContent).toBe("91,609 → 92,525 (+1.00%)"));
    const level = (await region("Character Stats")).getByRole("textbox", { name: "Level" });
    await userEvent.clear(level);
    await userEvent.type(level, "290{Enter}");
    // (the answer for 290 not in yet: the last test's numbers, not the saved ones)
    await new Promise((r) => setTimeout(r, 30));
    expect(score.getByLabelText("Change from saved").textContent).toBe("91,609 → 92,525 (+1.00%)");
    answer!({ ...BOARD, level: 290, out: { ...BOARD.out, score380: 93_000 } });
    await waitFor(() => expect(score.getByLabelText("Change from saved").textContent).toBe("91,609 → 93,000 (+1.52%)"));
    const posts = () => s.calls.filter((c) => c.method === "POST").length;
    const before = posts();
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(posts()).toBe(before);
    focusManager.setFocused(undefined);
  });

  it("another character's test never shows the last character's numbers while its own come", async () => {
    const hexa = Object.fromEntries(["origin", "ascent", "mastery1", "mastery2", "mastery3", "mastery4", "boost1", "boost2", "boost3", "boost4", "janus", "hecate", "common3"].map((n) => [n, 0]));
    window.localStorage.setItem("miku-stats-test-3", JSON.stringify({ input: INPUT, level: 270, hexa }));
    show(BOARD, {
      "GET /stats/3": { ...BOARD, level: 270, out: { ...BOARD.out, score380: 50_000 } },
      "POST /stats/1/try": { ...BOARD, out: { ...BOARD.out, score380: 92_525 } },
      "POST /stats/3/try": () => new Promise(() => {}),
    });
    await userEvent.click((await region("Score")).getByRole("checkbox", { name: "Testing" }));
    await waitFor(async () => expect((await region("Score")).getByLabelText("Change from saved").textContent).toContain("92,525"));
    await userEvent.click(screen.getByRole("tab", { name: /Newcomer/ }));
    const score = await region("Score");
    await waitFor(() => expect(score.getByLabelText("Change from saved").textContent).toBe("50,000 → 50,000 (+0.00%)"));
  });
});
