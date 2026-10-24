// What each job's flames are scored on (the Flames page, v2.1.0): its main stat, its secondary stat(s),
// and whether it uses Magic ATT. By branch (Warrior STR/DEX, Magician INT/LUK, Bowman DEX/STR, Thief
// LUK/DEX, Pirate STR/DEX), with the exceptions: the DEX pirates, the thieves with two secondary stats,
// Xenon (three main stats), Demon Avenger (HP) and Zero (its flames are copied to its secondary, so
// boss and damage % count twice). The MapleStory Wiki's job pages; the same as Whackybeanz's flame
// calculator. Read 2026-10-24.

export type MainStatName = "STR" | "DEX" | "INT" | "LUK";
export interface JobStats {
  main: MainStatName[]; // Xenon: three; Demon Avenger: none (HP is its main stat)
  secondary: MainStatName[]; // Shadower, Dual Blade, Cadena: two; Xenon, Demon Avenger: none
  hpMain?: true; // Demon Avenger
  magic?: true; // scored on Magic ATT instead of ATT
  doubleWeaponDamage?: true; // Zero
}

const BRANCH: Record<string, JobStats> = {
  Warrior: { main: ["STR"], secondary: ["DEX"] },
  Magician: { main: ["INT"], secondary: ["LUK"], magic: true },
  Bowman: { main: ["DEX"], secondary: ["STR"] },
  Thief: { main: ["LUK"], secondary: ["DEX"] },
  Pirate: { main: ["STR"], secondary: ["DEX"] },
};

const EXCEPTIONS: Record<string, JobStats> = {
  Corsair: { main: ["DEX"], secondary: ["STR"] },
  Mechanic: { main: ["DEX"], secondary: ["STR"] },
  "Angelic Buster": { main: ["DEX"], secondary: ["STR"] },
  "Mo Xuan": { main: ["DEX"], secondary: ["STR"] },
  Shadower: { main: ["LUK"], secondary: ["STR", "DEX"] },
  "Dual Blade": { main: ["LUK"], secondary: ["STR", "DEX"] },
  Cadena: { main: ["LUK"], secondary: ["STR", "DEX"] },
  Xenon: { main: ["STR", "DEX", "LUK"], secondary: [] },
  "Demon Avenger": { main: [], secondary: [], hpMain: true },
  Zero: { main: ["STR"], secondary: ["DEX"], doubleWeaponDamage: true },
};

// A job's stats, from its branches in the gear list (null: a job the list doesn't know yet).
export function jobStats(job: string, branches: string[] | undefined): JobStats | null {
  if (Object.hasOwn(EXCEPTIONS, job)) return EXCEPTIONS[job]!;
  const branch = branches?.[0];
  return branch !== undefined && Object.hasOwn(BRANCH, branch) ? BRANCH[branch]! : null;
}
