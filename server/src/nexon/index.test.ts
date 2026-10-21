import { describe, expect, it, vi } from "vitest";
import { getConfig } from "../config";
import { nexon, realNexonDeps } from "./index";

// The real client's parts, checked without reaching the network.
describe("the real Nexon client", () => {
  it("is created once", () => {
    expect(nexon()).toBe(nexon());
    expect(nexon().lookUp).toBeTypeOf("function");
  });

  it("asks the configured address", () => {
    expect(realNexonDeps().baseUrl).toBe(getConfig().nexonRankingsUrl);
  });

  it("uses the real network (which tests wall off)", () => {
    expect(() => realNexonDeps().fetch("https://www.nexon.com", {})).toThrow("Tests must not reach the network");
  });

  it("really waits, and reads the real clock", async () => {
    const started = performance.now();
    await realNexonDeps().sleep(20);
    expect(performance.now() - started).toBeGreaterThanOrEqual(15);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 21)));
    expect(realNexonDeps().now()).toBe(Date.UTC(2026, 9, 21));
    vi.useRealTimers();
  });
});
