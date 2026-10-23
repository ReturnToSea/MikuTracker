import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { type BossPlanInput, countedCrystals, type Difficulty } from "@miku/shared";
import { bossMonth, bossWeek, mesoPerPerson, monthlyReset, weeklyReset } from "../calc/bosses";
import { getConfig } from "../config";
import { db } from "../db";
import { BOSS_PRICES_PATCH, BOSSES, type BossFigure, findBoss, WEEKLY_CRYSTALS_PER_CHARACTER, WEEKLY_CRYSTALS_PER_WORLD } from "../gameFigures/bosses";
import { HttpError } from "../http";
import { listCharacters, ownCharacter } from "./characters";

// A boss as the planning menu shows it: each difficulty with what one person gets for each party
// size (perPerson[0] solo, perPerson[1] a party of 2, …, up to its largest party).
export interface BossInfo {
  id: string;
  name: string;
  kind: BossFigure["kind"];
  art: string | null; // its picture's address, or null when the data folder has none
  difficulties: { difficulty: Difficulty; maxParty: number; perPerson: number[] }[];
}

// A planned boss of one character, this week (this month for a monthly one).
export interface BossRow {
  boss: string;
  difficulty: Difficulty;
  partySize: number;
  meso: number; // for this character, after the party split
  cleared: boolean;
  // Whether its crystal can be sold: not when it's beyond the character's 14 most valuable
  // ("character") or the world's 180 ("world").
  over: "character" | "world" | null;
}

export interface BossCharacter {
  id: number;
  name: string;
  job: string;
  level: number;
  avatar: string | null;
  weekly: BossRow[]; // in game order
  monthly: BossRow[];
  planned: number; // weekly meso if every planned boss is cleared (counting crystals only)
  soFar: number; // weekly meso from the bosses ticked so far (counting crystals only)
  cleared: number; // weekly bosses ticked
}

// Everything the Bosses tab shows for one world.
export interface BossBoard {
  pricesPatch: string;
  week: { start: string; resetsAt: Date };
  month: { name: string; resetsAt: Date };
  limits: { perCharacter: number; perWorld: number };
  bosses: BossInfo[]; // in game order, monthly ones last
  characters: BossCharacter[]; // in tab order
  totals: {
    planned: number;
    soFar: number;
    cleared: number;
    bosses: number; // weekly bosses planned
    crystals: number; // weekly crystals within each character's limit, against the world's
    monthlyPlanned: number;
    monthlySoFar: number;
  };
}

// Where a boss's picture can be loaded from, or null. Its modification time is part of the
// address, so a replaced picture shows instead of a cached old one.
function artAddress(id: string): string | null {
  const file = path.join(getConfig().bossArtDir, `${id}.png`);
  return existsSync(file) ? `/boss-art/${id}.png?v=${Math.round(statSync(file).mtimeMs)}` : null;
}

const info = (b: BossFigure): BossInfo => ({
  id: b.id,
  name: b.name,
  kind: b.kind,
  art: artAddress(b.id),
  difficulties: b.difficulties.map((d) => ({ difficulty: d.difficulty, maxParty: d.maxParty, perPerson: Array.from({ length: d.maxParty }, (_, i) => mesoPerPerson(d.price, i + 1)) })),
});

const sum = (rows: BossRow[], pick: (r: BossRow) => boolean) => rows.filter(pick).reduce((total, r) => total + r.meso, 0);

export async function bossBoard(ownerId: string, worldId: number): Promise<BossBoard> {
  const now = new Date();
  const week = bossWeek(now);
  const month = bossMonth(now);
  const { characters } = await listCharacters(ownerId, worldId);
  const ids = characters.map((c) => c.id);
  // Stryker disable next-line ObjectLiteral: only narrows what's read; each row is matched to its character by id below
  const theirs = { characterId: { in: ids } };
  // Stryker disable next-line ObjectLiteral: the same narrowing (plans are looked up by character id below)
  const plans = await db().bossPlan.findMany({ where: theirs });
  // Only this week's and this month's ticks are read, so a tick found means cleared now. (A weekly
  // boss's period is a week, a monthly one's a month, so one can't be taken for the other.)
  const clears = await db().bossClear.findMany({ where: { ...theirs, period: { in: [week, month] } } });
  const ticked = new Set(clears.map((c) => `${c.characterId} ${c.boss}`));
  const planned = new Map(plans.map((p) => [`${p.characterId} ${p.boss}`, p]));

  // A saved plan outlives game changes: a difficulty a patch removed is left out (until the plan
  // is saved again), and a party larger than the game now allows counts as the largest allowed.
  const rows = (characterId: number, kind: BossFigure["kind"]): BossRow[] =>
    BOSSES.filter((b) => b.kind === kind).flatMap((b) => {
      const plan = planned.get(`${characterId} ${b.id}`);
      const level = b.difficulties.find((d) => d.difficulty === plan?.difficulty);
      if (!plan || !level) return [];
      const partySize = Math.min(plan.partySize, level.maxParty);
      const meso = mesoPerPerson(level.price, partySize);
      return [{ boss: b.id, difficulty: level.difficulty, partySize, meso, cleared: ticked.has(`${characterId} ${b.id}`), over: null }];
    });

  const board = characters.map((c) => {
    const weekly = rows(c.id, "weekly");
    countedCrystals(
      weekly.map((r) => r.meso),
      WEEKLY_CRYSTALS_PER_CHARACTER,
    ).forEach((counts, i) => {
      if (!counts) weekly[i]!.over = "character";
    });
    return { c, weekly, monthly: rows(c.id, "monthly") };
  });
  // The world's limit applies to what the characters can sell: the least valuable of those go first.
  const sellable = board.flatMap((b) => b.weekly.filter((r) => r.over === null));
  countedCrystals(
    sellable.map((r) => r.meso),
    WEEKLY_CRYSTALS_PER_WORLD,
  ).forEach((counts, i) => {
    if (!counts) sellable[i]!.over = "world";
  });

  const out = board.map(({ c, weekly, monthly }) => ({
    id: c.id,
    name: c.name,
    job: c.job,
    level: c.level,
    avatar: c.avatar,
    weekly,
    monthly,
    planned: sum(weekly, (r) => r.over === null),
    soFar: sum(weekly, (r) => r.over === null && r.cleared),
    cleared: weekly.filter((r) => r.cleared).length,
  }));
  const total = (pick: (c: BossCharacter) => number) => out.reduce((t, c) => t + pick(c), 0);
  return {
    pricesPatch: BOSS_PRICES_PATCH,
    week: { start: week, resetsAt: weeklyReset(week) },
    month: { name: month, resetsAt: monthlyReset(month) },
    limits: { perCharacter: WEEKLY_CRYSTALS_PER_CHARACTER, perWorld: WEEKLY_CRYSTALS_PER_WORLD },
    bosses: [...BOSSES.filter((b) => b.kind === "weekly"), ...BOSSES.filter((b) => b.kind === "monthly")].map(info),
    characters: out,
    totals: {
      planned: total((c) => c.planned),
      soFar: total((c) => c.soFar),
      cleared: total((c) => c.cleared),
      bosses: total((c) => c.weekly.length),
      crystals: sellable.length,
      monthlyPlanned: total((c) => sum(c.monthly, () => true)),
      monthlySoFar: total((c) => sum(c.monthly, (r) => r.cleared)),
    },
  };
}

// The period a boss's tick belongs to right now.
const periodOf = (boss: BossFigure, now: Date) => (boss.kind === "weekly" ? bossWeek(now) : bossMonth(now));

// Replaces a character's plan. Every boss, difficulty and party size must exist in the game. This
// week's ticks follow the plan: a boss taken out loses its tick, and a kept one takes the new
// difficulty and party size. Earlier weeks' ticks stay as they were.
export async function saveBossPlan(ownerId: string, characterId: number, plan: BossPlanInput["plan"]) {
  await ownCharacter(ownerId, characterId);
  for (const p of plan) {
    const boss = findBoss(p.boss);
    if (!boss) throw new HttpError(400, `Unknown boss "${p.boss}"`);
    const level = boss.difficulties.find((d) => d.difficulty === p.difficulty);
    if (!level) throw new HttpError(400, `${boss.name} has no ${p.difficulty} difficulty`);
    if (p.partySize > level.maxParty) throw new HttpError(400, `${p.difficulty} ${boss.name} allows a party of up to ${level.maxParty}`);
  }
  const now = new Date();
  const current = BOSSES.map((b) => ({ boss: b.id, period: periodOf(b, now) }));
  await db().$transaction([
    db().bossPlan.deleteMany({ where: { characterId } }),
    db().bossPlan.createMany({ data: plan.map((p) => ({ characterId, ...p })) }),
    ...current.map(({ boss, period }) => {
      const kept = plan.find((p) => p.boss === boss);
      const where = { characterId, boss, period };
      return kept ? db().bossClear.updateMany({ where, data: { difficulty: kept.difficulty, partySize: kept.partySize } }) : db().bossClear.deleteMany({ where });
    }),
  ]);
}

// Ticks a planned boss as cleared this week (this month for a monthly boss), or unticks it.
// Checked and saved in one transaction, so a plan saved at the same moment can't leave a tick
// behind for a boss it just took out.
export async function setBossCleared(ownerId: string, characterId: number, bossId: string, cleared: boolean) {
  const c = await ownCharacter(ownerId, characterId);
  const boss = findBoss(bossId);
  if (!boss) throw new HttpError(404, "Not found");
  const now = new Date();
  const key = { characterId, boss: bossId, period: periodOf(boss, now) };
  await db().$transaction(async (tx) => {
    const plan = await tx.bossPlan.findUnique({ where: { characterId_boss: { characterId, boss: bossId } } });
    if (!plan) throw new HttpError(409, `${boss.name} isn't in ${c.name}'s plan. Add it to the plan first.`);
    if (cleared) {
      await tx.bossClear.upsert({
        where: { characterId_boss_period: key },
        create: { ...key, difficulty: plan.difficulty, partySize: plan.partySize, clearedAt: now },
        update: {},
      });
    } else {
      await tx.bossClear.deleteMany({ where: key });
    }
  });
}
