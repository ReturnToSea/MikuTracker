import { EXP_TO_NEXT, MAX_LEVEL } from "../gameFigures/expTable";

// EXP math on the GMS table. A character's progress is (level, exp): `exp` is the EXP into the
// current level, as Nexon's rankings report it. "Total EXP" is everything earned from level 1
// with 0 EXP, which keeps working across level-ups (EXP gained = difference of totals).
// Every total fits exactly in a JavaScript number (at most 8,509,498,537,428,819).

// TOTAL_AT[level] = total EXP on reaching that level (TOTAL_AT[1] = 0, TOTAL_AT[300] = the cap).
const TOTAL_AT: number[] = [0, 0];
for (let level = 1; level < MAX_LEVEL; level++) TOTAL_AT.push(TOTAL_AT[level]! + EXP_TO_NEXT[level - 1]!);

function checkLevel(level: number, max: number) {
  if (!Number.isInteger(level) || level < 1 || level > max) throw new RangeError(`Level must be a whole number from 1 to ${max} (got ${level})`);
}

// EXP needed to go from `level` to the next (1–299).
export function expToNext(level: number): number {
  checkLevel(level, MAX_LEVEL - 1);
  return EXP_TO_NEXT[level - 1]!;
}

// Refuses progress that can't exist: a level outside 1–300, or EXP below 0, not whole, or at
// least the EXP for the next level (that would be the next level). Level 300 has no EXP.
export function checkProgress(level: number, exp: number) {
  checkLevel(level, MAX_LEVEL);
  const limit = level === MAX_LEVEL ? 0 : expToNext(level) - 1;
  if (!Number.isInteger(exp) || exp < 0 || exp > limit) throw new RangeError(`EXP at level ${level} must be a whole number from 0 to ${limit} (got ${exp})`);
}

export function totalExp(level: number, exp: number): number {
  checkProgress(level, exp);
  return TOTAL_AT[level]! + exp;
}

// The level and EXP for a total (the reverse of totalExp).
export function fromTotal(total: number): { level: number; exp: number } {
  if (!Number.isInteger(total) || total < 0 || total > TOTAL_AT[MAX_LEVEL]!) throw new RangeError(`Total EXP must be a whole number from 0 to ${TOTAL_AT[MAX_LEVEL]} (got ${total})`);
  const level = TOTAL_AT.findLastIndex((t) => t <= total); // the highest level reached (index 0 is unused)
  return { level, exp: total - TOTAL_AT[level]! };
}

// How far through the current level, from 0 up to (not including) 1. Level 300 counts as 1.
export function progress(level: number, exp: number): number {
  checkProgress(level, exp);
  return level === MAX_LEVEL ? 1 : exp / expToNext(level);
}

// EXP still needed from (level, exp) to reach `target` (higher than `level`, at most 300).
export function expToReach(level: number, exp: number, target: number): number {
  checkLevel(target, MAX_LEVEL);
  if (target <= level) throw new RangeError(`Target level ${target} must be above the current level ${level}`);
  return TOTAL_AT[target]! - totalExp(level, exp);
}
