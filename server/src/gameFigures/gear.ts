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
  // v2.0.0, from the item's own wiki page:
  type?: string; // its equipment type ("Hat", "Shield", "Imugi Gem")
  stats?: Partial<Record<"str" | "dex" | "int" | "luk" | "hp" | "mp" | "att" | "matt" | "def" | "speed" | "jump" | "boss" | "ied" | "damage" | "hpPct" | "mpPct", number>>;
  starMax?: number; // its own Star Force limit (0: it can't take stars)
  starMin?: number; // stars it comes with and can't go below (Genesis and Destiny weapons: 22)
  flames?: "boss" | "normal"; // the flames it can roll (none: it can't have flames)
  potential?: string; // Nexon's potential category for it (none: it can't have potential)
  hammers?: { count: number; per: Partial<Record<"allStat" | "hp" | "mp" | "att" | "matt", number>> }; // Exceptional Hammers
  exclusive?: true; // only one of it can be worn (Guardian Angel Rings)
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

// What each kind of item can take (for a typed "Other item"; listed items carry their own, from their
// wiki pages). Flames: not secondaries, emblems, badges, medals, rings, hearts, shoulders or totems (the
// wiki's Bonus Stats page and Nexon Korea's). Potential: not medals, badges, pocket items, totems or
// androids (the wiki's Potential page). Stars: not emblems, badges, pocket items, medals, totems or
// androids (items without upgrade slots).
export const FLAME_KINDS = new Set(["hat", "top", "bottom", "shoes", "gloves", "cape", "belt", "face", "eye", "earrings", "pendant", "pocket", "weapon"]);
export const POTENTIAL_KINDS = new Set(["weapon", "emblem", "secondary", "hat", "top", "bottom", "shoes", "gloves", "cape", "belt", "shoulder", "face", "eye", "earrings", "ring", "pendant", "heart"]);
export const STARLESS_KINDS = new Set(["emblem", "badge", "pocket", "medal", "totem", "android"]);

// Whether a job can wear an item. An unknown job (one added to the game after the list was built)
// can wear anything, so its lists aren't empty. A weapon must also be one of the job's weapon types.
export function fits(item: GearItem, job: string): boolean {
  const { jobs } = gearFile();
  const j = Object.hasOwn(jobs, job) ? jobs[job] : undefined;
  if (!j || !item.jobs) return true;
  const allowed = item.jobs.includes(job) || j.branches.some((b) => item.jobs!.includes(b));
  return allowed && (item.weaponType === undefined || j.weapons.includes(item.weaponType));
}
