import { FAMILIAR_DEFAULTS, FAMILIAR_RANKS, type FamiliarChoices, familiarChoices, type FamiliarInput, familiarLineFits, type FamiliarRank, familiarInput } from "@miku/shared";
import { familiarTotals, type Total } from "../calc/familiars";
import { db } from "../db";
import { BADGE_FIGURES, BADGES, FAMILIAR_BOSS_CAP, familiarLines } from "../gameFigures/familiars";
import { HttpError } from "../http";
import { ownCharacter } from "./characters";
import { iconFiles } from "./icons";

// The Familiars page (v3.2.0): one character's summoned familiars and equipped badges as typed, with what
// their damage stats add up to (for v4.0.0's stat sheet). (Its character tabs: the character list's.)

export interface BadgeView {
  id: string;
  name: string;
  effects: string[];
  damage: boolean; // gives a damage stat (counted in the totals)
  icon: string | null; // null: not downloaded
}
export interface FamiliarBoard {
  input: FamiliarInput;
  choices: Record<FamiliarRank, FamiliarChoices>; // the lines each rank's familiars can have
  badges: BadgeView[];
  totals: Total[]; // the stats the lines and badges give, in FAMILIAR_STATS' order (none: not listed)
  bossCap: number;
  source: string;
}

const choicesOf = (rank: FamiliarRank) => familiarChoices(rank, familiarLines());
const known = (id: string) => BADGES.some((b) => b.id === id);
// Why an input doesn't fit the game's figures (a line its familiar's rank can't have, a badge that isn't
// listed), or null.
function problem(input: FamiliarInput): string | null {
  for (const [i, f] of input.familiars.entries()) {
    const choices = choicesOf(f.rank);
    for (const slot of [0, 1] as const) if (!familiarLineFits(f.lines[slot], slot, choices)) return `Familiar ${i + 1}'s line ${slot + 1} isn't one ${f.rank} familiars can have`;
  }
  const unknown = input.badges.find((id) => !known(id));
  return unknown === undefined ? null : `There's no badge "${unknown}"`;
}

// The saved input, or the defaults (none saved, or one that no longer passes the rules or isn't JSON). A
// line or badge the figures no longer have (a patch changed a line, the wiki renamed a badge) is dropped on
// its own, the rest kept.
async function savedInput(characterId: number): Promise<FamiliarInput> {
  const row = await db().familiarPlan.findUnique({ where: { characterId } });
  let parsed: ReturnType<typeof familiarInput.safeParse> | null = null;
  try {
    parsed = row ? familiarInput.safeParse(JSON.parse(row.data)) : null;
  } catch {
    // (not JSON: the defaults)
  }
  if (!parsed?.success) return structuredClone(FAMILIAR_DEFAULTS);
  const familiars = parsed.data.familiars.map((f) => {
    const choices = choicesOf(f.rank);
    return { rank: f.rank, lines: f.lines.map((l, slot) => (familiarLineFits(l, slot as 0 | 1, choices) ? l : null)) };
  }) as FamiliarInput["familiars"];
  return { familiars, badges: parsed.data.badges.filter(known) };
}

export async function saveFamiliars(ownerId: string, characterId: number, input: FamiliarInput): Promise<void> {
  await ownCharacter(ownerId, characterId);
  const wrong = problem(input);
  if (wrong) throw new HttpError(400, wrong);
  const data = JSON.stringify(input);
  await db().familiarPlan.upsert({ where: { characterId }, create: { characterId, data }, update: { data } });
}

export async function familiarBoard(ownerId: string, characterId: number): Promise<FamiliarBoard> {
  await ownCharacter(ownerId, characterId);
  const input = await savedInput(characterId);
  const files = iconFiles("familiars");
  // (the lines typed; "other" ones add to no stat)
  const lines = input.familiars.flatMap((f) => f.lines).filter((l) => l !== null);
  const equipped = BADGES.filter((b) => input.badges.includes(b.id));
  return {
    input,
    choices: Object.fromEntries(FAMILIAR_RANKS.map((r) => [r, choicesOf(r)])) as Record<FamiliarRank, FamiliarChoices>,
    badges: BADGES.map((b) => ({ id: b.id, name: b.name, effects: b.effects, damage: Object.keys(b.stats).length > 0, icon: files.has(`${b.id}.png`) ? `/item-icons/familiars/${b.id}.png` : null })),
    totals: familiarTotals(lines, equipped.map((b) => b.stats), FAMILIAR_BOSS_CAP),
    bossCap: FAMILIAR_BOSS_CAP,
    source: `The MapleStory Wiki's familiar lines (after v.264) and badges (read ${BADGE_FIGURES.generated})`,
  };
}
