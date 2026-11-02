import { FAMILIAR_DEFAULTS, FAMILIAR_STATS, type FamiliarInput } from "@miku/shared";
import { describe, expect, it } from "vitest";
import { formatTotal, isPct, lineKey, lineOfKey, lineText, totalLabel, withBadge, withLine, withRank } from "../src/lib/familiars";

const CHOICES = {
  first: [{ stat: "bossDmg", value: 40 }],
  usual: [{ stat: "bossDmg", value: 30 }],
  rare: [{ stat: "bossDmg", value: 40 }],
} as const;
const COMMON = { first: [{ stat: "dmg", value: 1 }], usual: null, rare: [{ stat: "dmg", value: 1 }] } as const;

describe("lines and totals, as the page words them", () => {
  it("a line: its stat and value, % for % stats; another kind of line", () => {
    expect(lineText({ stat: "bossDmg", value: 40 })).toBe("Boss DMG +40%");
    expect(lineText({ stat: "attPct", value: 9 })).toBe("ATT +9%");
    expect(lineText({ stat: "att", value: 10 })).toBe("ATT +10");
    expect(lineText({ stat: "str", value: 24 })).toBe("STR +24");
    expect(lineText({ stat: "allStatPct", value: 6 })).toBe("All Stats +6%");
    expect(lineText({ stat: "critDmg", value: 6 })).toBe("Crit DMG +6%");
    expect(lineText({ stat: "other", value: 0 })).toBe("Other line (no damage)");
  });
  it("every stat's name, as the game words it (and the flat ones without %)", () => {
    const names = Object.fromEntries(FAMILIAR_STATS.map((st) => [st, lineText({ stat: st, value: 1 })]));
    expect(names).toEqual({
      bossDmg: "Boss DMG +1%", attPct: "ATT +1%", ied: "IED +1%", critDmg: "Crit DMG +1%", dmg: "Damage +1%", critRate: "Crit Rate +1%", mattPct: "Magic ATT +1%",
      strPct: "STR +1%", dexPct: "DEX +1%", intPct: "INT +1%", lukPct: "LUK +1%", allStatPct: "All Stats +1%",
      att: "ATT +1", matt: "Magic ATT +1", str: "STR +1", dex: "DEX +1", int: "INT +1", luk: "LUK +1", allStat: "All Stats +1",
    });
  });
  it("which stats are %: everything but flat main stat, ATT, Magic ATT and All Stats", () => {
    expect(["att", "matt", "str", "dex", "int", "luk", "allStat"].filter((s) => isPct(s as "att"))).toEqual([]);
    expect(["bossDmg", "attPct", "ied", "critDmg", "dmg", "critRate", "mattPct", "strPct", "dexPct", "intPct", "lukPct", "allStatPct"].every((s) => isPct(s as "att"))).toBe(true);
  });
  it("a total's name: % and flat apart", () => {
    expect(totalLabel("attPct")).toBe("ATT %");
    expect(totalLabel("att")).toBe("ATT");
    expect(totalLabel("ied")).toBe("IED %");
  });
  it("a total: up to 2 decimals, % or +flat; nothing as –", () => {
    expect(formatTotal("ied", 34.1393)).toBe("34.14%");
    expect(formatTotal("ied", 58)).toBe("58%");
    expect(formatTotal("bossDmg", 120)).toBe("120%");
    expect(formatTotal("att", 4)).toBe("+4");
    expect(formatTotal("dmg", 0)).toBe("–");
  });
});

describe("dropdown values", () => {
  it("a line to its value and back; not entered is empty; another kind is 'other'", () => {
    expect(lineKey({ stat: "bossDmg", value: 40 })).toBe("bossDmg:40");
    expect(lineKey(null)).toBe("");
    expect(lineKey({ stat: "other", value: 0 })).toBe("other");
    expect(lineOfKey("bossDmg:40")).toEqual({ stat: "bossDmg", value: 40 });
    expect(lineOfKey("")).toBeNull();
    expect(lineOfKey("other")).toEqual({ stat: "other", value: 0 });
  });
});

describe("changing the input", () => {
  const input: FamiliarInput = {
    familiars: [
      { rank: "unique", lines: [{ stat: "bossDmg", value: 40 }, { stat: "bossDmg", value: 30 }] },
      { rank: "rare", lines: [{ stat: "dmg", value: 2 }, null] },
      { rank: "common", lines: [null, null] },
    ],
    badges: ["rebel"],
  };
  it("a new rank keeps the lines it can still have and clears the rest; only that familiar", () => {
    // to Common (made-up choices: Damage 1% only): Boss 40 and 30 can't stay
    expect(withRank(input, 0, "common", COMMON).familiars).toEqual([{ rank: "common", lines: [null, null] }, input.familiars[1], input.familiars[2]]);
    // the same lines the new rank still allows stay
    expect(withRank(input, 0, "legendary", { first: [{ stat: "bossDmg", value: 40 }], usual: [{ stat: "bossDmg", value: 40 }], rare: [] }).familiars[0]).toEqual({ rank: "legendary", lines: [{ stat: "bossDmg", value: 40 }, null] });
    // another kind of line stays
    const other = withLine(input, 2, 1, { stat: "other", value: 0 });
    expect(withRank(other, 2, "epic", CHOICES).familiars[2]).toEqual({ rank: "epic", lines: [null, { stat: "other", value: 0 }] });
    expect(withRank(input, 1, "rare", COMMON).badges).toEqual(["rebel"]);
  });
  it("a line changed: only that line of that familiar", () => {
    const out = withLine(input, 1, 1, { stat: "ied", value: 15 });
    expect(out.familiars).toEqual([input.familiars[0], { rank: "rare", lines: [{ stat: "dmg", value: 2 }, { stat: "ied", value: 15 }] }, input.familiars[2]]);
    expect(withLine(input, 0, 0, null).familiars[0]).toEqual({ rank: "unique", lines: [null, { stat: "bossDmg", value: 30 }] });
    expect(input.familiars[0].lines[0]).toEqual({ stat: "bossDmg", value: 40 });
  });
  it("a badge ticked is added once; unticked is taken off; a 9th isn't added", () => {
    expect(withBadge(input, "ocean", true).badges).toEqual(["rebel", "ocean"]);
    expect(withBadge(input, "rebel", true).badges).toEqual(["rebel"]);
    expect(withBadge(input, "rebel", false).badges).toEqual([]);
    expect(withBadge(input, "ocean", false).badges).toEqual(["rebel"]);
    const eight = { ...FAMILIAR_DEFAULTS, badges: ["a", "b", "c", "d", "e", "f", "g", "h"] };
    expect(withBadge(eight, "i", true)).toBe(eight);
    expect(withBadge({ ...eight, badges: eight.badges.slice(0, 7) }, "i", true).badges).toHaveLength(8);
  });
});
