// What a symbol level costs and the Force it gives (formulas and sources in gameFigures/symbols.ts).
import type { SymbolFigure } from "../gameFigures/symbols";

// Symbols needed to go from level L to L+1.
export const symbolsToLevel = (s: Pick<SymbolFigure, "kind">, level: number): number => (s.kind === "arcane" ? level * level + 11 : 9 * level * level + 20 * level);

// Meso to go from level L to L+1. The factors are worked out in tenths, whole numbers only, so a
// value like 13.2 − 0.6 × 9 = 7.8 can't come out as 7.799999… and round down a whole step.
export function mesoToLevel(s: Pick<SymbolFigure, "kind" | "k">, level: number): number {
  const symbols = symbolsToLevel(s, level);
  const k10 = Math.round(s.k * 10);
  if (s.kind === "arcane") return 10_000 * Math.floor((symbols * (k10 + level)) / 10);
  return 100_000 * Math.floor((symbols * (k10 - 6 * level)) / 10);
}

// The Force a symbol gives at a level (0 at level 0: not unlocked).
export function forceAt(s: Pick<SymbolFigure, "kind">, level: number): number {
  if (level === 0) return 0;
  return s.kind === "arcane" ? 20 + 10 * level : 10 * level;
}
