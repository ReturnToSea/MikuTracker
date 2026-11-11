// The GMS worlds MikuTracker tracks. Kronos and Hyperion by the ID Nexon's rankings use for them.
// Source: the world list in the code of Nexon's own rankings page (nexon.com/maplestory/rankings),
// read 2026-10-20: { id: 45, key: "kronos", name: "Kronos" }, { id: 70, key: "hyperion", name: "Hyperion" }.
// Both are Heroic worlds in North America.
//
// Challenger (v4.2.0): the Challenger World event's Heroic world. Its characters aren't in Nexon's
// rankings, so they're added and kept up to date by hand (`byHand`), never looked up; 900 is our own
// ID, never sent to Nexon. Heroic like the others (the owner checked in game, 2026-11-10).
// Challenger's ID (also where its own bosses show: Mayrin).
export const CHALLENGER = 900;
// `heroic`: a Heroic world (formerly Reboot): the Stats page's Heroic final damage, 5× crystal prices.
export const WORLDS = [
  { id: 45, name: "Kronos", byHand: false, heroic: true },
  { id: 70, name: "Hyperion", byHand: false, heroic: true },
  { id: CHALLENGER, name: "Challenger", byHand: true, heroic: true },
] as const;

export type WorldId = (typeof WORLDS)[number]["id"];

export const worldName = (id: number): string | undefined => WORLDS.find((w) => w.id === id)?.name;

// Whether a world's characters are added by hand (not in Nexon's rankings).
export const byHandWorld = (id: number): boolean => WORLDS.some((w) => w.id === id && w.byHand);

// Whether a world is Heroic.
export const heroicWorld = (id: number): boolean => WORLDS.some((w) => w.id === id && w.heroic);

// The worlds whose characters are looked up in Nexon's rankings.
export const nexonWorlds = (): number[] => WORLDS.filter((w) => !w.byHand).map((w) => w.id);
