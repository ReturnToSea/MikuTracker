import { describe, expect, it } from "vitest";
import { entry, MIKUBEAM } from "../../test/fixtures/nexon";
import { findEntry, isNexonImage, rankingsReply, rankingsUrl } from "./rankings";

const BASE = "https://www.nexon.com/api/maplestory/no-auth/ranking/v2/na";

describe("rankingsUrl", () => {
  it("asks each board the way Nexon's own rankings page does", () => {
    expect(rankingsUrl(BASE, { kind: "world", worldId: 45 }, "MikuBeam")).toBe(`${BASE}?type=world&id=45&reboot_index=0&page_index=1&character_name=MikuBeam`);
    expect(rankingsUrl(BASE, { kind: "overall" }, "MikuBeam")).toBe(`${BASE}?type=overall&id=legendary&reboot_index=0&page_index=1&character_name=MikuBeam`);
    expect(rankingsUrl(BASE, { kind: "legion", worldId: 70 }, "MikuBeam")).toBe(`${BASE}?type=legion&id=70&page_index=1&character_name=MikuBeam`);
  });

  it("puts the name in the address safely", () => {
    expect(rankingsUrl(BASE, { kind: "overall" }, "a&b=c d")).toContain("character_name=a%26b%3Dc+d");
  });
});

describe("isNexonImage", () => {
  it("accepts only https addresses on Nexon's own servers", () => {
    expect(isNexonImage("https://msavatar1.nexon.net/Character/ABC.png")).toBe(true);
    expect(isNexonImage("https://nexon.net/x.png")).toBe(true);
    for (const url of ["http://msavatar1.nexon.net/x.png", "https://evil.com/x.png", "https://nexon.net.evil.com/x.png", "https://evilnexon.net/x.png", "not a url", ""]) {
      expect(isNexonImage(url)).toBe(false);
    }
  });
});

describe("rankingsReply", () => {
  const good = { totalCount: 1, pageIndex: 1, ranks: [entry(MIKUBEAM, 6390)] };

  it("accepts Nexon's reply, keeping only the fields we use", () => {
    const parsed = rankingsReply.parse(good);
    expect(parsed.ranks[0]).toEqual({
      characterName: "MikuBeam",
      level: 285,
      exp: 86_500_000_000_000,
      rank: 6390,
      worldID: 45,
      jobName: "Kanna",
      characterImgURL: "https://msavatar1.nexon.net/Character/MIKUBEAM.png",
      legionLevel: 5804,
      raidPower: 297_290_139,
    });
  });

  it.each([
    ["no ranks list", { totalCount: 0 }],
    ["level 301", { ...good, ranks: [{ ...entry(MIKUBEAM, 1), level: 301 }] }],
    ["level 0", { ...good, ranks: [{ ...entry(MIKUBEAM, 1), level: 0 }] }],
    ["EXP as text", { ...good, ranks: [{ ...entry(MIKUBEAM, 1), exp: "86500000000000" }] }],
    ["EXP beyond exact numbers", { ...good, ranks: [{ ...entry(MIKUBEAM, 1), exp: 2 ** 53 }] }],
    ["negative EXP", { ...good, ranks: [{ ...entry(MIKUBEAM, 1), exp: -1 }] }],
    ["rank 0", { ...good, ranks: [{ ...entry(MIKUBEAM, 1), rank: 0 }] }],
    ["an avatar elsewhere", { ...good, ranks: [{ ...entry(MIKUBEAM, 1), characterImgURL: "https://evil.com/a.png" }] }],
    ["no name", { ...good, ranks: [{ ...entry(MIKUBEAM, 1), characterName: "" }] }],
    ["no job", { ...good, ranks: [{ ...entry(MIKUBEAM, 1), jobName: "" }] }],
    ["negative Legion", { ...good, ranks: [{ ...entry(MIKUBEAM, 1), legionLevel: -1 }] }],
  ])("refuses a reply with %s", (_what, body) => {
    expect(rankingsReply.safeParse(body).success).toBe(false);
  });
});

describe("findEntry", () => {
  const ranks = [entry({ ...MIKUBEAM, characterName: "MikuBeam2" }, 1), entry(MIKUBEAM, 2)];

  it("finds exactly that name, ignoring capitals", () => {
    expect(findEntry({ totalCount: 2, ranks: rankingsReply.parse({ totalCount: 2, ranks }).ranks }, "mikubeam")?.rank).toBe(2);
  });

  it("finds nothing for a name that's only part of another", () => {
    expect(findEntry(rankingsReply.parse({ totalCount: 2, ranks }), "Miku")).toBeUndefined();
  });
});
