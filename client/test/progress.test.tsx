import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CharacterView, DayBar, ProgressView } from "../src/api/types";
import { App } from "../src/App";
import { amountStyle, barDetail, barLabel, dayLabel, fmtLevelPct, niceMax, showDate, ticks } from "../src/lib/chart";
import { nextUtcMidnight, untilNextUtcDay, utcDay } from "../src/lib/countdown";
import { levelDetail, levelHeight, levelScale, levelText, tickLabel } from "../src/lib/levelChart";
import { BASE_ROUTES, fakeServer, renderWithApp } from "./server";

const MIKU: CharacterView = {
  id: 1,
  worldId: 45,
  name: "MikuBeam",
  job: "Kanna",
  level: 285,
  exp: 86_500_000_000_000,
  expToNext: 99_512_176_519_276,
  byHand: false,
  worldRank: 6_390,
  overallRank: 19_172,
  legion: null,
  avatar: null,
  addedAt: new Date(Date.UTC(2026, 9, 1)),
  checkedAt: new Date(Date.UTC(2026, 9, 20)),
  missingSince: null,
};

const T = 1_000_000_000_000;
const TODAY = "2026-10-21";
const dayBack = (back: number) => new Date(Date.UTC(2026, 9, 21 - back)).toISOString().slice(0, 10);
// 90 days ending today (Oct 21), 1T a day, with some changes: `over` is keyed by days back from today.
function bars(over: Record<number, Partial<DayBar>> = {}): DayBar[] {
  return Array.from({ length: 90 }, (_, i) => ({ day: dayBack(89 - i), gained: T, covers: 1, ...over[89 - i] }));
}
const goals = (average: number) => [
  { kind: "next-level" as const, target: 286, remaining: 13 * T, days: (13 * T) / average },
  { kind: "next-multiple-of-5" as const, target: 290, remaining: 521 * T, days: (521 * T) / average },
];
const range = (days: number, total: number, levelPerDay: number) => ({ days, stats: { total, average: total / days, levelPerDay }, goals: goals(total / days) });

// Today 1.4T so far; 5T the day before; 9 days back a 0; 6 back not checked, so 5 back covers 2 days.
const PROGRESS: ProgressView = {
  today: TODAY,
  bars: bars({ 0: { gained: 1.4 * T }, 1: { gained: 5 * T }, 5: { gained: 3 * T, covers: 2 }, 6: { gained: null, covers: 0 }, 9: { gained: 0 }, 11: { gained: null, covers: 0 } }),
  // Level on checked days: 6 days back 276.40, then up to 278.93 today; 279 isn't reached. Not checked 6 back (gap) in this list: 5 back reached 277 "since the last check".
  levels: [
    { day: dayBack(20), level: 275.9, reached: [], covers: 1 },
    { day: dayBack(7), level: 276.4, reached: [276], covers: 13 },
    { day: dayBack(5), level: 277.1, reached: [277], covers: 2 },
    { day: dayBack(4), level: 277.5, reached: [], covers: 1 },
    { day: dayBack(1), level: 278.2, reached: [278], covers: 3 },
    { day: dayBack(0), level: 278.93, reached: [], covers: 1 },
  ],
  ranges: [range(7, 14 * T, 0.0205), range(14, 21 * T, 0.0151), range(30, 45 * T, 0.0153), range(90, 270 * T, 0.0306)],
  typed: null,
};

function show(progress: unknown = PROGRESS, character = MIKU) {
  const server = fakeServer({ ...BASE_ROUTES, "GET /characters": { characters: [character], selectedId: character.id }, "GET /characters/:id/progress": progress });
  renderWithApp(<App />);
  return server;
}
const section = (name: string) => screen.findByRole("region", { name });
const barCols = (s: HTMLElement) => Array.from(s.querySelectorAll(".bar-col")) as HTMLElement[];
const texts = (s: Element, selector: string) => Array.from(s.querySelectorAll(selector)).map((x) => x.textContent);

describe("chart helpers", () => {
  it("niceMax rounds up to 1, 2, 2.5 or 5 times a power of ten", () => {
    expect([niceMax(0), niceMax(-5), niceMax(1), niceMax(1.5), niceMax(2.2), niceMax(4), niceMax(7), niceMax(16.8e9), niceMax(5e12)]).toEqual([1, 1, 1, 2, 2.5, 5, 10, 20e9, 5e12]);
  });

  it("ticks are quarters of the top", () => {
    expect(ticks(20)).toEqual([0, 5, 10, 15, 20]);
  });

  it("bar labels: the amount, 0, or nothing without data", () => {
    expect([barLabel({ day: TODAY, gained: 16_500_000_000, covers: 1 }), barLabel({ day: TODAY, gained: 0, covers: 1 }), barLabel({ day: TODAY, gained: null, covers: 0 })]).toEqual(["16.5B", "0", ""]);
  });

  it("days are UTC calendar days", () => {
    expect([dayLabel("2026-10-07"), dayLabel("2027-01-01")]).toEqual(["Oct 7", "Jan 1"]);
  });

  it("the tooltip says the day (and whether it's today), the exact EXP, how many days it covers, or that there's no data", () => {
    expect(barDetail({ day: "2026-10-20", gained: 16_500_000_000, covers: 1 }, TODAY)).toBe("Tue, Oct 20: 16,500,000,000 EXP");
    expect(barDetail({ day: "2026-10-21", gained: 3_000, covers: 1 }, TODAY)).toBe("Wed, Oct 21 (today): 3,000 EXP");
    expect(barDetail({ day: "2026-10-20", gained: 3_000, covers: 3 }, TODAY)).toBe("Tue, Oct 20: 3,000 EXP over 3 days (some days weren't checked)");
    expect(barDetail({ day: "2026-10-20", gained: null, covers: 0 }, TODAY)).toBe("Tue, Oct 20: no data (not checked that day)");
  });

  it("amounts above every bar up to 14 bars, smaller up to 30, then only in the tooltips", () => {
    expect([7, 14, 15, 30, 31, 90].map(amountStyle)).toEqual(["full", "full", "small", "small", "none", "none"]);
  });

  it("dates under every bar up to 14, then every 3rd or 10th, counting back from today (always dated)", () => {
    const dated = (count: number) => Array.from({ length: count }, (_, i) => i).filter((i) => showDate(i, count));
    expect(dated(14)).toHaveLength(14);
    expect(dated(30)).toEqual([2, 5, 8, 11, 14, 17, 20, 23, 26, 29]);
    expect(dated(90)).toEqual([9, 19, 29, 39, 49, 59, 69, 79, 89]);
  });

  it("a share of a level a day, as a percent with its sign", () => {
    expect([fmtLevelPct(0.2051), fmtLevelPct(0), fmtLevelPct(26.963), fmtLevelPct(-0.012)]).toEqual(["+20.5%", "+0.0%", "+2,696.3%", "-1.2%"]);
  });
});

describe("countdown helpers", () => {
  it("to the next 00:00 UTC, however close", () => {
    expect(untilNextUtcDay(new Date(Date.UTC(2026, 9, 20, 3, 10, 55)))).toBe("20h 49m 05s");
    expect(untilNextUtcDay(new Date(Date.UTC(2026, 9, 20, 23, 59, 59)))).toBe("0h 00m 01s");
    expect(untilNextUtcDay(new Date(Date.UTC(2026, 9, 21, 0, 0, 0)))).toBe("24h 00m 00s");
  });

  it("the next midnight and the day are UTC ones", () => {
    expect(nextUtcMidnight(new Date(Date.UTC(2026, 11, 31, 18))).toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(utcDay(new Date(Date.UTC(2026, 9, 21, 0, 30)))).toBe("2026-10-21");
  });
});

describe("the range boxes", () => {
  it("one per range: the daily average, the share of a level a day, and the total; 14 days chosen at first", async () => {
    show();
    const s = await section("EXP");
    expect(texts(s, ".range-box")).toEqual([
      "7 days2.00T a dayGained +2.1% a dayTotal 14.0T",
      "14 days1.50T a dayGained +1.5% a dayTotal 21.0T",
      "30 days1.50T a dayGained +1.5% a dayTotal 45.0T",
      "90 days3.00T a dayGained +3.1% a dayTotal 270T",
    ]);
    expect(texts(s, ".range-box.on .range-name")).toEqual(["14 days"]);
    expect(Array.from(s.querySelectorAll(".range-box")).map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true", "false", "false"]);
    expect(s.querySelectorAll(".range-box .gain")).toHaveLength(4); // gains are highlighted
  });

  it("a range without history shows dashes; no gain, no highlight", async () => {
    show({ ...PROGRESS, ranges: [{ days: 7, stats: null, goals: [] }, ...PROGRESS.ranges.slice(1, 3), { ...PROGRESS.ranges[3]!, stats: { total: 0, average: 0, levelPerDay: 0 } }] });
    const s = await section("EXP");
    expect(texts(s, ".range-box")[0]).toBe("7 days— a dayGained —Total —");
    expect(texts(s, ".range-box")[3]).toBe("90 days0 a dayGained +0.0% a dayTotal 0");
    expect(s.querySelectorAll(".range-box .gain")).toHaveLength(2);
  });

  it("clicking a button at the top right or a box picks that range, and they stay in step", async () => {
    show();
    const s = await section("EXP");
    const user = userEvent.setup();
    await user.click(within(s.querySelector<HTMLElement>('[aria-label="Days shown"]')!).getByRole("button", { name: "7 days" }));
    expect(texts(s, ".range-box.on .range-name")).toEqual(["7 days"]);
    expect(texts(s, '[aria-label="Days shown"] [aria-pressed=true]')).toEqual(["7 days"]);
    expect(barCols(s)).toHaveLength(7);
    await user.click(s.querySelectorAll<HTMLElement>(".range-box")[2]!);
    expect(texts(s, '[aria-label="Days shown"] [aria-pressed=true]')).toEqual(["30 days"]);
    expect(texts(s, ".range-box.on .range-name")).toEqual(["30 days"]);
    expect(barCols(s)).toHaveLength(30);
    expect(s.querySelector(".legend")!.textContent).toBe("30-day average 1.50T");
  });
});

const pick = async (s: HTMLElement, days: number) => userEvent.setup().click(within(s.querySelector<HTMLElement>('[aria-label="Days shown"]')!).getByRole("button", { name: `${days} days` }));

describe("the chart", () => {
  it("14 bars ending today, with amounts above and dates below, scaled to a round top", async () => {
    show();
    const s = await section("EXP");
    const cols = barCols(s);
    expect(cols).toHaveLength(14);
    expect(cols.map((c) => c.querySelector(".bar-label")!.textContent)).toEqual(["1.00T", "1.00T", "", "1.00T", "0", "1.00T", "1.00T", "", "3.00T2 days", "1.00T", "1.00T", "1.00T", "5.00T", "1.40T"]);
    expect(texts(s, ".xaxis span")).toEqual([...Array.from({ length: 13 }, (_, i) => dayLabel(dayBack(13 - i))), "Today"]);
    // the top of the scale is 5T, so a 1T bar is 20% tall and its label sits just above it
    expect(cols[0]!.querySelector<HTMLElement>(".bar")!.style.height).toBe("20%");
    expect(cols[0]!.querySelector<HTMLElement>(".bar-label")!.style.bottom).toBe("calc(20% + 4px)");
    expect(cols[12]!.querySelector<HTMLElement>(".bar")!.style.height).toBe("100%");
    expect(texts(s, ".yaxis span")).toEqual(["0", "1.25T", "2.50T", "3.75T", "5.00T"]);
    expect(Array.from(s.querySelectorAll<HTMLElement>(".grid-line")).map((g) => g.style.bottom)).toEqual(["25%", "50%", "75%", "100%"]);
    expect(s.querySelector(".chart")!.classList.contains("amounts-full")).toBe(true);
  });

  it("days without data look different and say so; a bar after them says how many days it covers; today says so", async () => {
    show();
    const cols = barCols(await section("EXP"));
    expect(cols.map((c) => c.classList.contains("no-data"))).toEqual([false, false, true, false, false, false, false, true, false, false, false, false, false, false]);
    expect(cols[2]!.getAttribute("aria-label")).toBe("Sat, Oct 10: no data (not checked that day)");
    expect(cols[8]!.getAttribute("aria-label")).toBe("Fri, Oct 16: 3,000,000,000,000 EXP over 2 days (some days weren't checked)");
    expect(cols[13]!.getAttribute("title")).toBe("Wed, Oct 21 (today): 1,400,000,000,000 EXP");
    expect(cols.every((c) => c.tabIndex === 0)).toBe(true); // reachable from the keyboard, each with its details
  });

  it("30 bars: smaller amounts without '2 days', every 3rd day dated", async () => {
    show();
    const s = await section("EXP");
    await pick(s, 30);
    expect(s.querySelector(".chart")!.classList.contains("amounts-small")).toBe(true);
    expect(barCols(s)[24]!.querySelector(".bar-label")!.textContent).toBe("3.00T"); // 5 days back
    expect(texts(s, ".xaxis span").filter(Boolean)).toEqual([27, 24, 21, 18, 15, 12, 9, 6, 3].map((b) => dayLabel(dayBack(b))).concat("Today"));
  });

  it("90 bars: amounts only in the tooltips, every 10th day dated", async () => {
    show();
    const s = await section("EXP");
    await pick(s, 90);
    expect(barCols(s)).toHaveLength(90);
    expect(s.querySelector(".chart")!.classList.contains("amounts-none")).toBe(true);
    expect(s.querySelectorAll(".bar-label")).toHaveLength(0);
    expect(barCols(s)[89]!.getAttribute("title")).toBe("Wed, Oct 21 (today): 1,400,000,000,000 EXP");
    expect(texts(s, ".xaxis span").filter(Boolean)).toHaveLength(9);
    expect(texts(s, ".xaxis span").at(-1)).toBe("Today");
  });

  it("the dashed average line sits at the chosen range's average", async () => {
    show();
    const s = await section("EXP");
    expect(within(s).getByTestId("average-line").style.bottom).toBe("30%"); // 1.5T of 5T
    await pick(s, 7);
    expect(within(s).getByTestId("average-line").style.bottom).toBe("40%"); // 2T of 5T
  });

  it("without history yet: no scale, no average line, every day 'no data', and a note", async () => {
    show({ ...PROGRESS, bars: bars(Object.fromEntries(Array.from({ length: 90 }, (_, b) => [b, { gained: null, covers: 0 }]))), ranges: PROGRESS.ranges.map((r) => ({ ...r, stats: null })) });
    const s = await section("EXP");
    expect(s.querySelector(".legend")).toBeNull();
    expect(within(s).queryByTestId("average-line")).toBeNull();
    expect(barCols(s).every((c) => c.classList.contains("no-data"))).toBe(true);
    expect(s.querySelectorAll(".yaxis span")).toHaveLength(0);
    expect(s.querySelector(".chart-empty")!.textContent).toBe("No EXP history yet: the first bar appears after the next check of Nexon (every 4 hours).");
  });

  it("with only 0s and days without data: no scale (it would read 0, 0, 0…), and no empty-chart note", async () => {
    show({ ...PROGRESS, bars: bars(Object.fromEntries(Array.from({ length: 90 }, (_, b) => [b, b === 0 ? { gained: 0 } : { gained: null, covers: 0 }]))) });
    const s = await section("EXP");
    expect(s.querySelectorAll(".yaxis span")).toHaveLength(0);
    expect(s.querySelector(".chart-empty")).toBeNull();
    expect(barCols(s).at(-1)!.querySelector(".bar-label")!.textContent).toBe("0");
  });

  it("with some history, the scale shows and there's no empty-chart note", async () => {
    show();
    const s = await section("EXP");
    expect(s.querySelectorAll(".yaxis span")).toHaveLength(5);
    expect(s.querySelector(".chart-empty")).toBeNull();
  });

  it("a day with less EXP than the day before stays on the axis", async () => {
    show({ ...PROGRESS, bars: bars({ 0: { gained: -2 * T } }) });
    const cols = barCols(await section("EXP"));
    expect(cols[13]!.querySelector<HTMLElement>(".bar")!.style.height).toBe("0%");
  });

  it("while loading, and when it can't be loaded", async () => {
    fakeServer({ ...BASE_ROUTES, "GET /characters": { characters: [MIKU], selectedId: 1 }, "GET /characters/:id/progress": () => new Promise(() => {}) });
    const first = renderWithApp(<App />);
    expect(await screen.findByText("Loading…")).toBeTruthy();
    first.unmount();
    fakeServer({ ...BASE_ROUTES, "GET /characters": { characters: [MIKU], selectedId: 1 }, "GET /characters/:id/progress": new Response(JSON.stringify({ error: "Server error" }), { status: 500 }) });
    renderWithApp(<App />);
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't load the EXP history: Server error");
  });
});

describe("the countdown to 00:00 UTC", () => {
  it("counts down each second, with 00:00 UTC in local time", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 20, 23, 59, 50)));
    show();
    const s = await section("EXP");
    const midnight = new Date(Date.UTC(2026, 9, 21)).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    expect(s.querySelector(".countdown")!.textContent).toBe(`New day in 0h 00m 10s · 00:00 UTC is ${midnight} your time.`);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(s.querySelector(".countdown b")!.textContent).toBe("0h 00m 07s");
    vi.useRealTimers();
  });

  it("at 00:00 UTC the chart is asked for again (a new day's bar), and only then", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 20, 23, 59, 58)));
    const server = show();
    await section("EXP");
    const asked = () => server.calls.filter((c) => c.path === "/characters/1/progress").length;
    expect(asked()).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000); // 23:59:59: same day
    expect(asked()).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000); // 00:00:00 UTC: a new day
    await vi.waitFor(() => expect(asked()).toBe(2));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(asked()).toBe(2);
    // only the chart was asked for again, not everything else
    expect(server.calls.filter((c) => c.path === "/settings")).toHaveLength(1);
    expect(server.calls.filter((c) => c.path.startsWith("/characters?"))).toHaveLength(1);
    vi.useRealTimers();
  });

  it("stops its own once-a-second timer when the page closes", async () => {
    const started = vi.spyOn(globalThis, "setInterval");
    const cleared = vi.spyOn(globalThis, "clearInterval");
    show();
    await section("EXP");
    const countdown = started.mock.results[started.mock.calls.findIndex((c) => c[1] === 1000)]!.value;
    expect(cleared).not.toHaveBeenCalledWith(countdown);
    const { cleanup } = await import("@testing-library/react");
    cleanup();
    expect(cleared).toHaveBeenCalledWith(countdown);
  });
});

describe("after each check of Nexon", () => {
  it("when a new check has finished, the characters and the chart are loaded again (and not before)", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 20, 11, 59)));
    let finishedAt: string | null = "2026-10-20T08:00:30.000Z";
    const run = () => ({ last: { startedAt: "2026-10-20T08:00:00.000Z", finishedAt, checked: 1, updated: 1, missing: 0, failed: 0, problem: null } });
    const server = fakeServer({ ...BASE_ROUTES, "GET /refresh": run, "GET /characters": { characters: [MIKU], selectedId: 1 }, "GET /characters/:id/progress": PROGRESS });
    renderWithApp(<App />);
    await section("EXP");
    const count = (prefix: string) => server.calls.filter((c) => c.path.startsWith(prefix)).length;
    await vi.waitFor(() => expect([count("/refresh"), count("/characters?"), count("/characters/1/progress")]).toEqual([1, 1, 1]));
    await vi.advanceTimersByTimeAsync(60_000); // asked again: the same check
    await vi.waitFor(() => expect(count("/refresh")).toBe(2));
    expect([count("/characters?"), count("/characters/1/progress")]).toEqual([1, 1]);
    finishedAt = null; // a new check started and hasn't finished
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.waitFor(() => expect(count("/refresh")).toBe(3));
    await vi.waitFor(() => expect([count("/characters?"), count("/characters/1/progress")]).toEqual([2, 2]));
    finishedAt = "2026-10-20T12:00:30.000Z"; // and now it has
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.waitFor(() => expect([count("/characters?"), count("/characters/1/progress")]).toEqual([3, 3]));
    vi.useRealTimers();
  });
});

describe("time to level", () => {
  it("at the chosen range's average: how long, how much EXP, and around when", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 20, 19)));
    show();
    const s = await section("Time to level");
    expect(s.querySelector(".chart-head .countdown")!.textContent).toBe("At the 14-day average of 1.50T a day");
    const items = Array.from(s.querySelectorAll(".eta-item"));
    expect(items.map((i) => i.querySelector(".label")!.textContent)).toEqual(["Next level", "Next multiple of 5"]);
    expect(items.map((i) => i.querySelector(".eta-level")!.textContent)).toEqual(["Level 286", "Level 290"]);
    expect(items.map((i) => i.querySelector(".value")!.textContent)).toEqual(["≈ 8.7 days", "≈ 11.4 months"]);
    expect(items[0]!.querySelector("small")!.textContent).toBe("13.0T EXP to go · around Thu, Oct 29");
    // 347.3 days after noon Oct 20 in California is 03:00 UTC on Oct 3, 2027: still the evening of Oct 2 there. Dates are local.
    expect(items[1]!.querySelector("small")!.textContent).toBe(`521T EXP to go · around ${process.env.TZ === "UTC" ? "Sun, Oct 3" : "Sat, Oct 2"}, 2027`);
    vi.useRealTimers();
  });

  it("follows the chosen range", async () => {
    show();
    await pick(await section("EXP"), 7);
    const s = await section("Time to level");
    expect(s.querySelector(".chart-head .countdown")!.textContent).toBe("At the 7-day average of 2.00T a day");
    expect(texts(s, ".eta-item .value")).toEqual(["≈ 6.5 days", "≈ 8.6 months"]); // 13T and 521T at 2T a day: 6.5 and 260.5 days
  });

  it("with history but no EXP in the range: not at this pace", async () => {
    show({ ...PROGRESS, ranges: PROGRESS.ranges.map((r) => ({ ...r, stats: { total: 0, average: 0, levelPerDay: 0 }, goals: [{ kind: "next-level", target: 286, remaining: 13e12, days: null }] })) });
    const s = await section("Time to level");
    expect(s.querySelector(".eta-item .value")!.textContent).toBe("Not at this pace");
    expect(s.querySelector(".eta-item small")!.textContent).toBe("13.0T EXP to go · no EXP in the last 14 days");
    expect(s.querySelector(".chart-head .countdown")!.textContent).toBe("At the 14-day average of 0 a day");
  });

  it("EXP that went down shows as an average of 0, not a negative", async () => {
    show({ ...PROGRESS, ranges: PROGRESS.ranges.map((r) => ({ ...r, stats: { total: -5, average: -1, levelPerDay: 0 }, goals: [{ kind: "next-level", target: 286, remaining: 13e12, days: null }] })) });
    expect((await section("Time to level")).querySelector(".chart-head .countdown")!.textContent).toBe("At the 14-day average of 0 a day");
  });

  it("without history in the range: says so, not 'not at this pace'", async () => {
    show({ ...PROGRESS, ranges: PROGRESS.ranges.map((r) => ({ ...r, stats: null, goals: [{ kind: "next-level", target: 286, remaining: 13e12, days: null }] })) });
    const s = await section("Time to level");
    expect(s.querySelector(".eta-item .value")!.textContent).toBe("Not enough history yet");
    expect(s.querySelector(".eta-item small")!.textContent).toBe("13.0T EXP to go · no EXP history in the last 14 days");
    expect(s.querySelector(".chart-head .countdown")).toBeNull();
  });

  it("at level 300 there's nothing left to reach", async () => {
    show({ ...PROGRESS, ranges: PROGRESS.ranges.map((r) => ({ ...r, goals: [] })) }, { ...MIKU, level: 300, exp: 0, expToNext: null });
    expect((await section("Time to level")).textContent).toContain("Level 300: nothing left to reach.");
  });

  it("follows the selected character", async () => {
    const leek = { ...MIKU, id: 2, name: "LeekSpin" };
    const server = fakeServer({ ...BASE_ROUTES, "GET /characters": { characters: [MIKU, leek], selectedId: 2 }, "GET /characters/:id/progress": PROGRESS });
    renderWithApp(<App />);
    await section("EXP");
    await waitFor(() => expect(server.calls.map((c) => c.path)).toContain("/characters/2/progress"));
    expect(server.calls.map((c) => c.path)).not.toContain("/characters/1/progress");
  });
});

describe("level chart helpers", () => {
  it("the scale rounds out to quarter levels, with lines every quarter, level or few levels", () => {
    expect(levelScale([])).toBeNull();
    expect(levelScale([278.93])).toEqual({ lo: 278.75, hi: 279, ticks: [278.75, 279] });
    expect(levelScale([278.3, 278.93])).toEqual({ lo: 278.25, hi: 279, ticks: [278.25, 278.5, 278.75, 279] });
    expect(levelScale([276.4, 278.93])).toEqual({ lo: 276.25, hi: 279, ticks: [277, 278, 279] });
    expect(levelScale([264.1, 278.93])).toEqual({ lo: 264, hi: 279, ticks: [264, 267, 270, 273, 276, 279] });
    expect(levelScale([280, 280])).toEqual({ lo: 279.75, hi: 280, ticks: [279.75, 280] }); // never flat (the room goes below)
    expect(levelScale([300, 300])).toEqual({ lo: 299.75, hi: 300, ticks: [299.75, 300] }); // never above 300 (no "300 · 25%")
    expect(levelScale([299.9, 300])).toEqual({ lo: 299.75, hi: 300, ticks: [299.75, 300] });
    expect(levelScale([278, 279])).toEqual({ lo: 278, hi: 279, ticks: [278, 278.25, 278.5, 278.75, 279] }); // exactly one level: still quarters
    expect(levelScale([270, 282])).toEqual({ lo: 270, hi: 282, ticks: [270, 272, 274, 276, 278, 280, 282] }); // 12 levels: every 2
  });

  it("how high a level sits, from 0 to 1", () => {
    const scale = { lo: 276, hi: 280, ticks: [] };
    expect([levelHeight(276, scale), levelHeight(278, scale), levelHeight(280, scale)]).toEqual([0, 0.5, 1]);
  });

  it("labels: whole levels, quarters as a percent, and a day's level", () => {
    expect([tickLabel(278), tickLabel(278.25), tickLabel(278.75)]).toEqual(["278", "278 · 25%", "278 · 75%"]);
    expect([levelText(278.93), levelText(250), levelText(300)]).toEqual(["Lv. 278 · 93.00%", "Lv. 250 · 0.00%", "Lv. 300"]);
    expect(levelText(285.99996)).toBe("Lv. 285 · 99.99%"); // rounded down: never "100.00%" of a level not done
    expect([levelText(278.2), levelText(278.29), levelText(278.07)]).toEqual(["Lv. 278 · 20.00%", "Lv. 278 · 29.00%", "Lv. 278 · 7.00%"]); // stored as 278.19999…, still 20.00%
  });

  it("a day's tooltip: its level, level-ups (since the last check, when that was earlier), or no data", () => {
    expect(levelDetail("2026-10-21", { day: "2026-10-21", level: 278.93, reached: [], covers: 1 }, TODAY)).toBe("Wed, Oct 21 (today): Lv. 278 · 93.00%");
    expect(levelDetail("2026-10-20", { day: "2026-10-20", level: 278.2, reached: [278], covers: 1 }, TODAY)).toBe("Tue, Oct 20: Lv. 278 · 20.00% · reached 278");
    expect(levelDetail("2026-10-20", { day: "2026-10-20", level: 279.1, reached: [278, 279], covers: 3 }, TODAY)).toBe("Tue, Oct 20: Lv. 279 · 10.00% · reached 278, 279 since the last check (Oct 17)");
    expect(levelDetail("2026-10-19", undefined, TODAY)).toBe("Mon, Oct 19: no data (not checked that day)");
  });
});

describe("the Level view", () => {
  const showLevel = async (progress: unknown = PROGRESS) => {
    show(progress);
    const s = await section("EXP");
    await userEvent.setup().click(within(s.querySelector<HTMLElement>(".chart-view")!).getByRole("button", { name: "Level" }));
    return s;
  };

  it("starts on EXP per day; 'Level' swaps the bars for the level line, and back", async () => {
    show();
    const s = await section("EXP");
    expect(texts(s, '.chart-view [aria-pressed="true"]')).toEqual(["EXP per day"]);
    const user = userEvent.setup();
    await user.click(within(s.querySelector<HTMLElement>(".chart-view")!).getByRole("button", { name: "Level" }));
    expect(within(s).getByRole("group", { name: "Level per day" })).toBeTruthy();
    expect(barCols(s)).toHaveLength(0);
    expect(s.querySelector(".legend")).toBeNull(); // the EXP average belongs to the bars
    expect(s.querySelector(".chart-foot")!.textContent).toContain("Highlighted dots: level-ups");
    expect(s.querySelector(".chart-title")!.textContent).toBe("Level per day (UTC)"); // a heading of its own, not the buttons
    await user.click(within(s.querySelector<HTMLElement>(".chart-view")!).getByRole("button", { name: "EXP per day" }));
    expect(barCols(s)).toHaveLength(14);
    expect(s.querySelector(".chart-title")!.textContent).toMatch(/^EXP farmed per day \(UTC\)/);
  });

  it("one column per day of the range (same days and dates as the bars), points only on checked days", async () => {
    const s = await showLevel();
    expect(s.querySelectorAll(".level-col")).toHaveLength(14);
    expect(texts(s, ".xaxis span").at(-1)).toBe("Today");
    // 14 days: the points 7, 5, 4, 1 and 0 days back (20 back is outside)
    expect(s.querySelectorAll(".level-dot")).toHaveLength(5);
    expect(s.querySelectorAll(".level-dot.up")).toHaveLength(3); // 276, 277, 278
    expect(s.querySelectorAll(".level-dot.latest")).toHaveLength(1);
    expect(s.querySelector<HTMLElement>(".level-dot.latest")!.style.left).toBe(`${(13.5 / 14) * 100}%`);
  });

  it("the scale fits the range: 276.25 to 279, a line every level", async () => {
    const s = await showLevel();
    expect(texts(s, ".yaxis span")).toEqual(["277", "278", "279"]);
    // 278.93 of 276.25–279: 97.45…% up
    expect(Number.parseFloat(s.querySelector<HTMLElement>(".level-dot.latest")!.style.bottom)).toBeCloseTo(((278.93 - 276.25) / 2.75) * 100, 6);
  });

  it("tooltips: each day's level and level-ups, and the days without data", async () => {
    const s = await showLevel();
    const cols = Array.from(s.querySelectorAll<HTMLElement>(".level-col"));
    expect(cols.at(-1)!.getAttribute("title")).toBe(levelDetail(dayBack(0), PROGRESS.levels.at(-1), TODAY));
    expect(cols[8]!.getAttribute("aria-label")).toBe(`${levelDetail(dayBack(5), PROGRESS.levels[2], TODAY)}`);
    expect(cols[8]!.getAttribute("aria-label")).toMatch(/reached 277 since the last check/);
    expect(cols[0]!.getAttribute("title")).toMatch(/no data/);
    expect(cols.every((c) => c.tabIndex === 0)).toBe(true);
  });

  it("follows the range: 7 days shows the last 7 days' points and rescales", async () => {
    const s = await showLevel();
    await pick(s, 7);
    expect(s.querySelectorAll(".level-col")).toHaveLength(7);
    expect(s.querySelectorAll(".level-dot")).toHaveLength(4); // today and 6 days back: 5, 4 and 1 back, and today (7 back is just outside)
    await pick(s, 90);
    // beyond 14 days only level-ups (276, 277, 278) and today get dots
    expect(s.querySelectorAll(".level-dot")).toHaveLength(4);
    expect(s.querySelectorAll(".level-dot.up")).toHaveLength(3);
    expect(texts(s, ".yaxis span")).toEqual(["276", "277", "278", "279"]);
  });

  it("without level history yet: says so, no line", async () => {
    const s = await showLevel({ ...PROGRESS, levels: [] });
    expect(s.querySelector(".chart-empty")!.textContent).toMatch(/No level history yet/);
    expect(s.querySelector(".level-line")).toBeNull();
    expect(s.querySelectorAll(".yaxis span")).toHaveLength(0);
  });
});
