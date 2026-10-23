import { describe, expect, it, vi } from "vitest";
import { expToReach, totalExp } from "../src/calc/exp";
import { db } from "../src/db";
import { SOLE_OWNER } from "../src/owner";
import { api, ok } from "./api";
import { NOW, useDbTestSetup } from "./helpers";

useDbTestSetup();

const EARLIER = new Date(Date.UTC(2026, 9, 1));

// A character with a made-up history: its total EXP and the EXP gained on each UTC day.
async function withHistory(level: number, exp: number, days: [string, number, number][], addedAt = EARLIER) {
  const c = await db().character.create({
    data: { ownerId: SOLE_OWNER, worldId: 45, name: "MikuBeam", nameKey: "mikubeam", job: "Kanna", level, exp: BigInt(exp), worldRank: 1, sortOrder: 0, addedAt, checkedAt: NOW },
  });
  for (const [day, total, gained] of days) {
    await db().snapshot.create({ data: { characterId: c.id, day, capturedAt: NOW, level, exp: 0n, totalExp: BigInt(total), gained: BigInt(gained), worldRank: 1 } });
  }
  return c.id;
}
const progress = async (id: number) => (await ok(api().get(`/api/characters/${id}/progress`))).body;

describe("/api/characters/:id/progress", () => {
  it("gives 90 days of bars ending today, and each range's stats and time to level at its own average", async () => {
    // NOW is 19:00 UTC on Oct 20, so today is the 20th.
    const base = totalExp(285, 0);
    const id = await withHistory(285, 1_000, [
      ["2026-10-06", base, 0],
      ["2026-10-18", base + 3e12, 3e12],
      ["2026-10-19", base + 4e12, 1e12],
      ["2026-10-20", base + 7e12, 3e12],
    ]);
    const body = await progress(id);
    expect(body.today).toBe("2026-10-20");
    expect(body.bars).toHaveLength(90);
    expect(body.bars.slice(-3)).toEqual([
      { day: "2026-10-18", gained: 3e12, covers: 12 },
      { day: "2026-10-19", gained: 1e12, covers: 1 },
      { day: "2026-10-20", gained: 3e12, covers: 1 },
    ]);
    expect(body.ranges.map((r: { days: number }) => r.days)).toEqual([7, 14, 30, 90]);
    const [seven, fourteen] = body.ranges;
    // 7 days (the 14th to the 20th): from the end of the 6th, 14 days back
    expect(seven.stats).toMatchObject({ total: 7e12, average: 7e12 / 14 });
    // 14 days (the 7th to the 20th): from the end of the 6th too
    expect(fourteen.stats).toMatchObject({ total: 7e12, average: 7e12 / 14 });
    const toNext = expToReach(285, 1_000, 286);
    expect(seven.goals[0]).toEqual({ kind: "next-level", target: 286, remaining: toNext, days: toNext / (7e12 / 14) });
  });

  it("gives the level on each checked day, with level-ups", async () => {
    const start = totalExp(250, 0);
    const id = await withHistory(250, 0, [["2026-10-19", start, 0], ["2026-10-20", totalExp(251, 0), totalExp(251, 0) - start]]);
    expect((await progress(id)).levels).toEqual([
      { day: "2026-10-19", level: 250, reached: [], covers: 1 },
      { day: "2026-10-20", level: 251, reached: [251], covers: 1 },
    ]);
  });

  it("time to level follows each range's own average", async () => {
    const id = await withHistory(250, 0, [["2026-09-20", 0, 0], ["2026-10-13", 9e12, 9e12], ["2026-10-20", 9.7e12, 0.7e12]]);
    const ranges = (await progress(id)).ranges;
    // 7 days (14th–20th) from the end of the 13th; 14 and 30 from the end of Sep 20; 90 from where Sep 20 started (31 days)
    const averages = [0.7e12 / 7, 9.7e12 / 30, 9.7e12 / 30, 9.7e12 / 31];
    expect(ranges.map((r: { stats: { average: number } }) => r.stats.average)).toEqual(averages);
    const remaining = ranges[0].goals[0].remaining;
    expect(ranges.map((r: { goals: { days: number }[] }) => r.goals[0]!.days)).toEqual(averages.map((a) => remaining / a));
  });

  it("a character not checked since it was added: nothing to compare yet, no estimate", async () => {
    const id = await withHistory(250, 0, [["2026-10-20", totalExp(250, 0), 0]], NOW);
    const body = await progress(id);
    expect(body.bars.every((b: { gained: null }) => b.gained === null)).toBe(true);
    expect(body.levels).toEqual([]);
    expect(body.ranges.map((r: { stats: null; goals: { days: null }[] }) => [r.stats, r.goals.map((g) => g.days)])).toEqual(Array(4).fill([null, [null, null]]));
  });

  it("added and not checked again that day, but checked the next: its history shows", async () => {
    const c = await db().character.create({
      data: { ownerId: SOLE_OWNER, worldId: 45, name: "MikuBeam", nameKey: "mikubeam", job: "Kanna", level: 250, exp: 0n, worldRank: 1, sortOrder: 0, addedAt: new Date("2026-10-19T10:00:00Z"), checkedAt: NOW },
    });
    await db().snapshot.create({ data: { characterId: c.id, day: "2026-10-19", capturedAt: new Date("2026-10-19T10:00:00Z"), level: 250, exp: 0n, totalExp: 1_000n, gained: 0n, worldRank: 1 } });
    await db().snapshot.create({ data: { characterId: c.id, day: "2026-10-20", capturedAt: NOW, level: 250, exp: 0n, totalExp: 1_400n, gained: 400n, worldRank: 1 } });
    expect((await progress(c.id)).bars.slice(-2)).toEqual([
      { day: "2026-10-19", gained: 0, covers: 1 },
      { day: "2026-10-20", gained: 400, covers: 1 },
    ]);
  });

  it("once checked again (even with no EXP), today's bar shows", async () => {
    const id = await withHistory(250, 0, [["2026-10-20", totalExp(250, 0), 0]], new Date(NOW.getTime() - 1));
    expect((await progress(id)).bars.at(-1)).toEqual({ day: "2026-10-20", gained: 0, covers: 1 });
  });

  it("goes by the UTC day: just after 00:00 UTC, a new day's bar starts", async () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 21, 0, 5))); // the 21st in UTC, still the 20th in California
    const id = await withHistory(250, 0, [["2026-10-20", 500, 500], ["2026-10-21", 600, 100]]);
    const body = await progress(id);
    expect([body.today, body.bars.at(-1)]).toEqual(["2026-10-21", { day: "2026-10-21", gained: 100, covers: 1 }]);
  });

  it("time to level never runs backwards: a range where EXP went down gives no estimate", async () => {
    const id = await withHistory(250, 0, [["2026-10-19", 1_000, 0], ["2026-10-20", 900, -100]]);
    const [seven] = (await progress(id)).ranges;
    expect([seven.stats.total, seven.goals[0].days]).toEqual([-100, null]);
  });

  it("an unknown character, or another owner's, is not found", async () => {
    const theirs = await db().character.create({
      data: { ownerId: "someone-else", worldId: 45, name: "Theirs", nameKey: "theirs", job: "Hero", level: 200, exp: 0n, worldRank: 1, sortOrder: 0, checkedAt: NOW },
    });
    for (const id of [theirs.id, 999]) {
      const res = await api().get(`/api/characters/${id}/progress`);
      expect([res.status, res.body]).toEqual([404, { error: "Not found" }]);
    }
    expect((await api().get("/api/characters/abc/progress")).status).toBe(400);
  });

  it("only this character's snapshots count", async () => {
    const id = await withHistory(250, 0, [["2026-10-19", 0, 0], ["2026-10-20", 100, 100]]);
    const other = await db().character.create({
      data: { ownerId: SOLE_OWNER, worldId: 45, name: "Other", nameKey: "other", job: "Hero", level: 200, exp: 0n, worldRank: 1, sortOrder: 1, checkedAt: NOW },
    });
    await db().snapshot.create({ data: { characterId: other.id, day: "2026-10-20", capturedAt: NOW, level: 200, exp: 0n, totalExp: 99_999n, gained: 99_999n, worldRank: 1 } });
    expect((await progress(id)).ranges[0].stats.total).toBe(100);
  });
});
