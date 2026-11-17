import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { describe, expect, it } from "vitest";

// v4.3.0's migration, for GMS v.272's changes. On a database of its own, in memory (as v4.2.0's
// migration test does).
const SQL = readFileSync(path.join(import.meta.dirname, "../prisma/migrations/20261117120000_v272_changes/migration.sql"), "utf8").replace(/^\s*--.*$/gm, "");

function database() {
  const d = new DatabaseSync(":memory:");
  d.exec(`CREATE TABLE "SymbolState" ("id" INTEGER PRIMARY KEY, "weekly" INTEGER NOT NULL)`);
  d.exec(`CREATE TABLE "BossPlan" ("id" INTEGER PRIMARY KEY, "characterId" INTEGER NOT NULL, "boss" TEXT NOT NULL)`);
  d.exec(`CREATE TABLE "BossClear" ("id" INTEGER PRIMARY KEY, "boss" TEXT NOT NULL)`);
  d.exec(`CREATE TABLE "ChecklistPlan" ("id" INTEGER PRIMARY KEY, "characterId" INTEGER NOT NULL, "task" TEXT NOT NULL, UNIQUE ("characterId", "task"))`);
  d.exec(`CREATE TABLE "ChecklistTick" ("id" INTEGER PRIMARY KEY, "task" TEXT NOT NULL, "period" TEXT NOT NULL)`);
  return d;
}
const all = (d: DatabaseSync, table: string, columns: string) => d.prepare(`SELECT ${columns} FROM "${table}" ORDER BY "id"`).all();

describe("v4.3.0's migration: GMS v.272's changes", () => {
  it("the Arcane River weekly: 1–3 saved clears become done (1), none stays 0", () => {
    const d = database();
    for (const [id, weekly] of [[1, 0], [2, 1], [3, 2], [4, 3]] as const) d.prepare(`INSERT INTO "SymbolState" ("id", "weekly") VALUES (?, ?)`).run(id, weekly);
    d.exec(SQL);
    expect(all(d, "SymbolState", `"id", "weekly"`)).toEqual([{ id: 1, weekly: 0 }, { id: 2, weekly: 1 }, { id: 3, weekly: 1 }, { id: 4, weekly: 1 }]);
  });

  it("the plans for Hilla, Pink Bean and Cygnus go, every other boss's stay; past clears all stay", () => {
    const d = database();
    for (const [id, boss] of [[1, "zakum"], [2, "hilla"], [3, "pink_bean"], [4, "cygnus"], [5, "lotus"], [6, "verus_hilla"]] as const) {
      d.prepare(`INSERT INTO "BossPlan" ("id", "characterId", "boss") VALUES (?, 1, ?)`).run(id, boss);
      d.prepare(`INSERT INTO "BossClear" ("id", "boss") VALUES (?, ?)`).run(id, boss);
    }
    d.exec(SQL);
    expect(all(d, "BossPlan", `"boss"`).map((r) => r.boss)).toEqual(["zakum", "lotus", "verus_hilla"]);
    expect(all(d, "BossClear", `"boss"`).map((r) => r.boss)).toEqual(["zakum", "hilla", "pink_bean", "cygnus", "lotus", "verus_hilla"]);
  });

  it("a character planned for Monster Park Extreme plans Extreme Monster Parker; other tasks stay", () => {
    const d = database();
    for (const [id, characterId, task] of [[1, 1, "monster-park-extreme"], [2, 1, "monster-park"], [3, 2, "monster-park-extreme"], [4, 3, "epic-dungeon"]] as const) {
      d.prepare(`INSERT INTO "ChecklistPlan" ("id", "characterId", "task") VALUES (?, ?, ?)`).run(id, characterId, task);
    }
    d.exec(SQL);
    expect(all(d, "ChecklistPlan", `"characterId", "task"`)).toEqual([
      { characterId: 1, task: "extreme-monster-parker" },
      { characterId: 1, task: "monster-park" },
      { characterId: 2, task: "extreme-monster-parker" },
      { characterId: 3, task: "epic-dungeon" },
    ]);
  });

  it("Monster Park Extreme's ticks from v.272's first week (Thu 2026-11-12) on are the quest's (it counts toward this week's limit); earlier weeks' stay", () => {
    const d = database();
    for (const [id, task, period] of [
      [1, "monster-park-extreme", "week-2026-11-05"], // the last week with Monster Park Extreme
      [2, "monster-park-extreme", "week-2026-11-12"],
      [3, "monster-park-extreme", "week-2026-11-19"],
      [4, "monster-park", "2026-11-13"],
    ] as const) {
      d.prepare(`INSERT INTO "ChecklistTick" ("id", "task", "period") VALUES (?, ?, ?)`).run(id, task, period);
    }
    d.exec(SQL);
    expect(all(d, "ChecklistTick", `"task", "period"`)).toEqual([
      { task: "monster-park-extreme", period: "week-2026-11-05" },
      { task: "extreme-monster-parker", period: "week-2026-11-12" },
      { task: "extreme-monster-parker", period: "week-2026-11-19" },
      { task: "monster-park", period: "2026-11-13" },
    ]);
  });
});
