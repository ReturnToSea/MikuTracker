// The GMS worlds MikuTracker tracks, by the ID Nexon's rankings use for them.
// Source: the world list in the code of Nexon's own rankings page (nexon.com/maplestory/rankings),
// read 2026-10-20: { id: 45, key: "kronos", name: "Kronos" }, { id: 70, key: "hyperion", name: "Hyperion" }.
// Both are Heroic worlds in North America.
export const WORLDS = [
  { id: 45, name: "Kronos" },
  { id: 70, name: "Hyperion" },
] as const;

export type WorldId = (typeof WORLDS)[number]["id"];
