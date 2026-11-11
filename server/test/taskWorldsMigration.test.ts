import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { describe, expect, it } from "vitest";

// v4.2.0's migration: a custom task's worlds become a list (Challenger joins); "both" was Kronos and
// Hyperion. On a database of its own, in memory (as v4.1.0's migration test does).
const SQL = readFileSync(path.join(import.meta.dirname, "../prisma/migrations/20261110120000_task_worlds_list/migration.sql"), "utf8").replace(/^\s*--.*$/gm, "");

describe("v4.2.0's migration: a task's worlds as a list", () => {
  it("“both” becomes Kronos and Hyperion (not Challenger); one world stays as it was", () => {
    const d = new DatabaseSync(":memory:");
    d.exec(`CREATE TABLE "ChecklistTask" ("id" INTEGER PRIMARY KEY, "worlds" TEXT NOT NULL)`);
    for (const [id, worlds] of [[1, "both"], [2, "45"], [3, "70"]] as const) d.prepare(`INSERT INTO "ChecklistTask" ("id", "worlds") VALUES (?, ?)`).run(id, worlds);
    d.exec(SQL);
    expect(d.prepare(`SELECT "id", "worlds" FROM "ChecklistTask" ORDER BY "id"`).all()).toEqual([{ id: 1, worlds: "45,70" }, { id: 2, worlds: "45" }, { id: 3, worlds: "70" }]);
  });
});
