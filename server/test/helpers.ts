import { afterAll, beforeEach, vi } from "vitest";
import { db } from "../src/db";
import { Prisma } from "../src/generated/prisma/client";

export { db };

// Every table, read from the generated client, so a new table is cleared without anyone having
// to remember to add it here.
export const MODELS = Object.values(Prisma.ModelName);
type Table = { deleteMany(): Prisma.PrismaPromise<unknown>; count(): Promise<number> };
const table = (model: string) => (db() as unknown as Record<string, Table>)[model[0]!.toLowerCase() + model.slice(1)]!;

export async function resetDb() {
  await db().$transaction(MODELS.map((m) => table(m).deleteMany()));
}

export async function tableCounts() {
  return Object.fromEntries(await Promise.all(MODELS.map(async (m) => [m, await table(m).count()] as const)));
}

// Tests start at a fixed moment: Tue 20 Oct 2026, 19:00 UTC (noon in California). Only Date is
// faked, so timers and the database driver keep working normally.
export const NOW = new Date(Date.UTC(2026, 9, 20, 19, 0, 0));

// Every database test starts from an empty database at NOW.
export function useDbTestSetup() {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    await resetDb();
  });
  afterAll(async () => {
    vi.useRealTimers();
    await db().$disconnect();
  });
}
