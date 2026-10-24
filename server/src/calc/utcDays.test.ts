import { describe, expect, it } from "vitest";
import { addUtcDays, nextUtcMidnight, nextWeek, startOfUtcDay, utcDay, weekStarting } from "./utcDays";

// These run in California time and in UTC (npm test runs both); every moment here is written in
// UTC, so the answers must be the same in both.
const at = (iso: string) => new Date(iso);

describe("utcDay", () => {
  it("changes at 00:00 UTC, not at local midnight", () => {
    expect(utcDay(at("2026-10-20T23:59:59.999Z"))).toBe("2026-10-20");
    expect(utcDay(at("2026-10-21T00:00:00.000Z"))).toBe("2026-10-21");
    // 5 PM in California on the 20th is already the 21st in UTC
    expect(utcDay(new Date(Date.UTC(2026, 9, 21, 0, 0)))).toBe("2026-10-21");
  });
});

describe("startOfUtcDay", () => {
  it("is 00:00 UTC that day", () => {
    expect(startOfUtcDay("2026-10-20").toISOString()).toBe("2026-10-20T00:00:00.000Z");
  });

  it.each(["2026-02-30", "2026-13-01", "20-10-2026", "2026-1-01", ""])("refuses %j", (day) => {
    expect(() => startOfUtcDay(day)).toThrow(`Not a calendar day: "${day}"`);
  });
});

describe("nextUtcMidnight", () => {
  it("is the coming 00:00 UTC", () => {
    expect(nextUtcMidnight(at("2026-10-20T19:00:00Z")).toISOString()).toBe("2026-10-21T00:00:00.000Z");
    expect(nextUtcMidnight(at("2026-10-20T23:59:59.999Z")).toISOString()).toBe("2026-10-21T00:00:00.000Z");
  });

  it("exactly at midnight, it's the following one", () => {
    expect(nextUtcMidnight(at("2026-10-21T00:00:00Z")).toISOString()).toBe("2026-10-22T00:00:00.000Z");
  });

  it("crosses months and years, and isn't moved by daylight saving", () => {
    expect(nextUtcMidnight(at("2026-12-31T23:30:00Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(nextUtcMidnight(at("2027-02-28T12:00:00Z")).toISOString()).toBe("2027-03-01T00:00:00.000Z");
    expect(nextUtcMidnight(at("2026-11-01T09:00:00Z")).toISOString()).toBe("2026-11-02T00:00:00.000Z"); // California's clocks go back that day
  });
});

describe("addUtcDays", () => {
  it("moves by whole days, across months, years and leap days", () => {
    expect(addUtcDays("2026-10-20", 1)).toBe("2026-10-21");
    expect(addUtcDays("2026-10-20", 0)).toBe("2026-10-20");
    expect(addUtcDays("2026-10-01", -1)).toBe("2026-09-30");
    expect(addUtcDays("2026-12-25", 14)).toBe("2027-01-08");
    expect(addUtcDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("weekStarting", () => {
  it("names a week by its first day, for any start day (Tue 20 Oct 2026 is a Tuesday)", () => {
    const tue = at("2026-10-20T19:00:00Z");
    expect(weekStarting(tue, 4)).toBe("2026-10-15"); // Thursday weeks
    expect(weekStarting(tue, 1)).toBe("2026-10-19"); // Monday weeks
    expect(weekStarting(tue, 2)).toBe("2026-10-20"); // a Tuesday week starts today
    expect(weekStarting(tue, 3)).toBe("2026-10-14"); // Wednesday weeks: last Wednesday
    expect(weekStarting(tue, 0)).toBe("2026-10-18");
    expect(weekStarting(tue, 6)).toBe("2026-10-17");
  });

  it("changes at 00:00 UTC on the start day, not at local midnight", () => {
    expect(weekStarting(at("2026-10-18T23:59:59.999Z"), 1)).toBe("2026-10-12");
    expect(weekStarting(at("2026-10-19T00:00:00.000Z"), 1)).toBe("2026-10-19");
    expect(weekStarting(at("2026-10-01T05:00:00Z"), 4)).toBe("2026-10-01");
    expect(weekStarting(at("2027-01-01T05:00:00Z"), 4)).toBe("2026-12-31");
  });
});

describe("nextWeek", () => {
  it("is 00:00 UTC seven days after the week's first day", () => {
    expect(nextWeek("2026-10-15").toISOString()).toBe("2026-10-22T00:00:00.000Z");
    expect(nextWeek("2026-12-28").toISOString()).toBe("2027-01-04T00:00:00.000Z");
  });
});
