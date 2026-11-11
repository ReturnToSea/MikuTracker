import type { CharacterView } from "../api/types";
import { fmtExp } from "./format";

// "86.93%", and the EXP had and needed for the level ("86.5T", "99.5T"); null at level 300.
export function levelProgress(c: Pick<CharacterView, "exp" | "expToNext">): { percent: number; text: string; have: string; need: string } | null {
  if (c.expToNext === null) return null;
  const percent = (c.exp / c.expToNext) * 100;
  return { percent, text: `${percent.toFixed(2)}%`, have: fmtExp(c.exp), need: fmtExp(c.expToNext) };
}

// Whether a name is already one of these characters (capitals ignored).
export const alreadyAdded = (characters: { name: string }[], name: string) => characters.some((c) => c.name.toLowerCase() === name.toLowerCase());

// The class list as typed into (a character added by hand): the classes whose name has the typed letters
// in it (capitals and spaces around ignored), those starting with them first, each group in A–Z order.
// Nothing typed: every class, A–Z.
export function classMatches(typed: string, classes: readonly string[]): string[] {
  const t = typed.trim().toLowerCase();
  const starts = (c: string) => c.toLowerCase().startsWith(t);
  return classes
    .filter((c) => c.toLowerCase().includes(t))
    .sort((a, b) => Number(starts(b)) - Number(starts(a)) || a.localeCompare(b));
}

// The class exactly as typed (capitals and spaces around ignored), as the list spells it; null if none is.
export const exactClass = (typed: string, classes: readonly string[]): string | null =>
  classes.find((c) => c.toLowerCase() === typed.trim().toLowerCase()) ?? null;
