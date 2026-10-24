import { readdirSync } from "node:fs";
import type { GearInput } from "@miku/shared";
import { getConfig } from "../config";
import { db } from "../db";
import { fits, GEAR_SLOTS, type GearItem, type GearJob, gearFile, itemKey, RING_SLOTS } from "../gameFigures/gear";
import { HttpError } from "../http";
import { listCharacters, ownCharacter } from "./characters";

// An item as the gear tab shows it: what the list file says, its key, and its icon's address (null
// when the data folder has no icon for it).
export type GearItemView = Omit<GearItem, "file" | "key"> & { key: string; icon: string | null };

export interface GearCharacter {
  id: number;
  name: string;
  job: string;
  level: number;
  avatar: string | null;
  knownJob: boolean; // false: a job the list doesn't know yet, so every class's items are offered
  fits: string[]; // the keys of the items it can wear
  equipped: Record<string, { item: string } | { other: string }>; // by slot
}

export interface GearBoard {
  generated: string; // when the item list was built
  slots: typeof GEAR_SLOTS;
  items: GearItemView[];
  jobs: Record<string, GearJob>;
  characters: GearCharacter[]; // in tab order
}

const view = (i: GearItem, icons: Set<string>): GearItemView => {
  const { file: _file, key: _key, ...rest } = i;
  return { ...rest, key: itemKey(i), icon: icons.has(`${i.id}.png`) ? `/item-icons/${i.id}.png` : null };
};
// The icon files in the data folder, read once per request (none when the folder doesn't exist).
function iconFiles(): Set<string> {
  try {
    return new Set(readdirSync(getConfig().itemIconDir));
  } catch {
    return new Set();
  }
}

export async function gearBoard(ownerId: string, worldId: number): Promise<GearBoard> {
  const { items, jobs, generated } = gearFile();
  const { characters } = await listCharacters(ownerId, worldId);
  // Stryker disable next-line ObjectLiteral: only narrows what's read; each row is matched to its character by id below
  const rows = await db().gearSlot.findMany({ where: { characterId: { in: characters.map((c) => c.id) } } });
  const icons = iconFiles();
  return {
    generated,
    slots: GEAR_SLOTS,
    items: items.map((i) => view(i, icons)),
    jobs,
    characters: characters.map((c) => ({
      id: c.id,
      name: c.name,
      job: c.job,
      level: c.level,
      avatar: c.avatar,
      knownJob: Object.hasOwn(jobs, c.job),
      fits: items.filter((i) => fits(i, c.job)).map(itemKey),
      equipped: Object.fromEntries(rows.filter((r) => r.characterId === c.id).map((r) => [r.slot, r.item ? { item: r.item } : { other: r.other! }])),
    })),
  };
}

// The active Oz ring that opens the passive slot: a Ring of Restraint or Continuous Ring at Lv. 4+
// in a ring slot (v.271).
const opener = (equipped: Map<string, GearItem>) => RING_SLOTS.map((s) => equipped.get(s)).find((i) => i?.oz?.kind === "active" && i.oz.level >= 4);
// A Continuous Ring entry, at any level ("Continuous Ring Lv. 4").
const isContinuous = (i: GearItem) => i.name.startsWith("Continuous Ring");

// Puts an item (or an unlisted one by name) in a slot, or empties it. A listed item must be the
// slot's kind and wearable by the character's job; only one Oz ring goes in the ring slots; the
// passive ring slot needs an active Ring of Restraint or Continuous Ring at Lv. 4+, and takes a
// passive ring (Weapon Jump) or a Continuous Ring other than the one that opened it.
export async function saveGear(ownerId: string, characterId: number, slot: string, input: GearInput) {
  const c = await ownCharacter(ownerId, characterId);
  const def = GEAR_SLOTS.find((s) => s.key === slot);
  if (!def) throw new HttpError(404, "Not found");
  const where = { characterId_slot: { characterId, slot } };
  if (input.clear) {
    await db().gearSlot.deleteMany({ where: { characterId, slot } });
    return;
  }
  const { items } = gearFile();
  const rows = await db().gearSlot.findMany({ where: { characterId } });
  // What's in the other slots (a saved item the list no longer has counts as nothing).
  const equipped = new Map<string, GearItem>();
  for (const r of rows) {
    const known = items.find((i) => itemKey(i) === r.item);
    if (known && r.slot !== slot) equipped.set(r.slot, known);
  }
  const active = opener(equipped);
  if (slot === "ringP" && !active) throw new HttpError(409, "The passive ring slot opens with a Ring of Restraint or Continuous Ring at Lv. 4 or higher.");
  if (input.other !== undefined) {
    if (slot === "ringP") throw new HttpError(400, "The passive ring slot only takes a special skill ring from the list");
    await db().gearSlot.upsert({ where, create: { characterId, slot, other: input.other }, update: { item: null, other: input.other } });
    return;
  }
  const item = items.find((i) => itemKey(i) === input.item);
  if (!item) throw new HttpError(400, "Unknown item");
  if (item.slot !== def.kind) throw new HttpError(400, `${item.name} doesn't go in the ${def.label.toLowerCase()} slot`);
  if (!fits(item, c.job)) throw new HttpError(400, `${c.name} (${c.job}) can't wear ${item.name}`);
  if (item.oz && RING_SLOTS.includes(slot)) {
    const other = RING_SLOTS.map((s) => equipped.get(s)).find((i) => i?.oz);
    if (other) throw new HttpError(409, `Only one special skill ring can be in the ring slots (${other.name} is already in one).`);
  }
  if (active && slot === "ringP") {
    const continuous = isContinuous(item);
    if (item.oz?.kind !== "passive" && !continuous) throw new HttpError(400, `${item.name} isn't a passive special skill ring`);
    if (continuous && isContinuous(active)) throw new HttpError(400, "The Continuous Ring is already the active ring.");
  }
  await db().gearSlot.upsert({ where, create: { characterId, slot, item: input.item }, update: { item: input.item, other: null } });
}
