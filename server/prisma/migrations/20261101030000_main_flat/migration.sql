-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StatValues" (
    "characterId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "att" REAL NOT NULL,
    "allStat" REAL NOT NULL,
    "secRatio" REAL NOT NULL,
    "bossDmg" REAL NOT NULL,
    "fdPer100" REAL NOT NULL,
    "strPct" REAL,
    "dexPct" REAL,
    "intPct" REAL,
    "lukPct" REAL,
    "hpPct" REAL,
    "attPct" REAL NOT NULL DEFAULT 53.82,
    "critDmg" REAL NOT NULL DEFAULT 42.38,
    "ied300" REAL NOT NULL DEFAULT 15.6,
    "ied380" REAL NOT NULL DEFAULT 20.52,
    "bossDef" INTEGER NOT NULL DEFAULT 380,
    "cd2" REAL,
    "cd3" REAL,
    "cd4" REAL,
    "cd5" REAL,
    "cd6" REAL,
    "cdMin" INTEGER NOT NULL DEFAULT 0,
    "mainFlat" REAL NOT NULL DEFAULT 0.29,
    CONSTRAINT "StatValues_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StatValues" ("allStat", "att", "attPct", "bossDef", "bossDmg", "cd2", "cd3", "cd4", "cd5", "cd6", "cdMin", "characterId", "critDmg", "dexPct", "fdPer100", "hpPct", "ied300", "ied380", "intPct", "lukPct", "secRatio", "strPct") SELECT "allStat", "att", "attPct", "bossDef", "bossDmg", "cd2", "cd3", "cd4", "cd5", "cd6", "cdMin", "characterId", "critDmg", "dexPct", "fdPer100", "hpPct", "ied300", "ied380", "intPct", "lukPct", "secRatio", "strPct" FROM "StatValues";
DROP TABLE "StatValues";
ALTER TABLE "new_StatValues" RENAME TO "StatValues";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

