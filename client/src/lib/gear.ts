import type { GearInput } from "@miku/shared";
import type { GearBoard, GearCharacter, GearItemView } from "../api/types";

// The gear tab's rules, as plain functions: what each slot offers, what counts, and the set counts.

export type Equipped = GearCharacter["equipped"];
export type Items = Map<string, GearItemView>;

// The game's equipment window, 5 columns × 6 rows (null: no slot there). The passive ring slot and
// the three totems sit outside it.
export const LAYOUT: (string | null)[] = [
  "ring1", null, "hat", null, "emblem",
  "ring2", "pendant1", "face", null, "badge",
  "ring3", "pendant2", "eye", "earrings", "medal",
  "ring4", "weapon", "top", "shoulder", "secondary",
  "pocket", "belt", "bottom", "gloves", "android",
  null, null, "shoes", "cape", "heart",
];
export const TOTEMS = ["totem1", "totem2", "totem3"];
// Every slot in the window's order, then the passive ring slot and the totems.
export const SLOT_ORDER = [...LAYOUT.filter((k): k is string => k !== null), "ringP", ...TOTEMS];
const RINGS = ["ring1", "ring2", "ring3", "ring4"];
// The sets with a weapon of their own, which a lucky item counts for.
export const ARMOR_SETS = ["Root Abyss", "AbsoLab", "Arcane Umbra", "Eternal"];

export const byKey = (items: GearItemView[]): Items => new Map(items.map((i) => [i.key, i]));
// A Continuous Ring entry, at any level ("Continuous Ring Lv. 4").
const continuous = (i: GearItemView) => i.name.startsWith("Continuous Ring");

// The listed item in a slot (none for an empty slot, a typed one, or one the list no longer has).
export function listed(eq: Equipped, slot: string, items: Items): GearItemView | undefined {
  const e = eq[slot];
  return e && "item" in e ? items.get(e.item) : undefined;
}

// The ring slot whose special skill ring opens the passive slot: a Ring of Restraint or Continuous
// Ring at Lv. 4+ (v.271).
export function opener(eq: Equipped, items: Items): string | null {
  return RINGS.find((s) => {
    const oz = listed(eq, s, items)?.oz;
    return oz?.kind === "active" && oz.level >= 4;
  }) ?? null;
}

// Whether what's saved in a slot counts: a bottom under an overall doesn't, nor a passive ring
// while its slot is closed (or while it's the same Continuous Ring as the active one). Both stay
// saved, and count again once the overall or the opener changes.
export function counted(eq: Equipped, slot: string, items: Items): boolean {
  if (slot === "bottom") return !listed(eq, "top", items)?.overall;
  if (slot === "ringP") {
    const open = opener(eq, items);
    const passive = listed(eq, "ringP", items);
    return open !== null && !(passive && continuous(passive) && continuous(listed(eq, open, items)!));
  }
  return true;
}

// Pieces counted per set, biggest first. A lucky item (Genesis or Destiny weapon) adds one to each
// armor set with 3+ pieces; the weapon slot holds only one weapon, so no set's own weapon can be
// in at the same time.
export function setCounts(eq: Equipped, items: Items): { sets: { set: string; count: number; lucky: boolean }[]; lucky: GearItemView | null } {
  const count = new Map<string, number>();
  let lucky: GearItemView | null = null;
  for (const slot of Object.keys(eq)) {
    const item = listed(eq, slot, items);
    if (!item || !counted(eq, slot, items)) continue;
    if (item.lucky) lucky = item;
    if (item.set) count.set(item.set, (count.get(item.set) ?? 0) + 1);
  }
  const sets = [...count].map(([set, n]) => {
    const bonus = lucky !== null && ARMOR_SETS.includes(set) && n >= 3;
    return { set, count: n + (bonus ? 1 : 0), lucky: bonus };
  });
  sets.sort((a, b) => b.count - a.count || a.set.localeCompare(b.set));
  return { sets, lucky };
}

// The items a slot offers the character: its kind, wearable by the character. The passive ring
// slot offers the passive rings, and the Continuous Ring unless that's already the active one.
export function options(board: GearBoard, c: GearCharacter, slot: string, items: Items): GearItemView[] {
  const kind = board.slots.find((s) => s.key === slot)?.kind;
  const fits = new Set(c.fits);
  const mine = board.items.filter((i) => i.slot === kind && fits.has(i.key));
  if (slot !== "ringP") return mine;
  const open = opener(c.equipped, items);
  const activeContinuous = open !== null && continuous(listed(c.equipped, open, items)!);
  return mine.filter((i) => i.oz?.kind === "passive" || (i.oz && continuous(i) && !activeContinuous));
}

// The special skill ring already in another of the four ring slots (only one goes in them).
export function ozElsewhere(eq: Equipped, slot: string, items: Items): GearItemView | null {
  if (!RINGS.includes(slot)) return null;
  const other = RINGS.filter((s) => s !== slot).map((s) => listed(eq, s, items)).find((i) => i?.oz);
  return other ?? null;
}

// A slot's list in groups (in the order the list file has them), each by level, then Oz level.
export function grouped(list: GearItemView[]): { group: string; items: GearItemView[] }[] {
  const groups = new Map<string, GearItemView[]>();
  for (const i of list) groups.set(i.group, [...(groups.get(i.group) ?? []), i]);
  return [...groups].map(([group, xs]) => ({ group, items: [...xs].sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || (a.oz?.level ?? 0) - (b.oz?.level ?? 0)) }));
}

// What's equipped after a save: the item, the typed name (trimmed, as the server keeps it), or nothing.
export function withGear(eq: Equipped, slot: string, input: GearInput): Equipped {
  const { [slot]: _old, ...rest } = eq;
  if (input.item !== undefined) return { ...rest, [slot]: { item: input.item } };
  if (input.other !== undefined) return { ...rest, [slot]: { other: input.other.trim() } };
  return rest;
}

// A slot's details after a save: kept when the same item (or the same typed name) goes back in,
// dropped when the item changes or the slot is emptied (as the server does).
export function detailsAfter(c: GearCharacter, slot: string, input: GearInput): GearCharacter["details"] {
  const before = c.equipped[slot];
  const same = before !== undefined && (("item" in before && before.item === input.item) || ("other" in before && before.other === input.other?.trim()));
  if (same) return c.details;
  const { [slot]: _dropped, ...rest } = c.details;
  return rest;
}
