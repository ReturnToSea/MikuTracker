-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StatValues" (
    "characterId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "att" REAL,
    "allStat" REAL,
    "secRatio" REAL,
    "bossDmg" REAL,
    "fdPer100" REAL,
    "strPct" REAL,
    "dexPct" REAL,
    "intPct" REAL,
    "lukPct" REAL,
    "hpPct" REAL,
    "attPct" REAL,
    "critDmg" REAL,
    "ied300" REAL,
    "ied380" REAL,
    "bossDef" INTEGER NOT NULL DEFAULT 380,
    "cd2" REAL,
    "cd3" REAL,
    "cd4" REAL,
    "cd5" REAL,
    "cd6" REAL,
    "cdMin" INTEGER NOT NULL DEFAULT 0,
    "mainFlat" REAL,
    "typedBefore" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "StatValues_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StatValues" ("allStat", "att", "attPct", "bossDef", "bossDmg", "cd2", "cd3", "cd4", "cd5", "cd6", "cdMin", "characterId", "critDmg", "dexPct", "fdPer100", "hpPct", "ied300", "ied380", "intPct", "lukPct", "mainFlat", "secRatio", "strPct") SELECT "allStat", "att", "attPct", "bossDef", "bossDmg", "cd2", "cd3", "cd4", "cd5", "cd6", "cdMin", "characterId", "critDmg", "dexPct", "fdPer100", "hpPct", "ied300", "ied380", "intPct", "lukPct", "mainFlat", "secRatio", "strPct" FROM "StatValues";
DROP TABLE "StatValues";
ALTER TABLE "new_StatValues" RENAME TO "StatValues";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


-- v4.1.0: the values are worked out from the Stats page now. A character with a Stats page has what was
-- typed marked as typed before (the owner, 2026-11-04): it gives way to the worked-out values wherever the
-- page works them out, and still counts where it doesn't (a SHINE class, a sheet with no damage), so
-- nothing is lost. The settings stay.
UPDATE "StatValues" SET "typedBefore" = true WHERE "characterId" IN (SELECT "characterId" FROM "StatSheet");

-- Every character: a value still exactly its default was never typed (saving one box wrote the whole row,
-- the defaults with it, and the v2.3.0 columns started at them): empty, so a Stats page added later counts.
UPDATE "StatValues" SET "att" = NULL WHERE "att" = 4;
UPDATE "StatValues" SET "allStat" = NULL WHERE "allStat" = 14.65;
UPDATE "StatValues" SET "secRatio" = NULL WHERE "secRatio" = 0.125;
UPDATE "StatValues" SET "bossDmg" = NULL WHERE "bossDmg" = 12;
UPDATE "StatValues" SET "fdPer100" = NULL WHERE "fdPer100" = 0.785;
UPDATE "StatValues" SET "attPct" = NULL WHERE "attPct" = 53.82;
UPDATE "StatValues" SET "mainFlat" = NULL WHERE "mainFlat" = 0.29;
UPDATE "StatValues" SET "critDmg" = NULL WHERE "critDmg" = 42.38;
UPDATE "StatValues" SET "ied300" = NULL WHERE "ied300" = 15.6;
UPDATE "StatValues" SET "ied380" = NULL WHERE "ied380" = 20.52;
