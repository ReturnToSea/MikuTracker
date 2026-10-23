import { describe, expect, it, vi } from "vitest";
import { getConfig } from "../config";
import { imageAddress, nexon, realNexonDeps } from "./index";

// The real client's parts, checked without reaching the network.
describe("the real Nexon client", () => {
  it("is created once", () => {
    expect(nexon()).toBe(nexon());
    expect(nexon().lookUp).toBeTypeOf("function");
  });

  it("asks the configured address", () => {
    expect(realNexonDeps().baseUrl).toBe(getConfig().nexonRankingsUrl);
  });

  it("avatars go to the fake image server when one is set; nothing else does", () => {
    const images = "http://127.0.0.1:4755/images";
    expect(imageAddress("https://msavatar1.nexon.net/Character/ABC.png?x=1", images)).toBe("http://127.0.0.1:4755/images/msavatar1.nexon.net/Character/ABC.png?x=1");
    expect(imageAddress("https://msavatar1.nexon.net/Character/ABC.png", null)).toBe("https://msavatar1.nexon.net/Character/ABC.png");
    expect(imageAddress("https://www.nexon.com/api/maplestory/no-auth/ranking/v2/na?type=world", images)).toBe("https://www.nexon.com/api/maplestory/no-auth/ranking/v2/na?type=world");
    expect(imageAddress("http://evil.example/x.nexon.net/a.png", images)).toBe("http://evil.example/x.nexon.net/a.png");
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
