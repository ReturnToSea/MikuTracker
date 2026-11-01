import { EPIC_DUNGEONS, HEXA_DEFAULTS, HEXA_STATS, type HexaInput } from "@miku/shared";
import { describe, expect, it } from "vitest";
import { approx, dateAfter, doneShare, dungeonLabels, formatCount, formatDays, HEXA_GROUPS, levelsText, lineMax, nodeTag, perWeekOf, rankOf, readyText, sameLines, shortName, STAT_LABELS, statChoices, stepLabel, unlockedOf, wantedOf, withAllDesired, withLevel, withStatLine, withStatPick, withStatUnlocked } from "../src/lib/hexa";

const input = () => structuredClone(HEXA_DEFAULTS);

describe("the HEXA page's display rules", () => {
  it("formatCount: whole and grouped", () => {
    expect([0, 12345, 323.1, 323.5, 1e6].map(formatCount)).toEqual(["0", "12,345", "323", "324", "1,000,000"]);
  });

  it("formatDays: now, under a day, whole days rounded up, never", () => {
    expect([0, -3, 0.4, 1, 1.2, 2, 1283.4, null].map(formatDays)).toEqual(["now", "now", "under a day", "1 day", "2 days", "2 days", "1,284 days", "never: nothing coming in"]);
  });

  it("dateAfter: the day it's ready, in local time; never: none", () => {
    // midday, so the day is the same in every time zone the tests run in
    const now = new Date("2026-10-29T12:00:00Z");
    expect(dateAfter(0, now)).toBe("Oct 29, 2026");
    expect(dateAfter(2.5, now)).toBe("Nov 1, 2026");
    expect(dateAfter(null, now)).toBeNull();
  });

  it("doneShare: invested of invested + left, by fragments; nothing at all: done", () => {
    expect(doneShare({ invested: { erda: 1, frags: 3000 }, left: { erda: 1, frags: 1000 } })).toBe(0.75);
    expect(doneShare({ invested: { erda: 0, frags: 0 }, left: { erda: 0, frags: 0 } })).toBe(1);
    expect(doneShare({ invested: { erda: 0, frags: 0 }, left: { erda: 5, frags: 100 } })).toBe(0);
  });

  it("levelsText: a node's levels, a HEXA Stat node's ranks", () => {
    expect([levelsText({ node: "origin", from: 4, to: 9 }), levelsText({ node: "stat2", from: 2, to: 20 })]).toEqual(["Lv. 4 → 9", "rank 2 → 20"]);
  });

  it("withLevel: a level now stays within the node's (Origin from 1); a level wanted from 0; whole levels", () => {
    expect(withLevel(input(), "current", "origin", 0, 1, 30).current.origin).toBe(1);
    expect(withLevel(input(), "current", "ascent", 45, 0, 30).current.ascent).toBe(30);
    expect(withLevel(input(), "current", "ascent", 7.6, 0, 30).current.ascent).toBe(8);
    expect(withLevel(input(), "desired", "origin", 0, 1, 30).desired.origin).toBe(0);
    expect(withLevel(input(), "desired", "hecate", -4, 0, 30).desired.hecate).toBe(0);
    // only that one changes
    const changed = withLevel(input(), "current", "mastery3", 12, 0, 30);
    expect(changed).toEqual({ ...input(), current: { ...input().current, mastery3: 12 } });
  });

  it("withAllDesired: every node wanted at the max, or at its level now", () => {
    const now = { ...input(), current: { ...input().current, ascent: 7 } };
    expect(withAllDesired(now, "current").desired).toEqual(now.current);
    expect(Object.values(withAllDesired(now, "max").desired)).toEqual(Array(13).fill(30));
  });

  const lines = (input: HexaInput, node: number) => input.stats[node]!.lines;
  const withNode = (node: HexaInput["stats"][number], at = 0): HexaInput => ({ ...input(), stats: input().stats.map((s, i) => (i === at ? node : s)) as HexaInput["stats"] });
  const L = (stat: (typeof HEXA_STATS)[number] | null, level: number) => ({ stat, level });

  it("withStatLine: 0–10, and a level that would take the three past 20 is cut to fit; its stat and the other nodes stay", () => {
    const one = withStatLine(input(), 1, 0, 4);
    expect(one.stats.map((s) => s.lines.map((l) => l.level))).toEqual([
      [0, 0, 0],
      [4, 0, 0],
      [0, 0, 0],
    ]);
    expect(lines(withStatLine(input(), 0, 1, 14), 0)[1]!.level).toBe(10);
    expect(lines(withStatLine(input(), 0, 2, -2), 0)[2]!.level).toBe(0);
    // 8 and 8 already: the third can only be 4
    const full = withNode({ lines: [L("att", 8), L("ied", 8), L("dmg", 0)], unlocked: true });
    expect(lines(withStatLine(full, 0, 2, 9), 0)).toEqual([L("att", 8), L("ied", 8), L("dmg", 4)]);
    expect(lines(withStatLine(full, 0, 0, 9.4), 0)[0]).toEqual(L("att", 9));
  });

  it("withStatPick: the line's stat; another line of the node with it loses it; none clears only that line", () => {
    const n = withNode({ lines: [L("att", 3), L("ied", 2), L(null, 1)], unlocked: true });
    expect(lines(withStatPick(n, 0, 2, "dmg"), 0)).toEqual([L("att", 3), L("ied", 2), L("dmg", 1)]);
    // ATT picked for the third line: the main line loses it, keeping its level
    expect(lines(withStatPick(n, 0, 2, "att"), 0)).toEqual([L(null, 3), L("ied", 2), L("att", 1)]);
    expect(lines(withStatPick(n, 0, 1, null), 0)).toEqual([L("att", 3), L(null, 2), L(null, 1)]);
    // other nodes untouched
    expect(withStatPick(n, 0, 2, "att").stats.slice(1)).toEqual(input().stats.slice(1));
  });

  it("statChoices: any stat, but not another node's main line's for a main line", () => {
    const n = { ...input(), stats: [{ lines: [L("att", 0), L(null, 0), L(null, 0)], unlocked: true }, { lines: [L("critDmg", 0), L(null, 0), L(null, 0)], unlocked: true }, input().stats[2]] } as HexaInput;
    expect(statChoices(n, 2, 0)).toEqual(["mainStat", "bossDmg", "ied", "dmg"]);
    // its own main line's stat stays offered
    expect(statChoices(n, 0, 0)).toEqual(["mainStat", "att", "bossDmg", "ied", "dmg"]);
    expect(statChoices(n, 2, 1)).toEqual([...HEXA_STATS]);
    expect(HEXA_STATS.map((st) => STAT_LABELS[st])).toEqual(["Main stat", "ATT", "Boss DMG", "IED", "Damage", "Crit DMG"]);
  });

  it("the groups in the owner's order; every Epic Dungeon listed once, with its fragments", () => {
    expect(HEXA_GROUPS.map(([, label]) => label)).toEqual(["Skill", "Enhancement", "Mastery", "Common"]);
    // the fragments a week are the server's (made-up here); none: no number
    const labels = dungeonLabels({ none: 0, highMountain: 41, anglerCompany: 56, nightmareParadise: 71 });
    expect(labels.map(([k]) => k)).toEqual([...EPIC_DUNGEONS]);
    expect(labels.map(([, l]) => l)).toEqual(["None", "High Mountain (41 a week)", "Angler Company (56 a week)", "Nightmare Paradise (71 a week)"]);
  });

  it("withStatUnlocked: that node only", () => {
    const i = withStatUnlocked(input(), 1, true);
    expect(i.stats.map((x) => x.unlocked)).toEqual([false, true, false]);
    expect(withStatUnlocked(i, 1, false)).toEqual(input());
  });

  it("readyText: now, the day (with the year when it's another year), or — when nothing comes in", () => {
    const now = new Date("2026-10-29T12:00:00Z");
    expect([readyText(0, now), readyText(-1, now), readyText(2.5, now), readyText(null, now)]).toEqual(["now", "now", "Nov 1", "—"]);
    expect(readyText(70, now)).toBe("Jan 7, 2027");
  });

  it("perWeekOf: farming a day × 7, Erda's Request and the Epic Dungeon, from what's typed and the server's figures", () => {
    const figures = { erdaRequest: 91, dungeons: { none: 0, highMountain: 41, anglerCompany: 56, nightmareParadise: 71 } };
    expect(perWeekOf({ ...input(), perDay: 3 }, figures)).toBe(21);
    expect(perWeekOf({ ...input(), perDay: 3, erdaRequest: true, dungeon: "nightmareParadise" }, figures)).toBe(21 + 91 + 71);
  });

  it("lineMax: 10, or what the node's 20 leaves; rankOf and unlockedOf as typed; wantedOf: never below the level now", () => {
    const n = withNode({ lines: [L("att", 10), L("ied", 7), L("dmg", 3)], unlocked: false });
    expect([lineMax(n, 0, 2), lineMax(n, 0, 0), lineMax(input(), 0, 1)]).toEqual([3, 10, 10]);
    expect(lineMax(withNode({ lines: [L("att", 2), L("ied", 9), L("dmg", 3)], unlocked: true }), 0, 0)).toBe(8);
    expect([rankOf(n.stats[0]!), unlockedOf(n.stats[0]!), rankOf(input().stats[1]!), unlockedOf(input().stats[1]!)]).toEqual([20, true, 0, false]);
    expect(unlockedOf({ ...input().stats[1]!, unlocked: true })).toBe(true);
    const w = { ...input(), current: { ...input().current, ascent: 8 }, desired: { ...input().desired, ascent: 5, hecate: 12 } };
    expect([wantedOf(w, "ascent"), wantedOf(w, "hecate")]).toEqual([8, 12]);
  });

  it("shortName: after the last colon, without a [stance] or (stance) in front; a short name as it is", () => {
    expect(["Rising Azure Dragon: Divided Heavens", "(Spirit) Unleash the Radiant Flame", "[Divine Will] Advent of Crimson", "Silence", "Sol Janus", "Soul-Shatter Talisman: Dance", "Sage: Apotheosis"].map(shortName)).toEqual([
      "Divided Heavens",
      "Unleash the Radiant Flame",
      "Advent of Crimson",
      "Silence",
      "Sol Janus",
      "Dance",
      "Apotheosis",
    ]);
    // a bracket further in is part of the name
    expect(shortName("Orbital Flame [Normal] Storm")).toBe("Orbital Flame [Normal] Storm");
  });

  it("sameLines: each line's stat and level the same", () => {
    const a = [L("att", 3), L(null, 2), L("ied", 0)];
    expect(sameLines(a, [L("att", 3), L(null, 2), L("ied", 0)])).toBe(true);
    expect(sameLines(a, [L("att", 3), L(null, 2), L("ied", 1)])).toBe(false);
    expect(sameLines(a, [L("att", 3), L("dmg", 2), L("ied", 0)])).toBe(false);
    expect(sameLines(a, [L("bossDmg", 3), L(null, 2), L("ied", 0)])).toBe(false);
  });

  it("approx, nodeTag, stepLabel", () => {
    expect([approx(true), approx(false)]).toEqual(["", "≈ "]);
    expect(["origin", "ascent", "mastery1", "mastery2", "mastery3", "mastery4", "boost1", "boost2", "boost3", "boost4"].map(nodeTag)).toEqual(["Origin", "Ascent", "M1", "M2", "M3", "M4", "E1", "E2", "E3", "E4"]);
    // nothing else, not even an object's own names
    expect(["janus", "hecate", "common3", "stat1", "mastery5", "toString"].map(nodeTag)).toEqual([null, null, null, null, null, null]);
    expect([stepLabel({ node: "origin", to: 14 }), stepLabel({ node: "hecate", to: 30 }), stepLabel({ node: "stat2", to: 20 })]).toEqual(["14", "MAX", "MAX"]);
  });
});
