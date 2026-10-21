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
