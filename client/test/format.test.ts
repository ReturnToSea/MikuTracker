import { describe, expect, it } from "vitest";
import { fmtChange, fmtDuration, fmtExp, fmtFutureDate, fmtInt } from "../src/lib/format";

describe("fmtExp: 3 significant digits", () => {
  it.each([
    [0, "0"],
    [15, "15"],
    [999, "999"],
    [1_000, "1.00K"],
    [5_123_456_789, "5.12B"],
    [20_660_000_000, "20.7B"],
    [137_400_000_000, "137B"],
    [2_207_026_470, "2.21B"],
    [99_512_176_519_276, "99.5T"],
    [20_700_000_000_000, "20.7T"],
    [8_509_498_537_428_819, "8.51Q"],
  ])("%d → %s", (n, text) => {
    expect(fmtExp(n)).toBe(text);
  });

  it("a value that rounds up to 1,000 of a unit moves to the next unit", () => {
    expect(fmtExp(999_600_000_000)).toBe("1.00T");
    expect(fmtExp(999_499_999_999)).toBe("999B");
    expect(fmtExp(999_950)).toBe("1.00M");
  });
});

describe("fmtInt and fmtChange", () => {
  it("separates thousands", () => {
    expect(fmtInt(8_509_498_537_428_819)).toBe("8,509,498,537,428,819");
    expect(fmtInt(15)).toBe("15");
  });

  it("shows the change in percent with one decimal and a sign", () => {
    expect(fmtChange(100, 112)).toBe("+12.0%");
    expect(fmtChange(571_115_568, 2_207_026_470)).toBe("+286.4%");
    expect(fmtChange(100, 100)).toBe("+0.0%");
    expect(fmtChange(100, 92.3)).toBe("-7.7%");
  });
});

describe("fmtDuration", () => {
  it.each([
    [0.001, "≈ 1 hour"],
    [1 / 24, "≈ 1 hour"],
    [0.25, "≈ 6 hours"],
    [0.999, "≈ 24 hours"],
    [1, "≈ 1.0 days"],
    [4.27, "≈ 4.3 days"],
    [59.9, "≈ 59.9 days"],
    [60, "≈ 2.0 months"],
    [173, "≈ 5.7 months"],
    [729, "≈ 23.9 months"],
    [730, "≈ 2.0 years"],
  ])("%d days → %s", (days, text) => {
    expect(fmtDuration(days)).toBe(text);
  });
});

describe("fmtFutureDate", () => {
  // Noon in California on Tue 20 Oct 2026 (19:00 UTC). Whole days later it's still midday in
  // both time zones the tests run in, so the date is the same in both.
  const now = new Date(Date.UTC(2026, 9, 20, 19, 0));

  it("shows the weekday and date, without the year when it's this year", () => {
    expect(fmtFutureDate(5, now)).toBe("Sun, Oct 25");
    expect(fmtFutureDate(0, now)).toBe("Tue, Oct 20");
  });

  it("adds the year when it isn't this year", () => {
    expect(fmtFutureDate(173, now)).toBe("Sun, Apr 11, 2027");
  });

  it("uses the local date: 6 hours later is still the 20th in California but the 21st in UTC", () => {
    expect(fmtFutureDate(0.25, now)).toBe(process.env.TZ === "UTC" ? "Wed, Oct 21" : "Tue, Oct 20");
  });
});
