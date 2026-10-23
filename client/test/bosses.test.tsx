import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BossBoard, BossCharacter, BossInfo } from "../src/api/types";
import { App } from "../src/App";
import { entryMeso, inGameOrder, partyText, type PlanEntry, planSummary, resetDay, resetLocal, setDifficulty, stepParty, toggleBoss, untilReset, withTick } from "../src/lib/bosses";
import { BASE_ROUTES, fakeServer, renderWithApp } from "./server";

const M = 1_000_000;
const UTC = process.env.TZ === "UTC";

// Made-up bosses with simple numbers (the real ones come from the server's price list).
const ZAKUM: BossInfo = { id: "zakum", name: "Zakum", kind: "weekly", art: null, difficulties: [{ difficulty: "Chaos", maxParty: 6, perPerson: [60 * M, 30 * M, 20 * M, 15 * M, 12 * M, 10 * M] }] };
const LUCID: BossInfo = {
  id: "lucid",
  name: "Lucid",
  kind: "weekly",
  art: "/boss-art/lucid.png?v=1",
  difficulties: [
    { difficulty: "Easy", maxParty: 6, perPerson: [120 * M, 60 * M, 40 * M, 30 * M, 24 * M, 20 * M] },
    { difficulty: "Hard", maxParty: 6, perPerson: [600 * M, 300 * M, 200 * M, 150 * M, 120 * M, 100 * M] },
  ],
};
const LOTUS: BossInfo = {
  id: "lotus",
  name: "Lotus",
  kind: "weekly",
  art: null,
  difficulties: [
    { difficulty: "Normal", maxParty: 6, perPerson: [180 * M, 90 * M, 60 * M, 45 * M, 36 * M, 30 * M] },
    { difficulty: "Extreme", maxParty: 2, perPerson: [1_400 * M, 700 * M] },
  ],
};
const BLACK_MAGE: BossInfo = {
  id: "black_mage",
  name: "Black Mage",
  kind: "monthly",
  art: null,
  difficulties: [{ difficulty: "Hard", maxParty: 6, perPerson: [4_500 * M, 2_250 * M, 1_500 * M, 1_125 * M, 900 * M, 750 * M] }],
};
const BOSSES = [ZAKUM, LUCID, LOTUS, BLACK_MAGE];

function character(id: number, name: string, extra: Partial<BossCharacter> = {}): BossCharacter {
  return { id, name, job: "Kanna", level: 278, avatar: null, weekly: [], monthly: [], planned: 0, soFar: 0, cleared: 0, ...extra };
}

// Remy: Zakum (cleared) and Hard Lucid in a party of 2, plus Black Mage. Meow: nothing planned.
const REMY = character(1, "Remy", {
  weekly: [
    { boss: "zakum", difficulty: "Chaos", partySize: 1, meso: 60 * M, cleared: true, over: null },
    { boss: "lucid", difficulty: "Hard", partySize: 2, meso: 300 * M, cleared: false, over: null },
  ],
  monthly: [{ boss: "black_mage", difficulty: "Hard", partySize: 6, meso: 750 * M, cleared: false, over: null }],
  planned: 360 * M,
  soFar: 60 * M,
  cleared: 1,
});
const MEOW = character(2, "Meow");

function board(characters: BossCharacter[], extra: Partial<BossBoard> = {}): BossBoard {
  return {
    pricesPatch: "v.270",
    week: { start: "2026-10-15", resetsAt: new Date("2026-10-22T00:00:00.000Z") },
    month: { name: "2026-10", resetsAt: new Date("2026-11-01T00:00:00.000Z") },
    limits: { perCharacter: 14, perWorld: 180 },
    bosses: BOSSES,
    characters,
    totals: { planned: 360 * M, soFar: 60 * M, cleared: 1, bosses: 2, crystals: 2, monthlyPlanned: 750 * M, monthlySoFar: 0 },
    ...extra,
  };
}

// Tue 20 Oct 2026, 19:00 UTC: the weekly reset is 1 day 5 hours away.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(Date.UTC(2026, 9, 20, 19, 0)));
});
afterEach(() => vi.useRealTimers());

function show(b: unknown = board([REMY, MEOW]), routes: Record<string, unknown> = {}) {
  const server = fakeServer({ ...BASE_ROUTES, "GET /bosses": b, "PUT /bosses/:id/plan": undefined, "PUT /bosses/:id/clears/zakum": undefined, "PUT /bosses/:id/clears/lucid": undefined, ...routes });
  renderWithApp(<App />, "/bosses");
  return server;
}
const card = async (name: string) => within(await screen.findByRole("article", { name }));

describe("the planning menu's changes", () => {
  it("toggleBoss adds a boss at its easiest difficulty, solo, or takes it out", () => {
    const plan = [{ boss: "zakum", difficulty: "Chaos" as const, partySize: 1 }];
    expect(toggleBoss(plan, LUCID)).toEqual([...plan, { boss: "lucid", difficulty: "Easy", partySize: 1 }]);
    expect(toggleBoss(toggleBoss(plan, LUCID), ZAKUM)).toEqual([{ boss: "lucid", difficulty: "Easy", partySize: 1 }]);
  });

  it("setDifficulty changes only that boss, shrinking its party to what the difficulty allows", () => {
    const plan = [
      { boss: "lotus", difficulty: "Normal" as const, partySize: 4 },
      { boss: "lucid", difficulty: "Easy" as const, partySize: 4 },
    ];
    expect(setDifficulty(plan, LOTUS, "Extreme")).toEqual([{ boss: "lotus", difficulty: "Extreme", partySize: 2 }, plan[1]]);
    expect(setDifficulty(plan, LUCID, "Hard")).toEqual([plan[0], { boss: "lucid", difficulty: "Hard", partySize: 4 }]);
    expect(setDifficulty([{ boss: "lotus", difficulty: "Normal", partySize: 1 }], LOTUS, "Extreme")[0]!.partySize).toBe(1);
  });

  it("stepParty goes from solo up to the difficulty's largest party, and no further either way", () => {
    let plan: PlanEntry[] = [{ boss: "lotus", difficulty: "Extreme", partySize: 1 }, { boss: "zakum", difficulty: "Chaos", partySize: 1 }];
    plan = stepParty(plan, LOTUS, -1);
    expect(plan[0]!.partySize).toBe(1);
    plan = stepParty(stepParty(plan, LOTUS, 1), LOTUS, 1);
    expect(plan.map((p) => p.partySize)).toEqual([2, 1]);
    expect(stepParty(stepParty([{ boss: "zakum", difficulty: "Chaos", partySize: 5 }], ZAKUM, 1), ZAKUM, 1)[0]!.partySize).toBe(6);
    expect(stepParty([{ boss: "zakum", difficulty: "Chaos", partySize: 3 }], ZAKUM, -1)[0]!.partySize).toBe(2);
  });

  it("entryMeso is what one person gets for that difficulty and party", () => {
    expect(entryMeso({ boss: "lucid", difficulty: "Hard", partySize: 3 }, LUCID)).toBe(200 * M);
    expect(entryMeso({ boss: "lucid", difficulty: "Easy", partySize: 1 }, LUCID)).toBe(120 * M);
  });

  it("planSummary counts weekly bosses, those over the limit, the weekly meso that counts, and the monthly meso", () => {
    const plan = [
      { boss: "zakum", difficulty: "Chaos" as const, partySize: 1 }, // 60M
      { boss: "lucid", difficulty: "Hard" as const, partySize: 2 }, // 300M
      { boss: "lotus", difficulty: "Normal" as const, partySize: 1 }, // 180M
      { boss: "black_mage", difficulty: "Hard" as const, partySize: 6 }, // 750M monthly
    ];
    expect(planSummary(plan, BOSSES, 14)).toEqual({ weekly: 3, over: 0, planned: 540 * M, monthly: 750 * M });
    // a limit of 2: the cheapest (Zakum) doesn't count
    expect(planSummary(plan, BOSSES, 2)).toEqual({ weekly: 3, over: 1, planned: 480 * M, monthly: 750 * M });
    expect(planSummary([], BOSSES, 14)).toEqual({ weekly: 0, over: 0, planned: 0, monthly: 0 });
  });

  it("inGameOrder puts a plan in the bosses' order", () => {
    const plan = [
      { boss: "black_mage", difficulty: "Hard" as const, partySize: 1 },
      { boss: "lotus", difficulty: "Normal" as const, partySize: 1 },
      { boss: "zakum", difficulty: "Chaos" as const, partySize: 1 },
    ];
    expect(inGameOrder(plan, BOSSES).map((p) => p.boss)).toEqual(["zakum", "lotus", "black_mage"]);
    expect(plan[0]!.boss).toBe("black_mage"); // a new list; the old one is left alone
  });
});

describe("withTick", () => {
  it("ticks or unticks one boss of one character, weekly or monthly, and leaves everything else as it was", () => {
    const b = board([REMY, character(3, "Other", { weekly: [{ ...REMY.weekly[1]! }] })]);
    const ticked = withTick(b, 1, "lucid", true);
    expect(ticked.characters[0]!.weekly.map((r) => r.cleared)).toEqual([true, true]);
    expect(ticked.characters[0]!.monthly[0]!.cleared).toBe(false); // only that boss
    expect(ticked.characters[1]!.weekly[0]!.cleared).toBe(false); // the other character's Lucid
    expect(withTick(b, 1, "zakum", false).characters[0]!.weekly.map((r) => r.cleared)).toEqual([false, false]);
    expect(withTick(b, 1, "black_mage", true).characters[0]!.monthly[0]!.cleared).toBe(true);
    expect(b.characters[0]!.weekly[1]!.cleared).toBe(false); // a new board; the old one is left alone
    expect({ ...ticked, characters: [] }).toEqual({ ...b, characters: [] });
    expect(ticked.characters[0]).toMatchObject({ planned: REMY.planned, soFar: REMY.soFar, cleared: REMY.cleared });
  });
});

describe("how resets are shown", () => {
  const reset = new Date("2026-10-22T00:00:00Z");
  it("untilReset: days and hours, then hours and minutes, then minutes (at least 1)", () => {
    expect(untilReset(new Date("2026-10-20T19:00:00Z"), reset)).toBe("1d 5h");
    expect(untilReset(new Date("2026-10-15T00:00:00Z"), reset)).toBe("7d 0h");
    expect(untilReset(new Date("2026-10-21T20:30:00Z"), reset)).toBe("3h 30m");
    expect(untilReset(new Date("2026-10-21T23:00:00Z"), reset)).toBe("1h 0m");
    expect(untilReset(new Date("2026-10-21T23:47:00Z"), reset)).toBe("13m");
    expect(untilReset(new Date("2026-10-21T23:59:30Z"), reset)).toBe("1m"); // rounded up
    expect(untilReset(new Date("2026-10-21T23:58:59Z"), reset)).toBe("2m");
    expect(untilReset(new Date("2026-10-22T00:00:05Z"), reset)).toBe("1m"); // just past: never 0 or negative
  });

  it("resetLocal is the weekday and time in local time; resetDay the game's (UTC) date", () => {
    expect(resetLocal(reset)).toBe(UTC ? "Thu 12:00 AM" : "Wed 5:00 PM");
    expect(resetDay(new Date("2026-11-01T00:00:00Z"))).toBe("Nov 1"); // Oct 31 in California, but the game's day is Nov 1
  });

  it("partyText", () => {
    expect([partyText(1), partyText(2), partyText(6)]).toEqual(["solo", "party of 2", "party of 6"]);
  });
});

describe("the Bosses tab", () => {
  it("shows the week's totals, the countdown and each character's card", async () => {
    show();
    const remy = await card("Remy");
    const summary = screen.getByText("This week so far").parentElement!.parentElement!;
    expect(summary.textContent).toContain("60.0M");
    expect(summary.textContent).toContain("of 360M planned");
    expect(summary.textContent).toContain("1 / 2");
    expect(summary.textContent).toContain("within the limit");
    expect(summary.textContent).toContain("of 750M · resets Nov 1");
    expect(screen.getByText(/Weekly reset in/).textContent).toBe(`Weekly reset in 1d 5h · ${UTC ? "Thu 12:00 AM" : "Wed 5:00 PM"} your time`);
    expect(screen.getByText(/Prices: GMS Heroic/).textContent).toContain("v.270");
    // Remy: cleared Zakum, Lucid's banner (its picture), Black Mage under monthly
    expect(remy.getByText("1 / 2 cleared")).toBeTruthy();
    expect((remy.getByRole("checkbox", { name: "Zakum cleared" }) as HTMLInputElement).checked).toBe(true);
    expect((remy.getByRole("checkbox", { name: "Lucid cleared" }) as HTMLInputElement).checked).toBe(false);
    expect(remy.getByRole("img", { name: "Lucid" }).getAttribute("src")).toBe("/boss-art/lucid.png?v=1");
    expect(remy.queryByRole("img", { name: "Zakum" })).toBeNull(); // no picture: its name instead
    expect(remy.getByText("Zakum")).toBeTruthy();
    expect(remy.getByText("party of 2")).toBeTruthy();
    expect(remy.getByText("300M")).toBeTruthy();
    expect(remy.getByText(/Monthly · resets Nov 1/)).toBeTruthy();
    expect((remy.getByRole("checkbox", { name: "Black Mage cleared" }) as HTMLInputElement).checked).toBe(false);
    // Meow has no plan yet
    expect((await card("Meow")).getByText("No bosses planned yet.")).toBeTruthy();
  });

  it("ticking and unticking a boss saves it", async () => {
    const server = show();
    const remy = await card("Remy");
    await userEvent.click(remy.getByRole("checkbox", { name: "Lucid cleared" }));
    await userEvent.click(remy.getByRole("checkbox", { name: "Zakum cleared" }));
    await waitFor(() => expect(server.sent("PUT", "/bosses/1/clears/zakum")).toEqual([{ cleared: false }]));
    expect(server.sent("PUT", "/bosses/1/clears/lucid")).toEqual([{ cleared: true }]);
    // the board is loaded again, and nothing else
    await waitFor(() => expect(server.calls.filter((c) => c.method === "GET" && c.path.startsWith("/bosses")).length).toBeGreaterThanOrEqual(2));
    expect(server.calls.filter((c) => c.method === "GET" && ["/settings", "/theme-art"].includes(c.path))).toHaveLength(2);
  });

  it("a tick shows at once, and a quick untick after it is sent after it, in order", async () => {
    const answers: (() => void)[] = [];
    const server = show(board([REMY]), { "PUT /bosses/:id/clears/lucid": () => new Promise<undefined>((r) => answers.push(() => r(undefined))) });
    const box = () => screen.getByRole("checkbox", { name: "Lucid cleared" }) as HTMLInputElement;
    await card("Remy");
    await userEvent.click(box());
    expect(box().checked).toBe(true); // before the server has answered
    await userEvent.click(box());
    expect(box().checked).toBe(false);
    // only the first is on its way; the second waits for it
    expect(server.sent("PUT", "/bosses/1/clears/lucid")).toEqual([{ cleared: true }]);
    answers.shift()!();
    await waitFor(() => expect(server.sent("PUT", "/bosses/1/clears/lucid")).toEqual([{ cleared: true }, { cleared: false }]));
    answers.shift()!();
  });

  it("ticking doesn't interrupt anything else that's loading (here, the saved settings)", async () => {
    let release = () => {};
    show(board([REMY]), { "GET /settings": () => new Promise((r) => (release = () => r({ theme: "pochacco", worldId: 45 }))) });
    await userEvent.click((await card("Remy")).getByRole("checkbox", { name: "Lucid cleared" }));
    release();
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("pochacco"));
  });

  it("a failed tick says why", async () => {
    show(board([REMY]), { "PUT /bosses/:id/clears/lucid": new Response(JSON.stringify({ error: "Lucid isn't in Remy's plan. Add it to the plan first." }), { status: 409 }) });
    await userEvent.click((await card("Remy")).getByRole("checkbox", { name: "Lucid cleared" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Lucid isn't in Remy's plan. Add it to the plan first.");
  });

  it("crystals beyond a limit say they don't count, with a warning", async () => {
    const over = character(3, "Many", {
      weekly: [
        { boss: "zakum", difficulty: "Chaos", partySize: 1, meso: 60 * M, cleared: false, over: "character" },
        { boss: "lucid", difficulty: "Easy", partySize: 1, meso: 120 * M, cleared: false, over: "world" },
        { boss: "lotus", difficulty: "Normal", partySize: 1, meso: 180 * M, cleared: false, over: null },
      ],
      planned: 180 * M,
    });
    show(board([over], { totals: { planned: 180 * M, soFar: 0, cleared: 0, bosses: 3, crystals: 182, monthlyPlanned: 0, monthlySoFar: 0 } }));
    const many = await card("Many");
    expect(many.getAllByText("not counted")).toHaveLength(2);
    expect(many.getByText("180M")).toBeTruthy();
    expect(many.getByText(/1 over the 14-crystal limit: the least valuable one doesn't count/)).toBeTruthy();
    expect(many.getByText(/1 over the world's 180-crystal limit: it doesn't count/)).toBeTruthy();
    expect(screen.getByText("2 over: the least valuable don't count")).toBeTruthy();
    expect(many.queryByText(/Monthly/)).toBeNull();
  });

  it("with no characters on the world, says to add them on Home", async () => {
    show(board([]));
    expect(await screen.findByText("No characters on Kronos yet. Add them on Home first.")).toBeTruthy();
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("a board that fails to load says why", async () => {
    show(new Response(JSON.stringify({ error: "Database is busy" }), { status: 500 }));
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't load the bosses: Database is busy");
  });

  it("switching the world loads that world's bosses", async () => {
    const server = show(board([REMY]), { "PUT /settings": { theme: "ren", worldId: 70 } });
    await card("Remy");
    await userEvent.click(screen.getByRole("button", { name: "Hyperion" }));
    await waitFor(() => expect(server.calls.some((c) => c.method === "GET" && c.path === "/bosses?world=70")).toBe(true));
    expect(server.sent("PUT", "/settings")).toEqual([{ worldId: 70 }]);
  });

  it("after each check of Nexon, the board is loaded again (levels and avatars)", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 20, 11, 59)));
    let finishedAt: string | null = "2026-10-20T08:00:30.000Z";
    const run = () => ({ last: { startedAt: "2026-10-20T08:00:00.000Z", finishedAt, checked: 1, updated: 1, missing: 0, failed: 0, problem: null } });
    const server = show(board([REMY]), { "GET /refresh": run });
    const loads = () => server.calls.filter((c) => c.method === "GET" && c.path.startsWith("/bosses")).length;
    await vi.waitFor(() => expect(loads()).toBe(1));
    finishedAt = "2026-10-20T12:00:30.000Z";
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.waitFor(() => expect(loads()).toBe(2));
  });

  it("past the weekly reset, the board is loaded again", async () => {
    vi.setSystemTime(new Date("2026-10-21T23:59:59Z"));
    const server = show();
    await card("Remy");
    const loads = () => server.calls.filter((c) => c.method === "GET" && c.path.startsWith("/bosses")).length;
    // not before it: a second passes (the clock ticks) without loading again
    await new Promise((r) => setTimeout(r, 1200));
    expect(loads()).toBe(1);
    vi.setSystemTime(new Date("2026-10-22T00:00:01Z"));
    await waitFor(() => expect(loads()).toBe(2), { timeout: 3000 });
    // the answer still has the old week (this computer's clock ahead of the server's): not asked again every second
    await new Promise((r) => setTimeout(r, 2200));
    expect(loads()).toBe(2);
  });

  it("shows a hint to scroll only with more characters than fit", async () => {
    show(board([REMY, MEOW]));
    await card("Remy");
    expect(screen.queryByText(/scroll sideways/)).toBeNull();
  });
});

describe("the planning menu", () => {
  async function open(name = "Remy", b = board([REMY, MEOW])) {
    const server = show(b);
    await userEvent.click((await card(name)).getByRole("button", { name: "Plan bosses…" }));
    const dialog = within(screen.getByRole("dialog", { name: `Plan bosses · ${name}` }));
    return { server, dialog, boss: (n: string) => within(dialog.getByRole("group", { name: n })) };
  }

  it("lists every boss once, with the plan's choices, and saves the plan in game order", async () => {
    const { server, dialog, boss } = await open();
    expect(dialog.getAllByRole("checkbox").map((c) => [c.getAttribute("aria-label"), (c as HTMLInputElement).checked])).toEqual([
      ["Plan Zakum", true],
      ["Plan Lucid", true],
      ["Plan Lotus", false],
      ["Plan Black Mage", true],
    ]);
    expect(boss("Lucid").getByRole("button", { name: "Hard" }).getAttribute("aria-pressed")).toBe("true");
    expect(boss("Lucid").getByText("party of 2")).toBeTruthy();
    expect(boss("Lucid").getByText("300M")).toBeTruthy();
    expect(dialog.getByText(/2 weekly bosses/)).toBeTruthy();
    // Lotus isn't planned: its controls are off until it's ticked
    expect(boss("Lotus").getByRole("button", { name: "Normal" }).closest("fieldset")!.disabled).toBe(true);
    await userEvent.click(dialog.getByRole("checkbox", { name: "Plan Lotus" }));
    expect(boss("Lotus").getByRole("button", { name: "Normal" }).closest("fieldset")!.disabled).toBe(false);
    await userEvent.click(boss("Lotus").getByRole("button", { name: "Extreme" }));
    await userEvent.click(boss("Lotus").getByRole("button", { name: "More people" }));
    expect(boss("Lotus").getByText("party of 2")).toBeTruthy();
    expect(boss("Lotus").getByText("700M")).toBeTruthy();
    expect((boss("Lotus").getByRole("button", { name: "More people" }) as HTMLButtonElement).disabled).toBe(true); // Extreme Lotus: 2 at most
    expect(boss("Lotus").getByText(/party max 2/)).toBeTruthy();
    // Zakum out
    await userEvent.click(dialog.getByRole("checkbox", { name: "Plan Zakum" }));
    expect(dialog.getByText(/Planned:/).textContent).toBe("Planned: 1.00B a week · 750M a month");
    await userEvent.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // the board is loaded again, and nothing else
    await waitFor(() => expect(server.calls.filter((c) => c.method === "GET" && c.path.startsWith("/bosses"))).toHaveLength(2));
    expect(server.calls.filter((c) => c.method === "GET" && c.path === "/settings")).toHaveLength(1);
    expect(server.sent("PUT", "/bosses/1/plan")).toEqual([
      {
        plan: [
          { boss: "lucid", difficulty: "Hard", partySize: 2 },
          { boss: "lotus", difficulty: "Extreme", partySize: 2 },
          { boss: "black_mage", difficulty: "Hard", partySize: 6 },
        ],
      },
    ]);
  });

  it("party size goes down to solo and no further", async () => {
    const { dialog, boss } = await open();
    const fewer = boss("Lucid").getByRole("button", { name: "Fewer people" }) as HTMLButtonElement;
    await userEvent.click(fewer);
    expect(boss("Lucid").getByText("solo")).toBeTruthy();
    expect(fewer.disabled).toBe(true);
    expect(dialog.getByText(/Planned:/).textContent).toContain("660M a week"); // 60M + 600M
  });

  it("warns when the plan has more weekly bosses than can be sold", async () => {
    const { dialog } = await open("Meow", board([REMY, MEOW], { limits: { perCharacter: 2, perWorld: 180 } }));
    expect(dialog.getByText(/0 weekly bosses/)).toBeTruthy();
    expect(dialog.getByText(/up to 2 count/)).toBeTruthy();
    for (const name of ["Zakum", "Lucid", "Lotus"]) await userEvent.click(dialog.getByRole("checkbox", { name: `Plan ${name}` }));
    expect(dialog.getByText(/3 weekly bosses/).textContent).toContain("1 over the 2-crystal limit (the least valuable won't count)");
    // Easy Lucid 120M + Normal Lotus 180M count; Zakum (60M) doesn't
    expect(dialog.getByText(/Planned:/).textContent).toBe("Planned: 300M a week");
  });

  it("Cancel, Escape and clicking outside close it without saving", async () => {
    const { server, dialog } = await open();
    await userEvent.click(dialog.getByRole("checkbox", { name: "Plan Lotus" }));
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click((await card("Remy")).getByRole("button", { name: "Plan bosses…" }));
    // the cancelled change is gone
    expect((screen.getByRole("checkbox", { name: "Plan Lotus" }) as HTMLInputElement).checked).toBe(false);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click((await card("Remy")).getByRole("button", { name: "Plan bosses…" }));
    fireEvent.click(screen.getByRole("dialog").parentElement!);
    expect(screen.queryByRole("dialog")).toBeNull();
    // clicking inside doesn't close it
    await userEvent.click((await card("Remy")).getByRole("button", { name: "Plan bosses…" }));
    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(server.sent("PUT", "/bosses/1/plan")).toEqual([]);
  });

  it("opens with the focus in the menu", async () => {
    await open();
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("a failed save says why and keeps the menu open", async () => {
    const server = fakeServer({
      ...BASE_ROUTES,
      "GET /bosses": board([REMY]),
      "PUT /bosses/:id/plan": new Response(JSON.stringify({ error: "Extreme Lotus allows a party of up to 2" }), { status: 400 }),
    });
    renderWithApp(<App />, "/bosses");
    await userEvent.click((await card("Remy")).getByRole("button", { name: "Plan bosses…" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const dialog = within(screen.getByRole("dialog"));
    expect((await dialog.findByRole("alert")).textContent).toBe("Extreme Lotus allows a party of up to 2");
    expect(server.sent("PUT", "/bosses/1/plan")).toHaveLength(1);
    // closing and opening again starts without the old error
    await userEvent.click(dialog.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alert")).toBeNull();
    await userEvent.click((await card("Remy")).getByRole("button", { name: "Plan bosses…" }));
    expect(within(screen.getByRole("dialog")).queryByRole("alert")).toBeNull();
  });

  it("shows the boss's banner, bigger, when its picture exists", async () => {
    const { boss } = await open();
    const banner = boss("Lucid").getByRole("img", { name: "Lucid" });
    expect([banner.getAttribute("width"), banner.getAttribute("height")]).toEqual(["270", "60"]);
  });
});
