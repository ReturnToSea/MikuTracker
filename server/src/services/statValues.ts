import { COOLDOWN_SECONDS, countedValues, STAT_VALUES_UNTYPED, type StatValuesInput, type StatValuesTyped, type StatValuesWorked } from "@miku/shared";
import { db } from "../db";
import { ownCharacter } from "./characters";
import { type StatsCharacter, workedStatValues } from "./stats";

// What each stat is worth to a character, in main stat (the gear pages' stat values; v4.1.0): what's typed,
// else what its Stats page works out (stat efficiency), else the default. Each page counts the result;
// the box shows what's typed, with the worked-out value under it.

export interface StatValuesView {
  values: StatValuesInput; // what counts
  typed: StatValuesTyped; // what's typed (null: not)
  worked: StatValuesWorked | null; // what's worked out (null: no Stats page saved, or a job it doesn't work out)
}

// A saved row as typed (the database keeps the bosses' defense and a hat's seconds as plain numbers: one
// they can't be is read as the start's).
type Row = Omit<StatValuesTyped, "bossDef" | "cdMin"> & { bossDef: number; cdMin: number; typedBefore: boolean };
const cdMinOf = (n: number): StatValuesTyped["cdMin"] => (COOLDOWN_SECONDS.some((s) => s === n) ? (n as StatValuesTyped["cdMin"]) : 0);
export function typedOf(row: Row | null | undefined): StatValuesTyped {
  if (!row) return { ...STAT_VALUES_UNTYPED };
  const { att, allStat, secRatio, bossDmg, fdPer100, strPct, dexPct, intPct, lukPct, hpPct, attPct, mainFlat, critDmg, ied300, ied380, bossDef, cd2, cd3, cd4, cd5, cd6, cdMin } = row;
  return { att, allStat, secRatio, bossDmg, fdPer100, strPct, dexPct, intPct, lukPct, hpPct, attPct, mainFlat, critDmg, ied300, ied380, bossDef: bossDef === 300 ? 300 : 380, cd2, cd3, cd4, cd5, cd6, cdMin: cdMinOf(cdMin) };
}
export async function statValuesView(c: StatsCharacter): Promise<StatValuesView> {
  const [row, worked] = await Promise.all([db().statValues.findUnique({ where: { characterId: c.id } }), workedStatValues(c)]);
  const t = typedOf(row);
  // (typed before v4.1.0: gives way where the Stats page works the values out; the settings stay)
  const typed = row?.typedBefore && worked ? { ...STAT_VALUES_UNTYPED, bossDef: t.bossDef, cdMin: t.cdMin } : t;
  return { values: countedValues(typed, worked), typed, worked };
}

export async function saveStatValues(ownerId: string, characterId: number, input: StatValuesTyped) {
  await ownCharacter(ownerId, characterId);
  await db().statValues.upsert({ where: { characterId }, create: { characterId, ...input }, update: { ...input, typedBefore: false } });
}
