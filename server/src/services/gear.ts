import { readdirSync } from "node:fs";
import { type GearDetailsInput, type GearInput, STAT_VALUE_DEFAULTS, type StatValuesInput } from "@miku/shared";
import { classStatsOf, type DetailItem, type FlameRow, flameGrid, type Gains, otherStarLimit, starGains, starRange, unconfirmedFrom } from "../calc/gearDetails";
import { getConfig } from "../config";
import { db } from "../db";
import { FLAME_KINDS, fits, GEAR_SLOTS, type GearItem, type GearJob, gearFile, itemKey, POTENTIAL_KINDS, RING_SLOTS } from "../gameFigures/gear";
import { potentialOptions } from "../gameFigures/potential";
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
  details: Record<string, GearDetailsInput>; // each slot's stars, flames, potential and hammers (none: blank)
  statValues: StatValuesInput; // what each stat is worth to it (the defaults until changed)
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
  // Stryker disable next-line ObjectLiteral: only narrows what's read; each row is matched to its character by id below
  const values = await db().statValues.findMany({ where: { characterId: { in: characters.map((c) => c.id) } } });
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
      details: Object.fromEntries(rows.filter((r) => r.characterId === c.id && r.details).map((r) => [r.slot, JSON.parse(r.details!) as GearDetailsInput])),
      statValues: statValuesOf(values.find((v) => v.characterId === c.id)),
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
    // a different item (or name) starts with blank details
    const kept = rows.find((r) => r.slot === slot && r.other === input.other)?.details ?? null;
    await db().gearSlot.upsert({ where, create: { characterId, slot, other: input.other }, update: { item: null, other: input.other, details: kept } });
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
  if (item.exclusive && RING_SLOTS.includes(slot) && RING_SLOTS.some((s) => equipped.get(s) === item)) throw new HttpError(409, `Only one ${item.name} can be worn.`);
  if (active && slot === "ringP") {
    const continuous = isContinuous(item);
    if (item.oz?.kind !== "passive" && !continuous) throw new HttpError(400, `${item.name} isn't a passive special skill ring`);
    if (continuous && isContinuous(active)) throw new HttpError(400, "The Continuous Ring is already the active ring.");
  }
  const kept = rows.find((r) => r.slot === slot && r.item === input.item)?.details ?? null;
  await db().gearSlot.upsert({ where, create: { characterId, slot, item: input.item }, update: { item: input.item, other: null, details: kept } });
}

// ── v2.0.0: stars, flames, potential and hammers ──────────────────────────────────────────────

const statValuesOf = (row: StatValuesInput | undefined): StatValuesInput => {
  if (!row) return { ...STAT_VALUE_DEFAULTS };
  const { att, allStat, secRatio, bossDmg, hp, fdPer100 } = row;
  return { att, allStat, secRatio, bossDmg, hp, fdPer100 };
};

export async function saveStatValues(ownerId: string, characterId: number, input: StatValuesInput) {
  await ownCharacter(ownerId, characterId);
  await db().statValues.upsert({ where: { characterId }, create: { characterId, ...input }, update: input });
}

// What can be set on an item: its star range and what each star count adds, its flame grid, the
// potential lines it can roll per rank, and its Exceptional Hammers.
export interface DetailOptions {
  stars: { min: number; max: number; gains: Gains[]; unconfirmedFrom: number | null }; // gains[n]: n stars in all
  flames: FlameRow[]; // empty: it can't have flames
  potential: Partial<Record<string, { line: string; chance: number }[][]>> | null; // per rank, the 3 lines' options
  hammers: GearItem["hammers"] | null;
}

// A listed item's figures as the calculations take them. Its class stats come from its class
// requirement (a job's own items: that job's branch).
function detailItem(item: GearItem): DetailItem {
  const { jobs } = gearFile();
  const branches = item.jobs?.flatMap((j) => (Object.hasOwn(jobs, j) ? jobs[j]!.branches : [j])) ?? null;
  return { slot: item.slot, level: item.level ?? 0, stats: item.stats ?? {}, classStats: classStatsOf(branches), starMin: item.starMin ?? 0, starMax: item.starMax ?? 0, flames: item.flames ?? null };
}

// A typed "Other item", from what the player said it is.
function otherItem(other: NonNullable<GearDetailsInput["other"]>): DetailItem {
  return { slot: other.kind, level: other.level, stats: { att: other.att, matt: other.matt }, classStats: classStatsOf(null), starMin: 0, starMax: otherStarLimit(other.kind, other.level), flames: FLAME_KINDS.has(other.kind) ? (other.boss ? "boss" : "normal") : null, typed: true };
}

function optionsFor(di: DetailItem, potentialPart: string | null, hammers: GearItem["hammers"] | null): DetailOptions {
  const [min, max] = starRange(di);
  return {
    stars: { min, max, gains: Array.from({ length: max + 1 }, (_, n) => starGains(di, n)), unconfirmedFrom: unconfirmedFrom(di) },
    flames: flameGrid(di),
    potential: potentialPart ? potentialOptions(potentialPart, di.level) : null,
    hammers,
  };
}

export function listedItemOptions(key: string): DetailOptions {
  const item = gearFile().items.find((i) => itemKey(i) === key);
  if (!item) throw new HttpError(404, "Unknown item");
  return optionsFor(detailItem(item), item.potential ?? null, item.hammers ?? null);
}

export function otherItemOptions(other: NonNullable<GearDetailsInput["other"]>): DetailOptions {
  if (!GEAR_SLOTS.some((s) => s.kind === other.kind)) throw new HttpError(400, "Unknown kind of item");
  return optionsFor(otherItem(other), POTENTIAL_KINDS.has(other.kind) ? other.kind : null, null);
}

// Saves an item's details, each value checked against what the item can have.
export async function saveGearDetails(ownerId: string, characterId: number, slot: string, input: GearDetailsInput) {
  await ownCharacter(ownerId, characterId);
  const row = await db().gearSlot.findUnique({ where: { characterId_slot: { characterId, slot } } });
  if (!row) throw new HttpError(404, "Nothing is in that slot");
  if (row.item && input.other) throw new HttpError(400, "Only a typed item says what it is");
  if (!row.item && !input.other) throw new HttpError(400, "Say what kind of item it is, its level, and whether it's a boss item");
  if (input.other && input.other.kind !== GEAR_SLOTS.find((s) => s.key === slot)!.kind) throw new HttpError(400, "A typed item is the kind of its slot");
  const options = row.item ? listedItemOptions(row.item) : otherItemOptions(input.other!);
  const { min, max } = options.stars;
  if (input.stars < min || input.stars > max) throw new HttpError(400, max === 0 ? "This item can't take stars" : `Stars go from ${min} to ${max} on this item`);
  for (const [stat, tier] of Object.entries(input.flames)) {
    const value = options.flames.find((r) => r.stat === stat)?.values[tier - 1];
    if (value === null || value === undefined) throw new HttpError(400, options.flames.length === 0 ? "This item can't have flames" : `This item can't roll ${stat} at tier ${tier}`);
  }
  if (input.potential) {
    const lines = options.potential?.[input.potential.rank];
    // (every level range Nexon has lists all four ranks, so no lines means no potential at all)
    if (!lines) throw new HttpError(400, "This item can't have potential");
    input.potential.lines.forEach((line, i) => {
      if (line !== null && !lines[i]!.some((o) => o.line === line)) throw new HttpError(400, `Line ${i + 1} can't be "${line}" on this item`);
    });
  }
  if (input.hammers > (options.hammers?.count ?? 0)) throw new HttpError(400, options.hammers ? `Exceptional Hammers on this item: at most ${options.hammers.count}` : "This item can't take Exceptional Hammers");
  await db().gearSlot.update({ where: { characterId_slot: { characterId, slot } }, data: { details: JSON.stringify(input) } });
}
