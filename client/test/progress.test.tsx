import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CharacterView, DayBar, ProgressView } from "../src/api/types";
import { App } from "../src/App";
import { barDetail, barLabel, dayLabel, niceMax, ticks } from "../src/lib/chart";
import { nextUtcMidnight, untilNextUtcDay, utcDay } from "../src/lib/countdown";
import { BASE_ROUTES, fakeServer, renderWithApp } from "./server";

const MIKU: CharacterView = {
  id: 1,
  worldId: 45,
  name: "MikuBeam",
  job: "Kanna",
  level: 285,
  exp: 86_500_000_000_000,
  expToNext: 99_512_176_519_276,
  worldRank: 6_390,
  overallRank: 19_172,
  legion: null,
  avatar: null,
  addedAt: new Date(Date.UTC(2026, 9, 1)),
  checkedAt: new Date(Date.UTC(2026, 9, 20)),
  missingSince: null,
};

const day = (n: number) => `2026-10-${String(n).padStart(2, "0")}`;
// The 14 days before Oct 21: the 7th to the 20th.
function bars(over: Record<number, Partial<DayBar>> = {}): DayBar[] {
  return Array.from({ length: 14 }, (_, i) => ({ day: day(7 + i), gained: 1_000_000_000_000, covers: 1, ...over[7 + i] }));
}

const PROGRESS: ProgressView = {
  today: "2026-10-21",
  bars: bars({ 7: { gained: null, covers: 0 }, 12: { gained: 0 }, 15: { gained: null, covers: 0 }, 16: { gained: 3_000_000_000_000, covers: 2 }, 20: { gained: 5_000_000_000_000 } }),
  stats: { last7: 11_000_000_000_000, average: 1_500_000_000_000, best: { day: day(20), gained: 5_000_000_000_000 } },
  goals: [
    { kind: "next-level", target: 286, remaining: 13_000_000_000_000, days: 13_000_000_000_000 / 1_500_000_000_000 },
    { kind: "next-multiple-of-5", target: 290, remaining: 521_000_000_000_000, days: 521_000_000_000_000 / 1_500_000_000_000 },
  ],
};

function show(progress: unknown = PROGRESS, character = MIKU) {
  const server = fakeServer({ ...BASE_ROUTES, "GET /characters": { characters: [character], selectedId: character.id }, "GET /characters/:id/progress": progress });
  renderWithApp(<App />);
  return server;
}
const section = (name: string) => screen.findByRole("region", { name });
const barCols = (s: HTMLElement) => Array.from(s.querySelectorAll(".bar-col")) as HTMLElement[];

describe("chart helpers", () => {
  it("niceMax rounds up to 1, 2, 2.5 or 5 times a power of ten", () => {
    expect([niceMax(0), niceMax(-5), niceMax(1), niceMax(1.5), niceMax(2.2), niceMax(4), niceMax(7), niceMax(16.8e9), niceMax(5e12)]).toEqual([1, 1, 1, 2, 2.5, 5, 10, 20e9, 5e12]);
  });

  it("ticks are quarters of the top", () => {
    expect(ticks(20)).toEqual([0, 5, 10, 15, 20]);
  });

  it("bar labels: the amount, 0, or nothing without data", () => {
    expect([barLabel({ day: day(1), gained: 16_500_000_000, covers: 1 }), barLabel({ day: day(1), gained: 0, covers: 1 }), barLabel({ day: day(1), gained: null, covers: 0 })]).toEqual(["16.5B", "0", ""]);
  });

  it("days are UTC calendar days", () => {
    expect([dayLabel("2026-10-07"), dayLabel("2027-01-01")]).toEqual(["Oct 7", "Jan 1"]);
  });

  it("the tooltip says the day, the exact EXP, how many days it covers, or that there's no data", () => {
    expect(barDetail({ day: "2026-10-20", gained: 16_500_000_000, covers: 1 })).toBe("Tue, Oct 20: 16,500,000,000 EXP");
    expect(barDetail({ day: "2026-10-20", gained: 3_000, covers: 3 })).toBe("Tue, Oct 20: 3,000 EXP over 3 days (some days weren't checked)");
    expect(barDetail({ day: "2026-10-20", gained: null, covers: 0 })).toBe("Tue, Oct 20: no data (not checked that day)");
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

describe("the EXP section", () => {
  it("shows the 7-day total, daily average and best day", async () => {
    show();
    const s = await section("EXP");
    expect(Array.from(s.querySelectorAll(".exp-stats .stat")).map((x) => x.textContent)).toEqual(["EXP last 7 days11.0T", "Daily average (14 days)1.50T", "Best day5.00TOct 20"]);
    expect(Array.from(s.querySelectorAll(".exp-stats .stat")).map((x) => x.querySelectorAll(".small").length)).toEqual([0, 0, 1]); // only the best day has a note
    expect(s.querySelector(".legend")!.textContent).toBe("14-day average 1.50T");
  });

  it("one bar per day, with its amount above it and its day below, scaled to a round top", async () => {
    show();
    const s = await section("EXP");
    const cols = barCols(s);
    expect(cols).toHaveLength(14);
    expect(cols.map((c) => c.querySelector(".bar-label")!.textContent)).toEqual(["", "1.00T", "1.00T", "1.00T", "1.00T", "0", "1.00T", "1.00T", "", "3.00T2 days", "1.00T", "1.00T", "1.00T", "5.00T"]);
    expect(Array.from(s.querySelectorAll(".xaxis span")).map((x) => x.textContent)).toEqual(Array.from({ length: 14 }, (_, i) => `Oct ${7 + i}`));
    // the top of the scale is 5T (the best day), so a 1T bar is 20% tall and the label sits just above it
    expect((cols[1]!.querySelector(".bar") as HTMLElement).style.height).toBe("20%");
    expect((cols[1]!.querySelector(".bar-label") as HTMLElement).style.bottom).toBe("calc(20% + 4px)");
    expect((cols[13]!.querySelector(".bar") as HTMLElement).style.height).toBe("100%");
    expect(Array.from(s.querySelectorAll(".yaxis span")).map((x) => x.textContent)).toEqual(["0", "1.25T", "2.50T", "3.75T", "5.00T"]);
    // dashed grid lines at each step above zero (the bottom edge is the axis itself)
    expect(Array.from(s.querySelectorAll(".grid-line")).map((g) => (g as HTMLElement).style.bottom)).toEqual(["25%", "50%", "75%", "100%"]);
  });

  it("days without data look different and say so; a bar after them says how many days it covers", async () => {
    show();
    const cols = barCols(await section("EXP"));
    expect(cols.map((c) => c.classList.contains("no-data"))).toEqual([true, false, false, false, false, false, false, false, true, false, false, false, false, false]);
    expect(cols[0]!.getAttribute("aria-label")).toBe("Wed, Oct 7: no data (not checked that day)");
    expect(cols[9]!.getAttribute("aria-label")).toBe("Fri, Oct 16: 3,000,000,000,000 EXP over 2 days (some days weren't checked)");
    expect(cols[5]!.getAttribute("title")).toBe("Mon, Oct 12: 0 EXP");
    expect(cols.every((c) => c.tabIndex === 0)).toBe(true); // reachable from the keyboard, each with its details
  });

  it("the dashed average line sits at the average", async () => {
    show();
    expect((within(await section("EXP")).getByTestId("average-line") as HTMLElement).style.bottom).toBe("30%"); // 1.5T of 5T
  });

  it("without history yet: no stats, no average line, every day 'no data'", async () => {
    show({ ...PROGRESS, bars: bars(Object.fromEntries(Array.from({ length: 14 }, (_, i) => [7 + i, { gained: null, covers: 0 }]))), stats: { last7: null, average: null, best: null } });
    const s = await section("EXP");
    expect(Array.from(s.querySelectorAll(".exp-stats .value")).map((x) => x.textContent)).toEqual(["—", "—", "—"]);
    expect(s.querySelector(".legend")).toBeNull();
    expect(within(s).queryByTestId("average-line")).toBeNull();
    expect(barCols(s).every((c) => c.classList.contains("no-data"))).toBe(true);
    // no meaningless scale, but a note saying why it's empty
    expect(s.querySelectorAll(".yaxis span")).toHaveLength(0);
    expect(s.querySelector(".chart-empty")!.textContent).toBe("No EXP history yet: the first bar appears once a full UTC day has been checked.");
  });

  it("with some history, the scale shows and there's no empty-chart note", async () => {
    show();
    const s = await section("EXP");
    expect(s.querySelectorAll(".yaxis span")).toHaveLength(5);
    expect(s.querySelector(".chart-empty")).toBeNull();
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
    expect(s.querySelector(".countdown")!.textContent).toBe(`New day in 0h 00m 10s · 00:00 UTC is ${midnight} your time`);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(s.querySelector(".countdown b")!.textContent).toBe("0h 00m 07s");
    vi.useRealTimers();
  });

  it("at 00:00 UTC the chart is asked for again (yesterday's bar is finished), and only then", async () => {
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

describe("time to level", () => {
  it("the next level and the next multiple of 5: how long, how much EXP, and around when", async () => {
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

  it("with history but no EXP in the last 14 days: not at this pace", async () => {
    show({ ...PROGRESS, stats: { last7: 0, average: 0, best: null }, goals: [{ kind: "next-level", target: 286, remaining: 13e12, days: null }] });
    const s = await section("Time to level");
    expect(s.querySelector(".eta-item .value")!.textContent).toBe("Not at this pace");
    expect(s.querySelector(".eta-item small")!.textContent).toBe("13.0T EXP to go · no EXP in the last 14 days");
    expect(s.querySelector(".chart-head .countdown")!.textContent).toBe("At the 14-day average of 0 a day");
  });

  it("without enough history yet (a new character): says so, not 'not at this pace'", async () => {
    show({ ...PROGRESS, stats: { last7: null, average: null, best: null }, goals: [{ kind: "next-level", target: 286, remaining: 13e12, days: null }] });
    const s = await section("Time to level");
    expect(s.querySelector(".eta-item .value")!.textContent).toBe("Not enough history yet");
    expect(s.querySelector(".eta-item small")!.textContent).toBe("13.0T EXP to go · needs a full UTC day of history");
    expect(s.querySelector(".chart-head .countdown")).toBeNull();
  });

  it("at level 300 there's nothing left to reach", async () => {
    show({ ...PROGRESS, goals: [] }, { ...MIKU, level: 300, exp: 0, expToNext: null });
    expect((await section("Time to level")).textContent).toContain("Level 300: nothing left to reach.");
  });

  it("follows the selected character", async () => {
    const leek = { ...MIKU, id: 2, name: "LeekSpin" };
    const server = fakeServer({
      ...BASE_ROUTES,
      "GET /characters": { characters: [MIKU, leek], selectedId: 2 },
      "GET /characters/:id/progress": PROGRESS,
    });
    renderWithApp(<App />);
    await section("EXP");
    await waitFor(() => expect(server.calls.map((c) => c.path)).toContain("/characters/2/progress"));
    expect(server.calls.map((c) => c.path)).not.toContain("/characters/1/progress");
  });
});
