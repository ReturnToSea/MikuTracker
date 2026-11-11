import { HEXA_DEFAULTS, type HexaInput, type HexaStat, STAT_VALUE_DEFAULTS } from "@miku/shared";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { focusManager, QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { useSaveStatValues } from "../src/api/hooks";
import type { HexaBoard, HexaTabs } from "../src/api/types";
import { BASE_ROUTES, fakeServer, renderWithApp } from "./server";

// A made-up board: the numbers are the server's to work out (tested there); here, what the page shows and does.
const TABS: HexaTabs = {
  characters: [
    { id: 1, name: "RemyRabbit", job: "Ren", level: 279, avatar: null, known: true, shine: false },
    { id: 2, name: "StarGazer", job: "Sia Astelle", level: 275, avatar: null, known: false, shine: true },
    { id: 3, name: "PlumBlade", job: "Ren", level: 275, avatar: null, known: true, shine: false },
    { id: 4, name: "Newcomer", job: "Jett", level: 270, avatar: null, known: false, shine: false },
  ],
};
const NODES: HexaBoard["nodes"] = [
  ["origin", "Divided Heavens", "skill", 1],
  ["ascent", "Heartbound Verse", "skill", 0],
  ["mastery1", "Plum Blossom: Storm", "mastery", 0],
  ["mastery2", "Spirit Strike", "mastery", 0],
  ["mastery3", "Wish Unending", "mastery", 0],
  ["mastery4", "Raining Blossoms", "mastery", 0],
  ["boost1", "Thousand Blossom Flurry", "boost", 0],
  ["boost2", "Soul Immeasurable", "boost", 0],
  ["boost3", "Dancing Annihilation", "boost", 0],
  ["boost4", "Blade of the Unbound Heart", "boost", 0],
  ["janus", "Sol Janus", "common", 0],
  ["hecate", "Sol Hecate", "common", 0],
  ["common3", "Lotus Flower", "common", 0],
].map(([key, name, group, min]) => ({ key, name, group, icon: key === "origin" ? "/item-icons/hexa/Len_1.png" : null, min, max: 30 }) as HexaBoard["nodes"][number]);
const row = (node: string, name: string, from: number, to: number, frags: number, fd: number, total: number, days: number | null, partial = false) => ({ node, name, icon: null, from, to, cost: { erda: 3, frags }, fd, partial, total: { erda: 3, frags: total }, days, estimate: { cost: node.startsWith("stat"), fd: node.startsWith("stat") || partial } });
const line = (stat: HexaStat | null, level: number) => ({ stat, level });
const INPUT: HexaInput = {
  ...structuredClone(HEXA_DEFAULTS),
  stats: [
    { lines: [line("att", 4), line("mainStat", 8), line("critDmg", 8)], unlocked: true },
    { lines: [line("bossDmg", 2), line(null, 0), line(null, 0)], unlocked: true },
    { lines: [line(null, 0), line(null, 0), line(null, 0)], unlocked: false },
  ],
};
const step = (node: string, name: string, from: number, to: number, fd: number, done: boolean, days: number | null) => ({ node, name, icon: null, from, to, cost: { erda: 3, frags: 50 }, fd, estimate: { cost: node.startsWith("stat"), fd: node.startsWith("stat") }, done, days });
const BOARD: HexaBoard = {
  known: true,
  input: INPUT,
  nodes: NODES,
  invested: { erda: 25, frags: 3000, exact: false },
  left: { erda: 1439, frags: 38743, exact: true },
  stats: [
    { lines: INPUT.stats[0].lines, rank: 20, unlocked: true, needs: null, spent: { erda: 5, frags: 351.2 }, left: { erda: 0, frags: 0 }, worked: ["att", "mainStat", "critDmg"], assumed: false, fdNow: 4.86, fdToCome: 0 },
    { lines: INPUT.stats[1].lines, rank: 2, unlocked: true, needs: null, spent: { erda: 10, frags: 220 }, left: { erda: 0, frags: 298.4 }, worked: ["bossDmg", "att", "mainStat"], assumed: true, fdNow: 0.19, fdToCome: 3.51 },
    { lines: INPUT.stats[2].lines, rank: 0, unlocked: false, needs: null, spent: { erda: 0, frags: 0 }, left: { erda: 15, frags: 673.1 }, worked: ["ied", "att", "mainStat"], assumed: true, fdNow: 0, fdToCome: 3.87 },
  ],
  priority: [
    row("mastery3", "Wish Unending", 0, 1, 50, 5.33, 50, 0),
    row("hecate", "Sol Hecate", 0, 1, 125, 3.75, 175, 2.5),
    row("stat2", "HEXA Stat II", 2, 20, 298, 3.51, 473, 40),
    row("boost1", "Thousand Blossom Flurry", 1, 4, 300, 0.12, 773, null, true),
  ],
  fdToDesired: 89.97,
  fragments: { perWeek: 160, needed: 38714.5, days: 1283.4 },
  order: [
    step("mastery3", "Wish Unending", 0, 1, 5.33, true, 0),
    step("mastery1", "Plum Blossom: Storm", 0, 1, 2.06, false, 0),
    step("stat1", "HEXA Stat I", 0, 20, 3.92, true, 0),
    step("hecate", "Sol Hecate", 0, 1, 3.75, false, 2.5),
    step("origin", "Divided Heavens", 29, 30, 1.2, false, null),
  ],
  icons: { stat: null, erda: "/item-icons/hexa/sol-erda.png", frags: null },
  // (made-up figures, not the game's: the page shows and adds the server's)
  figures: { erdaRequest: 91, dungeons: { none: 0, highMountain: 41, anglerCompany: 56, nightmareParadise: 71 } },
  source: "MapleScouter (GMS, Heroic)",
  fixedOrder: false,
  attNode: null,
};

function show(board: HexaBoard = BOARD, routes: Record<string, unknown> = {}) {
  const s = fakeServer({ ...BASE_ROUTES, "GET /hexa": TABS, "GET /hexa/1": board, "PUT /hexa/1": undefined, ...routes });
  renderWithApp(<App />, "/hexa");
  return s;
}
const region = async (name: string) => within(await screen.findByRole("region", { name }));
const sent = (s: ReturnType<typeof show>) => s.sent("PUT", "/hexa/1") as HexaInput[];

describe("the HEXA page", () => {
  it("in the rail, with the world's characters as tabs; the first picked", async () => {
    show();
    const rail = screen.getByRole("navigation");
    expect(within(rail).getByRole("link", { name: /HEXA/ }).getAttribute("aria-current")).toBe("page");
    expect(within(await screen.findByRole("tablist", { name: "Characters" })).getAllByRole("tab").map((t) => t.textContent)).toEqual(["RemyRabbitLv. 279 · Ren", "StarGazerLv. 275 · Sia Astelle", "PlumBladeLv. 275 · Ren", "NewcomerLv. 270 · Jett"]);
    await screen.findByRole("region", { name: "HEXA summary" });
  });

  it("a SHINE class, or a job not in the figures: says so, nothing asked for", async () => {
    const s = show();
    await userEvent.click(await screen.findByRole("tab", { name: /StarGazer/ }));
    expect(await screen.findByText(/Sia Astelle is a SHINE class: it has Erda Link instead of the HEXA Matrix/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "HEXA summary" })).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: /Newcomer/ }));
    expect(await screen.findByText(/HEXA for Jett isn't in the figures yet/)).toBeTruthy();
    // nothing asked for them (no character's board at all)
    expect(s.calls.filter((c) => c.path.startsWith("/hexa/")).map((c) => c.path)).toEqual(["/hexa/1"]);
  });

  it("a class with a fixed order (Lethe, no damage figures yet): no final damage anywhere, the order's source said", async () => {
    show({ ...BOARD, fixedOrder: true, source: "The Lethe Discord's order (no damage figures for Lethe yet)" });
    const side = await region("Upgrade priority");
    expect(side.queryByText(/in all/)).toBeNull();
    expect(side.queryByRole("columnheader", { name: "FD" })).toBeNull();
    expect(side.getByRole("group", { name: "Next upgrade" }).textContent).not.toMatch(/\+\d/);
    expect(side.getByText(/The Lethe Discord's order \(no damage figures for Lethe yet\): no final damage figures for this class yet/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Full order" }));
    const order = await region("Full upgrade order");
    expect(order.getByText(/^The Lethe Discord's order/)).toBeTruthy();
    expect(order.getAllByRole("tooltip").some((t) => /%/.test(t.textContent!))).toBe(false);
  });

  it("with figures: the final damage shows (the same board, not fixed)", async () => {
    show();
    const side = await region("Upgrade priority");
    expect(side.getByText(/in all/)).toBeTruthy();
    expect(side.getByRole("columnheader", { name: "FD" })).toBeTruthy();
  });

  it("HEXA Stat's damage on each node: at rank 20 what it gives; else what rank 20 adds on average; the best stats assumed where none are picked", async () => {
    show();
    const levels = await region("Current progress");
    const text = (n: string) => levels.getByRole("group", { name: n }).textContent!;
    expect(text("HEXA Stat I")).toContain("+4.86%");
    expect(text("HEXA Stat I")).not.toContain("assumed");
    expect(text("HEXA Stat II")).toContain("≈ +3.51% to rank 20");
    expect(text("HEXA Stat II")).toContain("best stats assumed (Boss DMG, ATT, Main stat)");
  });

  it("switching to another Ren shows Loading…, not the first one's board, until its own comes", async () => {
    let release: (v: unknown) => void = () => {};
    show(BOARD, { "GET /hexa/3": () => new Promise((r) => (release = r)) });
    await screen.findByRole("region", { name: "HEXA summary" });
    await userEvent.click(screen.getByRole("tab", { name: /PlumBlade/ }));
    expect(await screen.findByText("Loading…")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "HEXA summary" })).toBeNull();
    release({ ...BOARD, invested: { erda: 0, frags: 0, exact: true } });
    await waitFor(() => expect(screen.getByRole("region", { name: "HEXA summary" }).textContent).toContain("0%"));
  });

  it("the summary: invested and left to complete as Sol Erda and fragments (≈ for an average, a picture or the name), a progress bar", async () => {
    show();
    const sum = await region("HEXA summary");
    // 3,000 of 41,743 invested: 7.1%
    expect(sum.getByText("7.1%")).toBeTruthy();
    const invested = within(sum.getByRole("group", { name: "Invested" }));
    const left = within(sum.getByRole("group", { name: "Left to complete" }));
    // Sol Erda's picture (its name for a screen reader), the fragments' name (no picture downloaded)
    expect(invested.getByRole("img", { name: "Sol Erda" }).getAttribute("src")).toBe("/item-icons/hexa/sol-erda.png");
    expect(sum.getByRole("group", { name: "Invested" }).textContent).toBe("Invested≈ 25Fragments≈ 3,000");
    expect(sum.getByRole("group", { name: "Left to complete" }).textContent).toBe("Left to complete1,439Fragments38,743");
    expect(left.queryByText(/≈/)).toBeNull();
    expect((document.querySelector(".hexa-bar i") as HTMLElement).style.width).toMatch(/^7\.18/);
  });

  it("Sol Janus's tick saves it, with everything else as it was", async () => {
    const s = show();
    await userEvent.click((await region("HEXA summary")).getByRole("checkbox", { name: /Sol Janus/ }));
    await waitFor(() => expect(sent(s)).toEqual([{ ...INPUT, janus: true }]));
  });

  it("current progress: by group (Skill, Enhancement, Mastery, Common), each with its picture, now and wanted; typing saves, kept within the node's levels", async () => {
    const s = show();
    const levels = await region("Current progress");
    expect(levels.getAllByRole("group").slice(0, 4).map((g) => g.getAttribute("aria-label"))).toEqual(["Skill", "Enhancement", "Mastery", "Common"]);
    const skill = levels.getByRole("group", { name: "Skill" });
    expect(within(skill).getAllByRole("spinbutton").map((b) => (b as HTMLInputElement).value)).toEqual(["1", "30", "0", "30"]);
    // Origin's picture; Ascent's not downloaded: its first letter
    expect(skill.querySelector("img")!.getAttribute("src")).toBe("/item-icons/hexa/Len_1.png");
    expect(skill.textContent).toContain("OriginDivided Heavens");
    expect(skill.textContent).toContain("HAscentHeartbound Verse");
    const wish = levels.getByRole("spinbutton", { name: "Wish Unending level now" });
    await userEvent.clear(wish);
    await userEvent.type(wish, "12{Enter}");
    await waitFor(() => expect(sent(s).at(-1)!.current.mastery3).toBe(12));
    // Origin can't go below 1; nothing past 30
    const origin = levels.getByRole("spinbutton", { name: "Divided Heavens level now" }) as HTMLInputElement;
    await userEvent.clear(origin);
    await userEvent.type(origin, "0{Enter}");
    // already 1: nothing to save, and the box shows the 1 kept, not the 0 typed
    expect(origin.value).toBe("1");
    const want = levels.getByRole("spinbutton", { name: "Sol Hecate level wanted" });
    await userEvent.clear(want);
    await userEvent.type(want, "45{Enter}");
    await waitFor(() => expect(sent(s).at(-1)!.desired.hecate).toBe(30));
  });

  it("quick changes all count: each built on the one before, even when a save finishes in between (no reload until the last)", async () => {
    // each save finishes only when the test says (the fake server's board never changes, as a reload of an older input would look)
    const finish: ((v: unknown) => void)[] = [];
    const s = show(BOARD, { "PUT /hexa/1": () => new Promise((r) => finish.push(r)) });
    const levels = await region("Current progress");
    const type = async (name: string, v: string) => {
      const box = levels.getByRole("spinbutton", { name });
      await userEvent.clear(box);
      await userEvent.type(box, `${v}{Enter}`);
    };
    await type("Heartbound Verse level now", "5");
    await type("Sol Hecate level now", "6");
    // the first save done, the second not: a third change
    await waitFor(() => expect(finish).toHaveLength(1));
    finish[0]!(undefined);
    await waitFor(() => expect(finish).toHaveLength(2));
    await type("Lotus Flower level now", "7");
    finish[1]!(undefined);
    await waitFor(() => expect(finish).toHaveLength(3));
    expect(sent(s)[2]!.current).toMatchObject({ ascent: 5, hecate: 6, common3: 7 });
    // no reload until the last is done, then one
    expect(s.calls.filter((c) => c.method === "GET" && c.path === "/hexa/1").length).toBe(1);
    finish[2]!(undefined);
    await waitFor(() => expect(s.calls.filter((c) => c.method === "GET" && c.path === "/hexa/1").length).toBe(2));
    // only this board reloads: not the tabs or the settings
    expect(s.calls.filter((c) => c.method === "GET" && (c.path.startsWith("/hexa?") || c.path === "/settings")).length).toBe(2);
  });

  it("a tick shows at once, and a reload under way doesn't bring back the input from before it", async () => {
    // the first save is quick, the second never finishes; the reload after the first waits for the test, then brings the old board
    let saves = 0;
    let gets = 0;
    let reload: (v: unknown) => void = () => {};
    const s = show(BOARD, {
      "PUT /hexa/1": () => (++saves === 1 ? undefined : new Promise(() => {})),
      "GET /hexa/1": () => (++gets === 1 ? BOARD : new Promise((r) => (reload = r))),
    });
    const sum = await region("HEXA summary");
    await userEvent.click(sum.getByRole("checkbox", { name: /Sol Janus/ }));
    // the first save done: a reload is under way; a second change now
    await waitFor(() => expect(s.calls.filter((c) => c.method === "GET" && c.path === "/hexa/1")).toHaveLength(2));
    const erda = (await region("Fragment calculator")).getByRole("checkbox", { name: "Erda's Request" }) as HTMLInputElement;
    await userEvent.click(erda);
    expect(erda.checked).toBe(true);
    reload(BOARD);
    await new Promise((r) => setTimeout(r, 100));
    expect(erda.checked).toBe(true);
    expect((sum.getByRole("checkbox", { name: /Sol Janus/ }) as HTMLInputElement).checked).toBe(true);
  });

  it("an empty or unchanged box saves nothing and goes back", async () => {
    const s = show();
    const box = (await region("Current progress")).getByRole("spinbutton", { name: "Heartbound Verse level now" }) as HTMLInputElement;
    await userEvent.clear(box);
    await userEvent.tab();
    expect(box.value).toBe("0");
    await userEvent.type(box, "{Enter}");
    expect(sent(s)).toEqual([]);
  });

  it("want all at 30, or all as now", async () => {
    const s = show({ ...BOARD, input: { ...INPUT, current: { ...INPUT.current, ascent: 7 } } });
    const levels = await region("Current progress");
    await userEvent.click(levels.getByRole("button", { name: "Want all as now" }));
    await waitFor(() => expect(sent(s).at(-1)!.desired).toEqual({ ...INPUT.current, ascent: 7 }));
    await userEvent.click(levels.getByRole("button", { name: "Want all at 30" }));
    await waitFor(() => expect(Object.values(sent(s).at(-1)!.desired).every((v) => v === 30)).toBe(true));
  });

  it("HEXA Stat: each node's three lines, a stat and a level each; its rank; picking and typing save", async () => {
    const s = show();
    const levels = await region("Current progress");
    const one = within(levels.getByRole("group", { name: "HEXA Stat I" }));
    expect(levels.getByRole("group", { name: "HEXA Stat I" }).textContent).toContain("Rank 20 / 20");
    expect((one.getByRole("combobox", { name: "HEXA Stat I Main line stat" }) as HTMLSelectElement).value).toBe("att");
    // a main line can't be another node's main line's stat: II's main line isn't offered ATT
    const two = within(levels.getByRole("group", { name: "HEXA Stat II" }));
    const mainTwo = two.getByRole("combobox", { name: "HEXA Stat II Main line stat" });
    expect(within(mainTwo).getAllByRole("option").map((o) => o.textContent)).toEqual(["Main…", "Main stat", "Boss DMG", "IED", "Damage", "Crit DMG"]);
    // an additional line can be anything
    expect(within(two.getByRole("combobox", { name: "HEXA Stat II Additional line 1 stat" })).getAllByRole("option")).toHaveLength(7);
    await userEvent.selectOptions(two.getByRole("combobox", { name: "HEXA Stat II Additional line 1 stat" }), "att");
    await waitFor(() => expect(sent(s).at(-1)!.stats[1]!.lines[1]).toEqual({ stat: "att", level: 0 }));
    const level = two.getByRole("spinbutton", { name: "HEXA Stat II Main line level" });
    await userEvent.clear(level);
    await userEvent.type(level, "3{Enter}");
    await waitFor(() => expect(sent(s).at(-1)!.stats[1]!.lines[0]).toEqual({ stat: "bossDmg", level: 3 }));
    // picking none
    await userEvent.selectOptions(one.getByRole("combobox", { name: "HEXA Stat I Additional line 2 stat" }), "");
    await waitFor(() => expect(sent(s).at(-1)!.stats[0]!.lines[2]).toEqual({ stat: null, level: 8 }));
  });

  it("HEXA Stat: the unlocked tick (fixed on for a node with a level); a node the character can't take yet says the level it needs", async () => {
    const s = show({ ...BOARD, stats: [BOARD.stats[0]!, BOARD.stats[1]!, { ...BOARD.stats[2]!, needs: 270 }] });
    const levels = await region("Current progress");
    expect(levels.getByRole("group", { name: "HEXA Stat III" }).textContent).toContain("Needs Lv. 270");
    expect(levels.getByRole("group", { name: "HEXA Stat II" }).textContent).not.toContain("Needs");
    expect((levels.getByRole("checkbox", { name: "HEXA Stat II unlocked" }) as HTMLInputElement).disabled).toBe(true);
    await userEvent.click(levels.getByRole("checkbox", { name: "HEXA Stat III unlocked" }));
    await waitFor(() => expect(sent(s).at(-1)!.stats[2]!.unlocked).toBe(true));
  });

  it("the fragment calculator: owned, a day, Erda's Request, the Epic Dungeon; coming in a week, how long to everything wanted", async () => {
    const s = show({ ...BOARD, input: { ...INPUT, perDay: 20 } });
    const calc = await region("Fragment calculator");
    const out = calc.getByRole("status").textContent!;
    // 20 a day × 7, as typed (the server's own sum, perWeek, is for the days)
    expect(out).toContain("Coming in 140 a week");
    expect(out).toContain("1,284 days");
    await userEvent.click(calc.getByRole("checkbox", { name: "Erda's Request" }));
    await waitFor(() => expect(sent(s).at(-1)!.erdaRequest).toBe(true));
    await userEvent.selectOptions(calc.getByRole("combobox", { name: "Epic Dungeon" }), "anglerCompany");
    await waitFor(() => expect(sent(s).at(-1)!.dungeon).toBe("anglerCompany"));
    const owned = calc.getByRole("spinbutton", { name: "Fragments owned" });
    await userEvent.clear(owned);
    await userEvent.type(owned, "1500.6{Enter}");
    // whole fragments (the server takes no part of one)
    await waitFor(() => expect(sent(s).at(-1)!.owned).toBe(1501));
  });

  it("nothing coming in: never; everything already there: now, no date", async () => {
    show({ ...BOARD, fragments: { perWeek: 0, needed: 100, days: null } });
    expect((await region("Fragment calculator")).getByRole("status").textContent).toContain("never");
  });

  it("the upgrade priority: the next upgrade on top, then each row's node, level, costs, final damage (≈ for HEXA Stat) and when it's ready", async () => {
    show();
    const list = await region("Upgrade priority");
    const next = list.getByRole("group", { name: "Next upgrade" }).textContent!;
    expect(next).toContain("Wish Unending → 1");
    expect(next).toContain("+5.33%");
    expect(next).toContain("Lv. 0 → 1 · ready now");
    const rows = list.getAllByRole("row").slice(1);
    const today = new Date();
    const inDays = (n: number) => new Date(today.getTime() + n * 86_400_000).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(new Date(today.getTime() + n * 86_400_000).getFullYear() === today.getFullYear() ? {} : { year: "numeric" }) });
    expect(rows.map((r) => [...r.querySelectorAll("td")].map((td) => td.textContent))).toEqual([
      ["SSol Hecate", "1", "3", "125", "+3.75%", inDays(3)],
      ["HHEXA Stat II", "20", "3", "≈ 298", "≈ +3.51%", inDays(40)],
      ["TThousand Blossom Flurry", "4", "3", "300", "≈ +0.12%", "—"],
    ]);
    expect(rows.map((r) => r.classList.contains("affordable"))).toEqual([false, false, false]);
    expect(list.getByText(/4 upgrades/).textContent).toContain("+89.97%");
  });

  it("estimates are the server's marks: an ATT node's damage (≈), named under the list; its cost exact", async () => {
    const lotus = { ...row("common3", "Lotus Flower", 0, 1, 125, 1.5, 175, 2.5), estimate: { cost: false, fd: true } };
    show({ ...BOARD, priority: [{ ...BOARD.priority[0]!, estimate: { cost: true, fd: false } }, lotus], attNode: "Lotus Flower" });
    const list = await region("Upgrade priority");
    // the next upgrade marked as the server says (made up: its cost an estimate, its damage not)
    const next = list.getByRole("group", { name: "Next upgrade" }).textContent!;
    expect(next).toContain("≈ 3");
    expect(next).not.toContain("≈ +5.33%");
    expect([...list.getAllByRole("row")[1]!.querySelectorAll("td")].map((td) => td.textContent).slice(3, 5)).toEqual(["125", "≈ +1.50%"]);
    expect(list.getByText(/Lotus Flower's flat ATT counted from your 1 ATT value/)).toBeTruthy();
  });

  it("no ATT node: nothing said about flat ATT", async () => {
    show();
    expect((await region("Upgrade priority")).queryByText(/flat ATT/)).toBeNull();
  });

  it("nothing left: says so instead of a list", async () => {
    show({ ...BOARD, priority: [] });
    expect((await region("Upgrade priority")).getByText(/Nothing left/)).toBeTruthy();
  });

  it("the full order: every step with the level it goes to (MAX at 30 and for HEXA Stat); done, next, affordable; details on hover", async () => {
    show();
    await screen.findByRole("region", { name: "Upgrade priority" });
    expect(screen.queryByRole("region", { name: "Full upgrade order" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Full order" }));
    const order = await region("Full upgrade order");
    expect(screen.queryByRole("region", { name: "Upgrade priority" })).toBeNull();
    const steps = order.getAllByRole("listitem");
    expect(steps.map((li) => li.querySelector(".hexa-step-lv")!.textContent)).toEqual(["1", "1", "MAX", "1", "MAX"]);
    expect(steps.map((li) => li.className.replace("hexa-step", "").trim())).toEqual(["done", "next", "done", "", ""]);
    expect(steps[2]!.querySelector(".hexa-roman")!.textContent).toBe("I");
    // the details: its levels, cost, gain and when it's ready (no clicking: nothing happens)
    expect(steps[1]!.getAttribute("aria-label")).toBe("2. Plum Blossom: Storm Lv. 0 → 1");
    expect(within(steps[1]!).getByRole("tooltip", { hidden: true }).textContent).toContain("+2.06%");
    expect(within(steps[1]!).getByRole("tooltip", { hidden: true }).textContent).toContain("you have the fragments now");
    expect(within(steps[2]!).getByRole("tooltip", { hidden: true }).textContent).toContain("HEXA Stat I unlock → rank 20");
    expect(within(steps[4]!).getByRole("tooltip", { hidden: true }).textContent).toContain("ready —");
    // hiding what's done
    await userEvent.click(order.getByRole("checkbox", { name: /Hide done/ }));
    expect(order.getAllByRole("listitem").map((li) => li.getAttribute("aria-label")!.split(".")[0])).toEqual(["2", "4", "5"]);
    // and back
    await userEvent.click(screen.getByRole("button", { name: "Tracker" }));
    await screen.findByRole("region", { name: "Upgrade priority" });
  });

  it("the full order: a step affordable but not next is marked so", async () => {
    show({ ...BOARD, order: [step("mastery3", "Wish Unending", 0, 1, 5.33, false, 0), step("mastery1", "Plum Blossom: Storm", 0, 1, 2.06, false, 0)] });
    await userEvent.click(await screen.findByRole("button", { name: "Full order" }));
    expect((await region("Full upgrade order")).getAllByRole("listitem").map((li) => li.className)).toEqual(["hexa-step next", "hexa-step affordable"]);
  });

  it("the Epic Dungeons and what comes in follow the server's figures, and what's typed shows at once", async () => {
    show(BOARD, { "PUT /hexa/1": () => new Promise(() => {}) });
    const calc = await region("Fragment calculator");
    expect(within(calc.getByRole("combobox", { name: "Epic Dungeon" })).getAllByRole("option").map((o) => o.textContent)).toEqual(["None", "High Mountain (41 a week)", "Angler Company (56 a week)", "Nightmare Paradise (71 a week)"]);
    // the saves never finish and the board stays the old one: the sum is the input's
    await userEvent.click(calc.getByRole("checkbox", { name: "Erda's Request" }));
    expect(calc.getByRole("status").textContent).toContain("Coming in 91 a week");
    await userEvent.selectOptions(calc.getByRole("combobox", { name: "Epic Dungeon" }), "anglerCompany");
    expect(calc.getByRole("status").textContent).toContain("Coming in 147 a week");
  });

  it("HEXA Stat as typed shows at once: a stat picked, the unlocked tick, a line's level and the rank", async () => {
    show(BOARD, { "PUT /hexa/1": () => new Promise(() => {}) });
    const levels = await region("Current progress");
    const three = within(levels.getByRole("group", { name: "HEXA Stat III" }));
    await userEvent.selectOptions(three.getByRole("combobox", { name: "HEXA Stat III Main line stat" }), "ied");
    expect((three.getByRole("combobox", { name: "HEXA Stat III Main line stat" }) as HTMLSelectElement).value).toBe("ied");
    await userEvent.click(three.getByRole("checkbox", { name: "HEXA Stat III unlocked" }));
    expect((three.getByRole("checkbox", { name: "HEXA Stat III unlocked" }) as HTMLInputElement).checked).toBe(true);
    const lv = three.getByRole("spinbutton", { name: "HEXA Stat III Main line level" });
    await userEvent.clear(lv);
    await userEvent.type(lv, "2{Enter}");
    expect(levels.getByRole("group", { name: "HEXA Stat III" }).textContent).toContain("Rank 2 / 20");
    expect((three.getByRole("checkbox", { name: "HEXA Stat III unlocked" }) as HTMLInputElement).disabled).toBe(true);
  });

  it("a HEXA Stat line's level past what the node has room for shows what's kept (10 / 7 / 3: the third stays 3)", async () => {
    const full: HexaInput = { ...INPUT, stats: [{ lines: [line("att", 10), line("mainStat", 7), line("critDmg", 3)], unlocked: true }, INPUT.stats[1], INPUT.stats[2]] };
    const s = show({ ...BOARD, input: full });
    const box = (await region("Current progress")).getByRole("spinbutton", { name: "HEXA Stat I Additional line 2 level" }) as HTMLInputElement;
    await userEvent.clear(box);
    await userEvent.type(box, "10{Enter}");
    expect(box.value).toBe("3");
    expect(sent(s)).toEqual([]);
  });

  it("a level wanted below the level now shows as the level now; a node at 30 as typed is marked at once", async () => {
    show({ ...BOARD, input: { ...INPUT, current: { ...INPUT.current, ascent: 8 }, desired: { ...INPUT.desired, ascent: 5 } } }, { "PUT /hexa/1": () => new Promise(() => {}) });
    const levels = await region("Current progress");
    expect((levels.getByRole("spinbutton", { name: "Heartbound Verse level wanted" }) as HTMLInputElement).value).toBe("8");
    const now = levels.getByRole("spinbutton", { name: "Sol Hecate level now" });
    await userEvent.clear(now);
    await userEvent.type(now, "30{Enter}");
    expect(now.closest(".hexa-node")!.classList.contains("maxed")).toBe(true);
  });

  it("a change on another character while one's save is still going: each saved to its own, built on its own", async () => {
    // the first character's saves finish only when the test says
    const finish: ((v: unknown) => void)[] = [];
    const s = show(BOARD, { "PUT /hexa/1": () => new Promise((r) => finish.push(r)), "GET /hexa/3": { ...BOARD, input: { ...INPUT, owned: 333 } }, "PUT /hexa/3": undefined });
    const type = async (name: string, v: string) => {
      const box = (await region("Current progress")).getByRole("spinbutton", { name });
      await userEvent.clear(box);
      await userEvent.type(box, `${v}{Enter}`);
    };
    await type("Heartbound Verse level now", "5");
    // a second change waits behind the first
    await type("Lotus Flower level now", "7");
    await userEvent.click(screen.getByRole("tab", { name: /PlumBlade/ }));
    await waitFor(() => expect((screen.getByRole("spinbutton", { name: "Fragments owned" }) as HTMLInputElement).value).toBe("333"));
    await type("Sol Hecate level now", "6");
    // the first character's saves finish, one after the other; then the Ren's goes
    await waitFor(() => expect(finish).toHaveLength(1));
    finish[0]!(undefined);
    await waitFor(() => expect(finish).toHaveLength(2));
    finish[1]!(undefined);
    await waitFor(() => expect(s.sent("PUT", "/hexa/3")).toHaveLength(1));
    // the Ren's change went to it, made to its own input (not the first one's Heartbound Verse 5)
    const three = s.sent("PUT", "/hexa/3")[0] as HexaInput;
    expect([three.current.ascent, three.current.hecate, three.owned]).toEqual([0, 6, 333]);
    // the first one's two saves both went to it, the second made to the first
    expect((s.sent("PUT", "/hexa/1") as HexaInput[]).map((i) => [i.current.ascent, i.current.common3])).toEqual([[5, 0], [5, 7]]);
  });

  it("a change after leaving a character with a save still going and coming back is made to that save, not to the board reloaded meanwhile", async () => {
    // the first save never finishes; coming back reloads the board, which the server still has from before it
    const s = show(BOARD, { "PUT /hexa/1": () => new Promise(() => {}), "GET /hexa/3": BOARD });
    const type = async (name: string, v: string) => {
      const box = (await region("Current progress")).getByRole("spinbutton", { name });
      await userEvent.clear(box);
      await userEvent.type(box, `${v}{Enter}`);
    };
    await type("Heartbound Verse level now", "5");
    await userEvent.click(screen.getByRole("tab", { name: /PlumBlade/ }));
    await userEvent.click(screen.getByRole("tab", { name: /RemyRabbit/ }));
    await waitFor(() => expect(s.calls.filter((c) => c.method === "GET" && c.path === "/hexa/1").length).toBe(2));
    await type("Sol Hecate level now", "6");
    // (saved in order: the second waits behind the first, which never finishes; the change is what's shown)
    expect((screen.getByRole("spinbutton", { name: "Heartbound Verse level now" }) as HTMLInputElement).value).toBe("5");
    expect((screen.getByRole("spinbutton", { name: "Sol Hecate level now" }) as HTMLInputElement).value).toBe("6");
  });

  it("a saved change marks the Stats page's board for this character to be worked out again (its score follows the HEXA levels)", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(["stats", 1], { input: {} });
    qc.setQueryData(["stats", 3], { input: {} });
    fakeServer({ ...BASE_ROUTES, "GET /hexa": TABS, "GET /hexa/1": BOARD, "PUT /hexa/1": undefined });
    renderWithApp(<App />, "/hexa", qc);
    const levels = await region("Current progress");
    const box = levels.getByRole("spinbutton", { name: "Wish Unending level now" });
    await userEvent.clear(box);
    await userEvent.type(box, "12{Enter}");
    await waitFor(() => expect(qc.getQueryState(["stats", 1])!.isInvalidated).toBe(true));
    // another character's: not
    expect(qc.getQueryState(["stats", 3])!.isInvalidated).toBe(false);
  });

  it("after each check of Nexon, the board is worked out again (HEXA Stat's level needs follow the level)", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 20, 11, 59)));
    let finishedAt: string | null = "2026-10-20T08:00:30.000Z";
    const run = () => ({ last: { startedAt: "2026-10-20T08:00:00.000Z", finishedAt, checked: 1, updated: 1, missing: 0, failed: 0, problem: null } });
    const s = show(BOARD, { "GET /refresh": run });
    const loads = () => s.calls.filter((c) => c.method === "GET" && c.path === "/hexa/1").length;
    await vi.waitFor(() => expect(loads()).toBe(1));
    await new Promise((r) => setTimeout(r, 50));
    finishedAt = "2026-10-20T12:00:30.000Z";
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.waitFor(() => expect(loads()).toBe(2));
    vi.useRealTimers();
  });

  it("coming back to the window doesn't reload the board (a reload during a save would bring back the input before it)", async () => {
    const s = show();
    await region("HEXA summary");
    const gets = () => s.calls.filter((c) => c.method === "GET" && c.path === "/hexa/1").length;
    expect(gets()).toBe(1);
    focusManager.setFocused(false);
    focusManager.setFocused(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(gets()).toBe(1);
    focusManager.setFocused(undefined);
  });

  it("saving a character's stat values (another page) marks its HEXA board to be worked out again (HEXA Stat's damage follows them)", async () => {
    fakeServer({ ...BASE_ROUTES, "PUT /gear/:id/stat-values": undefined });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.setQueryData(["hexa", 1], BOARD);
    function Save() {
      const save = useSaveStatValues(45);
      return (
        <button type="button" onClick={() => save.mutate({ id: 1, values: { ...STAT_VALUE_DEFAULTS, att: 3 } })}>
          save
        </button>
      );
    }
    renderWithApp(<Save />, "/", qc);
    expect(qc.getQueryState(["hexa", 1])!.isInvalidated).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => expect(qc.getQueryState(["hexa", 1])!.isInvalidated).toBe(true));
  });

  it("HEXA Stat's damage waits for the lines as saved: while a change to any node is being saved, every node says \"working out…\"", async () => {
    show(BOARD, { "PUT /hexa/1": () => new Promise(() => {}) });
    const levels = await region("Current progress");
    const two = within(levels.getByRole("group", { name: "HEXA Stat II" }));
    expect(levels.getByRole("group", { name: "HEXA Stat II" }).textContent).toContain("≈ +3.51% to rank 20");
    const lv = two.getByRole("spinbutton", { name: "HEXA Stat II Main line level" });
    await userEvent.clear(lv);
    await userEvent.type(lv, "3{Enter}");
    expect(levels.getByRole("group", { name: "HEXA Stat II" }).textContent).toContain("working out…");
    expect(levels.getByRole("group", { name: "HEXA Stat II" }).textContent).not.toContain("+3.51%");
    // the others too (their assumed stats skip the others' main lines): "working out…" until it's saved
    expect(levels.getByRole("group", { name: "HEXA Stat I" }).textContent).toContain("working out…");
    expect(levels.getByRole("group", { name: "HEXA Stat I" }).textContent).not.toContain("+4.86%");
  });

  it("a failed save says so", async () => {
    show(BOARD, { "PUT /hexa/1": () => new Response(JSON.stringify({ error: "Database is locked" }), { status: 500 }) });
    await userEvent.click((await region("HEXA summary")).getByRole("checkbox", { name: /Sol Janus/ }));
    expect((await screen.findByRole("alert")).textContent).toContain("Database is locked");
  });
});
