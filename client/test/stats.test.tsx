import { STATS_DEFAULTS, type StatsInput } from "@miku/shared";
import { focusManager } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
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
  out: { finalDamage: 139.3523, generalRange: 272_801_300, atkTotal: 9_830, score380: 91_609, score300: 90_819 },
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
