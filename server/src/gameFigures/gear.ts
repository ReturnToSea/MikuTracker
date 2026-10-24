import { readFileSync } from "node:fs";
import path from "node:path";

// The gear tab's items and jobs: gear-items.json, built by hand from the MapleStory Wiki with
// scripts/gear-data.mjs (sources and what's listed are described there, and in DESIGN.md "Gear").
// Every item was also checked to exist in GMS (maplestory.io's GMS v.270 data or Nexon's patch notes).

export interface GearItem {
  id: number;
  key?: string; // set when one item has several entries (an Oz ring's levels): "<id>-<level>"
  name: string;
  slot: string; // the kind of slot: "hat", "ring", "weapon", "secondary", …
  jobs: string[] | null; // who can wear it: branches ("Thief") or jobs ("Night Walker"); null: anyone
  level: number | null;
  set: string | null; // the set it counts toward
  group: string; // where it's listed in the slot's menu
  file: string; // its picture on the wiki (scripts/gear-icons.mjs)
  weaponType?: string; // a weapon's type ("Claw"), matched against the job's
  overall?: true; // an overall: covers the bottom too
  lucky?: true; // a lucky item (Genesis and Destiny weapons)
  oz?: { kind: "active" | "passive"; level: number }; // an Oz (special skill) ring
}

export interface GearJob {
  branches: string[]; // "Warrior", "Magician", "Bowman", "Thief", "Pirate" (Xenon: two)
  weapons: string[]; // the weapon types it uses ("Claw")
}

interface GearFile {
  generated: string;
  items: GearItem[];
  jobs: Record<string, GearJob>;
}

let loaded: GearFile | undefined;
export function gearFile(): GearFile {
  loaded ??= JSON.parse(readFileSync(path.join(import.meta.dirname, "gear-items.json"), "utf8")) as GearFile;
  return loaded;
}

export const itemKey = (i: GearItem): string => i.key ?? String(i.id);

// The window's slots, as in the game's equipment window (5 columns × 6 rows), then the passive
// special skill ring slot and the three totems. `kind` is which items fit.
export const GEAR_SLOTS: readonly { key: string; label: string; kind: string }[] = [
  ["ring1", "Ring", "ring"], ["hat", "Hat", "hat"], ["emblem", "Emblem", "emblem"],
  ["ring2", "Ring", "ring"], ["pendant1", "Pendant", "pendant"], ["face", "Face", "face"], ["badge", "Badge", "badge"],
  ["ring3", "Ring", "ring"], ["pendant2", "Pendant", "pendant"], ["eye", "Eye", "eye"], ["earrings", "Earrings", "earrings"], ["medal", "Medal", "medal"],
  ["ring4", "Ring", "ring"], ["weapon", "Weapon", "weapon"], ["top", "Top", "top"], ["shoulder", "Shoulder", "shoulder"], ["secondary", "Secondary", "secondary"],
  ["pocket", "Pocket", "pocket"], ["belt", "Belt", "belt"], ["bottom", "Bottom", "bottom"], ["gloves", "Gloves", "gloves"], ["android", "Android", "android"],
  ["shoes", "Shoes", "shoes"], ["cape", "Cape", "cape"], ["heart", "Heart", "heart"],
  ["ringP", "Passive ring", "ring"], ["totem1", "Totem", "totem"], ["totem2", "Totem", "totem"], ["totem3", "Totem", "totem"],
].map(([key, label, kind]) => ({ key: key!, label: label!, kind: kind! }));

export const RING_SLOTS = ["ring1", "ring2", "ring3", "ring4"];

// Whether a job can wear an item. An unknown job (one added to the game after the list was built)
// can wear anything, so its lists aren't empty. A weapon must also be one of the job's weapon types.
export function fits(item: GearItem, job: string): boolean {
  const { jobs } = gearFile();
  const j = Object.hasOwn(jobs, job) ? jobs[job] : undefined;
  if (!j || !item.jobs) return true;
  const allowed = item.jobs.includes(job) || j.branches.some((b) => item.jobs!.includes(b));
  return allowed && (item.weaponType === undefined || j.weapons.includes(item.weaponType));
}
