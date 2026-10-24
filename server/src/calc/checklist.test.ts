import { describe, expect, it } from "vitest";
import { taskPeriod } from "./checklist";

// Every moment in UTC; run in California time and UTC. Fri 23 Oct 2026, 12:00 UTC.
const at = (iso: string) => new Date(iso);
const FRI = at("2026-10-23T12:00:00Z");

describe("taskPeriod", () => {
  it("daily: the UTC day, ending at the next 00:00 UTC", () => {
    expect(taskPeriod({ reset: "daily", weekday: null }, FRI)).toEqual({ period: "2026-10-23", resetsAt: at("2026-10-24T00:00:00Z") });
    expect(taskPeriod({ reset: "daily", weekday: null }, at("2026-10-23T23:59:59.999Z")).period).toBe("2026-10-23");
  });

  it("weekly: the week from its reset day, prefixed, ending a week after it started", () => {
    expect(taskPeriod({ reset: "weekly", weekday: 4 }, FRI)).toEqual({ period: "week-2026-10-22", resetsAt: at("2026-10-29T00:00:00Z") });
    expect(taskPeriod({ reset: "weekly", weekday: 1 }, FRI)).toEqual({ period: "week-2026-10-19", resetsAt: at("2026-10-26T00:00:00Z") });
    // a week starting today never shares a name with today's daily period
    expect(taskPeriod({ reset: "weekly", weekday: 5 }, FRI).period).toBe("week-2026-10-23");
  });

  it("one-off: one period forever", () => {
    expect(taskPeriod({ reset: "none", weekday: null }, FRI)).toEqual({ period: "once", resetsAt: null });
    expect(taskPeriod({ reset: "none", weekday: null }, at("2030-01-01T00:00:00Z")).period).toBe("once");
  });
});
