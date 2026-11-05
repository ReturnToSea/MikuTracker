// The gear pages' stat values box (v4.1.0): which boxes each page shows, only what it uses (the owner,
// 2026-11-04). The Equipment and Upgrades pages add every page up, so they show them all.
export type ValuePage = "flames" | "starforce" | "potential" | "all";
type Field = "att" | "allStat" | "secRatio" | "bossDmg" | "fdPer100" | "attPct" | "mainFlat" | "critDmg" | "ied300" | "ied380";
const ALL: readonly Field[] = ["att", "allStat", "secRatio", "bossDmg", "fdPer100", "attPct", "mainFlat", "critDmg", "ied300", "ied380"];
// Flames: stat, ATT, all stats % and boss / damage lines; Star Force: only stats and ATT; Potential: every
// line but HEXA Stat's flat main stat, and skill cooldown and its hat's minimum, and which bosses' IED.
const FIELDS: Readonly<Record<ValuePage, readonly Field[]>> = {
  flames: ["att", "allStat", "secRatio", "bossDmg", "fdPer100"],
  starforce: ["att", "secRatio", "fdPer100"],
  potential: ALL.filter((f) => f !== "mainFlat"),
  all: ALL,
};
export function boxesOn(page: ValuePage): { fields: ReadonlySet<string>; pct: boolean; cooldown: boolean; defense: boolean } {
  const wide = page === "potential" || page === "all";
  return { fields: new Set(FIELDS[page]), pct: wide, cooldown: wide, defense: wide };
}

// A value as the pages show it (worked-out ones have many decimals): two decimals at most, three below 1.
// Stryker disable next-line EqualityOperator: at 1 both give "1"
export const shortNumber = (n: number): string => String(n < 1 ? Math.round(n * 1000) / 1000 : Math.round(n * 100) / 100);
