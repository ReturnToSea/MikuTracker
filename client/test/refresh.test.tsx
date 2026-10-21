import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { fmtWhen } from "../src/lib/format";
import { BASE_ROUTES, fakeServer, renderWithApp } from "./server";

// Noon in California on Tue 20 Oct 2026 = 19:00 UTC.
const NOW = new Date(Date.UTC(2026, 9, 20, 19, 0));
const local = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

describe("fmtWhen: by the game's (UTC) day, with local time", () => {
  it("today, yesterday, or the date", () => {
    const today = new Date(Date.UTC(2026, 9, 20, 8, 5));
    expect(fmtWhen(today, NOW)).toBe(`today at 08:05 UTC (${local(today)} your time)`);
    const yesterday = new Date(Date.UTC(2026, 9, 19, 23, 30));
    expect(fmtWhen(yesterday, NOW)).toBe(`yesterday at 23:30 UTC (${local(yesterday)} your time)`);
    const older = new Date(Date.UTC(2026, 9, 17, 4, 0));
    expect(fmtWhen(older, NOW)).toBe(`Oct 17 at 04:00 UTC (${local(older)} your time)`);
  });

  it("the day changes at 00:00 UTC, not local midnight", () => {
    const now = new Date(Date.UTC(2026, 9, 21, 1, 0)); // the 21st in UTC, still the 20th in California
    expect(fmtWhen(new Date(Date.UTC(2026, 9, 21, 0, 10)), now)).toMatch(/^today at 00:10 UTC/);
    expect(fmtWhen(new Date(Date.UTC(2026, 9, 20, 23, 50)), now)).toMatch(/^yesterday at 23:50 UTC/);
  });

  it("local time is in the browser's time zone", () => {
    expect(fmtWhen(new Date(Date.UTC(2026, 9, 20, 8, 5)), NOW)).toContain(process.env.TZ === "UTC" ? "(8:05 AM your time)" : "(1:05 AM your time)");
  });
});

describe("the last check, on Home", () => {
  function at(now: Date) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
  }

  it("says when Nexon was last checked", async () => {
    at(NOW);
    fakeServer({ ...BASE_ROUTES, "GET /refresh": { last: { startedAt: "2026-10-20T16:05:00Z", finishedAt: "2026-10-20T16:05:09Z", checked: 3, updated: 3, missing: 0, failed: 0, problem: null } } });
    renderWithApp(<App />);
    const note = await screen.findByText(/^Checked Nexon/);
    expect(note.textContent).toBe(`Checked Nexon today at 16:05 UTC (${local(new Date("2026-10-20T16:05:00Z"))} your time)`);
    vi.useRealTimers();
  });

  it("says what went wrong", async () => {
    at(NOW);
    fakeServer({ ...BASE_ROUTES, "GET /refresh": { last: { startedAt: "2026-10-20T16:05:00Z", finishedAt: "2026-10-20T16:05:40Z", checked: 1, updated: 0, missing: 0, failed: 1, problem: "Nexon's rankings can't be reached right now. Try again later." } } });
    renderWithApp(<App />);
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/^Last check \(today at 16:05 UTC .*\) had a problem: Nexon's rankings can't be reached right now\. Try again later\.$/));
    vi.useRealTimers();
  });

  it("before any check, says the always-on app does it", async () => {
    fakeServer({ ...BASE_ROUTES, "GET /refresh": { last: null } });
    renderWithApp(<App />);
    expect(await screen.findByText("Not checked yet: the always-on app checks Nexon every 4 hours.")).toBeTruthy();
  });

  it("is asked for again every minute", async () => {
    const { useRefreshStatus } = await import("../src/api/hooks");
    expect(useRefreshStatus).toBeTypeOf("function");
    let asked = 0;
    vi.useFakeTimers({ toFake: ["setInterval", "setTimeout", "clearInterval", "clearTimeout", "Date"] });
    fakeServer({ ...BASE_ROUTES, "GET /refresh": () => (asked++, { last: null }) });
    renderWithApp(<App />);
    await vi.advanceTimersByTimeAsync(100);
    expect(asked).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(asked).toBe(2);
    vi.useRealTimers();
  });
});
