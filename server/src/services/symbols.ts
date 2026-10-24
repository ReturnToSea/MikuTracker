import type { SymbolInput } from "@miku/shared";
import { forceAt, mesoToLevel, symbolsToLevel } from "../calc/symbols";
import { db } from "../db";
import { findSymbol, SYMBOLS, SYMBOLS_PATCH, type SymbolFigure } from "../gameFigures/symbols";
import { HttpError } from "../http";
import { listCharacters, ownCharacter } from "./characters";

// A symbol as the calculator uses it: what each level costs and the Force at each level, worked
// out from the game's formulas here, so the page only adds them up.
export interface SymbolInfo {
  id: string;
  name: string;
  kind: SymbolFigure["kind"];
  grand: boolean;
  daily: number;
  weeklyPerClear: number | null;
  maxLevel: number;
  selector: SymbolFigure["kind"] | null;
  steps: { symbols: number; meso: number }[]; // steps[L − 1]: from level L to L + 1
  force: number[]; // force[L]: the Force at level L (force[0] is 0: not unlocked)
}

export interface SymbolsCharacter {
  id: number;
  name: string;
  job: string;
  level: number;
  avatar: string | null;
  symbols: Record<string, SymbolInput>; // only the symbols entered so far
}

export interface SymbolsBoard {
  patch: string;
  symbols: SymbolInfo[];
  characters: SymbolsCharacter[]; // in tab order
}

const info = (s: SymbolFigure): SymbolInfo => ({
  id: s.id,
  name: s.name,
  kind: s.kind,
  grand: s.grand,
  daily: s.daily,
  weeklyPerClear: s.weeklyPerClear,
  maxLevel: s.maxLevel,
  selector: s.selector,
  steps: Array.from({ length: s.maxLevel - 1 }, (_, i) => ({ symbols: symbolsToLevel(s, i + 1), meso: mesoToLevel(s, i + 1) })),
  force: Array.from({ length: s.maxLevel + 1 }, (_, level) => forceAt(s, level)),
});

export async function symbolsBoard(ownerId: string, worldId: number): Promise<SymbolsBoard> {
  const { characters } = await listCharacters(ownerId, worldId);
  // Stryker disable next-line ObjectLiteral: only narrows what's read; each row is matched to its character by id below
  const rows = await db().symbolState.findMany({ where: { characterId: { in: characters.map((c) => c.id) } } });
  return {
    patch: SYMBOLS_PATCH,
    symbols: SYMBOLS.map(info),
    characters: characters.map((c) => ({
      id: c.id,
      name: c.name,
      job: c.job,
      level: c.level,
      avatar: c.avatar,
      symbols: Object.fromEntries(rows.filter((r) => r.characterId === c.id).map((r) => [r.symbol, { level: r.level, held: r.held, days: r.days, weekly: r.weekly }])),
    })),
  };
}

// Saves one symbol of a character, as typed. The level must be one the symbol has; the symbols
// held must be fewer than the next level needs (none at level 0 or at the top); weekly clears are
// for Arcane symbols only.
export async function saveSymbol(ownerId: string, characterId: number, symbolId: string, input: SymbolInput) {
  await ownCharacter(ownerId, characterId);
  const s = findSymbol(symbolId);
  if (!s) throw new HttpError(404, "Not found");
  if (input.level > s.maxLevel) throw new HttpError(400, `${s.name} goes up to Lv. ${s.maxLevel}`);
  const room = input.level === 0 || input.level === s.maxLevel ? 0 : symbolsToLevel(s, input.level) - 1;
  if (input.held > room) throw new HttpError(400, room === 0 ? `${s.name} holds no symbols at Lv. ${input.level}` : `${s.name} Lv. ${input.level} holds at most ${room} symbols`);
  if (input.weekly > 0 && s.weeklyPerClear === null) throw new HttpError(400, `${s.name} has no weekly content`);
  await db().symbolState.upsert({
    where: { characterId_symbol: { characterId, symbol: symbolId } },
    create: { characterId, symbol: symbolId, ...input },
    update: input,
  });
}
