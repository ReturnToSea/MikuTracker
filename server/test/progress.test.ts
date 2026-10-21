import { describe, expect, it, vi } from "vitest";
import { expToReach, totalExp } from "../src/calc/exp";
import { db } from "../src/db";
import { SOLE_OWNER } from "../src/owner";
import { api, ok } from "./api";
import { NOW, useDbTestSetup } from "./helpers";

useDbTestSetup();

// A character with a made-up history: its total EXP at the end of each UTC day.
async function withHistory(level: number, exp: number, days: [string, number][]) {
  const c = await db().character.create({
    data: { ownerId: SOLE_OWNER, worldId: 45, name: "MikuBeam", nameKey: "mikubeam", job: "Kanna", level, exp: BigInt(exp), worldRank: 1, sortOrder: 0, checkedAt: NOW },
  });
  for (const [day, total] of days) {
    await db().snapshot.create({ data: { characterId: c.id, day, capturedAt: NOW, level, exp: 0n, totalExp: BigInt(total), worldRank: 1 } });
  }
  return c.id;
}

describe("/api/characters/:id/progress", () => {
  it("gives the 14 finished UTC days, the stats, and the time to level at the daily average", async () => {
    // NOW is 19:00 UTC on Oct 20: today is the 20th, so the bars end on the 19th.
    const base = totalExp(285, 0);
    const id = await withHistory(285, 1_000, [
      ["2026-10-17", base],
      ["2026-10-18", base + 3e12],
      ["2026-10-19", base + 4e12],
    ]);
    const res = await ok(api().get(`/api/characters/${id}/progress`));
    expect(res.body.today).toBe("2026-10-20");
    expect(res.body.bars).toHaveLength(14);
    expect(res.body.bars.slice(-3)).toEqual([
      { day: "2026-10-17", gained: null, covers: 0 },
      { day: "2026-10-18", gained: 3e12, covers: 1 },
      { day: "2026-10-19", gained: 1e12, covers: 1 },
    ]);
    expect(res.body.stats).toEqual({ last7: 4e12, average: 2e12, best: { day: "2026-10-18", gained: 3e12 } });
    const toNext = expToReach(285, 1_000, 286);
    const toFive = expToReach(285, 1_000, 290);
    expect(res.body.goals).toEqual([
      { kind: "next-level", target: 286, remaining: toNext, days: toNext / 2e12 },
      { kind: "next-multiple-of-5", target: 290, remaining: toFive, days: toFive / 2e12 },
    ]);
  });

  it("a new character with only today's snapshot: no data yet, no estimate", async () => {
    const id = await withHistory(250, 0, [["2026-10-20", totalExp(250, 0)]]);
    const body = (await ok(api().get(`/api/characters/${id}/progress`))).body;
    expect(body.bars.every((b: { gained: null }) => b.gained === null)).toBe(true);
    expect(body.stats).toEqual({ last7: null, average: null, best: null });
    expect(body.goals.map((g: { days: null }) => g.days)).toEqual([null, null]);
  });

  it("goes by the UTC day: just after 00:00 UTC, yesterday's bar is finished", async () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 21, 0, 5))); // the 21st in UTC, still the 20th in California
    const id = await withHistory(250, 0, [["2026-10-19", 0], ["2026-10-20", 500]]);
    const body = (await ok(api().get(`/api/characters/${id}/progress`))).body;
    expect([body.today, body.bars.at(-1)]).toEqual(["2026-10-21", { day: "2026-10-20", gained: 500, covers: 1 }]);
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

  it("snapshots are put in day order, however they were saved", async () => {
    const id = await withHistory(250, 0, [["2026-10-19", 300], ["2026-10-17", 0], ["2026-10-18", 100]]);
    const body = (await ok(api().get(`/api/characters/${id}/progress`))).body;
    expect(body.bars.slice(-3).map((b: { gained: number | null }) => b.gained)).toEqual([null, 100, 200]);
  });

  it("only this character's snapshots count", async () => {
    const id = await withHistory(250, 0, [["2026-10-18", 0], ["2026-10-19", 100]]);
    const other = await db().character.create({
      data: { ownerId: SOLE_OWNER, worldId: 45, name: "Other", nameKey: "other", job: "Hero", level: 200, exp: 0n, worldRank: 1, sortOrder: 1, checkedAt: NOW },
    });
    await db().snapshot.create({ data: { characterId: other.id, day: "2026-10-19", capturedAt: NOW, level: 200, exp: 0n, totalExp: 99_999n, worldRank: 1 } });
    expect((await ok(api().get(`/api/characters/${id}/progress`))).body.stats.last7).toBe(100);
  });
});
