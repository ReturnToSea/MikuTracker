import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { describe, expect, it } from "vitest";

// v4.1.0's migration: the stat values become worked out from the Stats page; its clearing step, run on a
// database as it was (the reviews: never-typed defaults; nothing typed lost). On a database of its own, in
// memory, with the three tables it reads (writing the test database behind Prisma's back crashes the worker
// threads mutation testing runs the tests in).
const SQL = readFileSync(path.join(import.meta.dirname, "../prisma/migrations/20261104120000_stat_values_worked_out/migration.sql"), "utf8");
// (its comments taken out first: they have semicolons)
const clearing = SQL.slice(SQL.indexOf("-- v4.1.0:"))
  .replace(/^\s*--.*$/gm, "")
  .split(";")
  .map((x) => x.trim())
  .filter(Boolean);
const VALUES = ["att", "allStat", "secRatio", "bossDmg", "fdPer100", "strPct", "dexPct", "intPct", "lukPct", "hpPct", "attPct", "critDmg", "ied300", "ied380", "cd2", "cd3", "cd4", "cd5", "cd6", "mainFlat"];
const DEFAULTS = { att: 4, allStat: 14.65, secRatio: 0.125, bossDmg: 12, fdPer100: 0.785, attPct: 53.82, mainFlat: 0.29, critDmg: 42.38, ied300: 15.6, ied380: 20.52 };

function database() {
  const d = new DatabaseSync(":memory:");
  d.exec(`CREATE TABLE "Character" ("id" INTEGER PRIMARY KEY, "job" TEXT NOT NULL);
    CREATE TABLE "StatSheet" ("characterId" INTEGER PRIMARY KEY, "data" TEXT NOT NULL);
    CREATE TABLE "StatValues" ("characterId" INTEGER PRIMARY KEY, ${VALUES.map((v) => `"${v}" REAL`).join(", ")}, "bossDef" INTEGER NOT NULL DEFAULT 380, "cdMin" INTEGER NOT NULL DEFAULT 0, "typedBefore" BOOLEAN NOT NULL DEFAULT false);`);
  return d;
}
function character(d: DatabaseSync, id: number, job: string, sheet: boolean, values: Record<string, number>) {
  d.prepare(`INSERT INTO "Character" ("id", "job") VALUES (?, ?)`).run(id, job);
  if (sheet) d.prepare(`INSERT INTO "StatSheet" ("characterId", "data") VALUES (?, '{}')`).run(id);
  const row = { ...values, bossDef: 300, cdMin: 2 };
  d.prepare(`INSERT INTO "StatValues" ("characterId", ${Object.keys(row).map((k) => `"${k}"`).join(", ")}) VALUES (?, ${Object.keys(row).map(() => "?").join(", ")})`).run(id, ...Object.values(row));
}

describe("v4.1.0's migration: what's typed, marked to give way to the worked-out values", () => {
  it("a Stats page (any job): what's typed kept and marked as typed before; none: not marked; a never-typed default emptied everywhere", () => {
    const d = database();
    character(d, 1, "Ren", true, { ...DEFAULTS, att: 9, strPct: 13, cd4: 3.34 });
    character(d, 2, "Sia Astelle", true, { ...DEFAULTS, att: 9 });
    character(d, 3, "Night Walker", false, { ...DEFAULTS, critDmg: 50, lukPct: 12 });
    for (const statement of clearing) d.exec(statement);
    const row = (id: number) => d.prepare(`SELECT * FROM "StatValues" WHERE "characterId" = ?`).get(id);
    const none = Object.fromEntries(VALUES.map((k) => [k, null]));
    expect(row(1)).toEqual({ characterId: 1, ...none, att: 9, strPct: 13, cd4: 3.34, bossDef: 300, cdMin: 2, typedBefore: 1 });
    expect(row(2)).toEqual({ characterId: 2, ...none, att: 9, bossDef: 300, cdMin: 2, typedBefore: 1 });
    // (no Stats page: what was typed stays as typed, the defaults go)
    expect(row(3)).toEqual({ characterId: 3, ...none, critDmg: 50, lukPct: 12, bossDef: 300, cdMin: 2, typedBefore: 0 });
    expect(clearing.length).toBe(11);
    d.close();
  });
});
