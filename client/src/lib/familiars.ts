import { BADGE_SLOTS, type FamiliarChoices, type FamiliarInput, familiarLineFits, type FamiliarRank, type FamiliarStat } from "@miku/shared";

// The Familiars page's display rules (v3.2.0), as plain functions.

type Typed = FamiliarInput["familiars"][number]["lines"][number];

const NAMES: Record<FamiliarStat, string> = {
  bossDmg: "Boss DMG", attPct: "ATT", ied: "IED", critDmg: "Crit DMG", dmg: "Damage", critRate: "Crit Rate", mattPct: "Magic ATT",
  strPct: "STR", dexPct: "DEX", intPct: "INT", lukPct: "LUK", allStatPct: "All Stats", att: "ATT", matt: "Magic ATT", str: "STR", dex: "DEX", int: "INT", luk: "LUK", allStat: "All Stats",
};
// A % stat (the rest are flat: main stat, ATT, All Stats).
const FLAT = new Set<FamiliarStat>(["att", "matt", "str", "dex", "int", "luk", "allStat"]);
export const isPct = (stat: FamiliarStat): boolean => !FLAT.has(stat);

// A line as the game words it: "Boss DMG +40%", "STR +6"; another kind of line.
export function lineText(line: NonNullable<Typed>): string {
  if (line.stat === "other") return "Other line (no damage)";
  return `${NAMES[line.stat]} +${line.value}${isPct(line.stat) ? "%" : ""}`;
}
// A stat's name in the totals: "ATT %" and "ATT" apart.
export const totalLabel = (stat: FamiliarStat): string => `${NAMES[stat]}${isPct(stat) ? " %" : ""}`;
// A total: "34.14%" (at most 2 decimals), "+4"; nothing: "–".
export function formatTotal(stat: FamiliarStat, value: number): string {
  if (value === 0) return "–";
  const n = Math.round(value * 100) / 100;
  return isPct(stat) ? `${n}%` : `+${n}`;
}

// A line as a dropdown's value ("bossDmg:40", "other"; not entered: "") and back.
export const lineKey = (line: Typed): string => (line === null ? "" : line.stat === "other" ? "other" : `${line.stat}:${line.value}`);
export function lineOfKey(key: string): Typed {
  if (key === "") return null;
  if (key === "other") return { stat: "other", value: 0 };
  const [stat, value] = key.split(":");
  return { stat: stat as FamiliarStat, value: Number(value) };
}

// The input with a familiar's rank changed: the lines the new rank can still have kept (the server's rule,
// shared), the others cleared.
export function withRank(input: FamiliarInput, i: number, rank: FamiliarRank, choices: FamiliarChoices): FamiliarInput {
  const familiars = input.familiars.map((f, j) => (j === i ? { rank, lines: f.lines.map((l, slot) => (familiarLineFits(l, slot as 0 | 1, choices) ? l : null)) as typeof f.lines } : f)) as FamiliarInput["familiars"];
  return { ...input, familiars };
}
export function withLine(input: FamiliarInput, i: number, slot: 0 | 1, line: Typed): FamiliarInput {
  const familiars = input.familiars.map((f, j) => (j === i ? { ...f, lines: (slot === 0 ? [line, f.lines[1]] : [f.lines[0], line]) as typeof f.lines } : f)) as FamiliarInput["familiars"];
  return { ...input, familiars };
}
// The input with a badge equipped or taken off (equipping a 9th does nothing: 8 at most).
export function withBadge(input: FamiliarInput, id: string, on: boolean): FamiliarInput {
  if (!on) return { ...input, badges: input.badges.filter((b) => b !== id) };
  if (input.badges.includes(id) || input.badges.length >= BADGE_SLOTS) return input;
  return { ...input, badges: [...input.badges, id] };
}
