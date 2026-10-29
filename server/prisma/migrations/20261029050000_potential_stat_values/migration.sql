-- v2.3.0: the potential lines' stat values (each stat's 1% empty until typed: the job's default), ignore
-- defense at 300% and 380% boss defense and which applies, and the skill cooldown's worth (empty until typed).
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
    "cooldown" REAL,
    CONSTRAINT "StatValues_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StatValues" ("allStat", "att", "bossDmg", "characterId", "fdPer100", "secRatio") SELECT "allStat", "att", "bossDmg", "characterId", "fdPer100", "secRatio" FROM "StatValues";
DROP TABLE "StatValues";
ALTER TABLE "new_StatValues" RENAME TO "StatValues";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


-- 1% All Stat's default became 14.65 (10 counted an All Stats line below the main stat % line it includes).
-- 10 was only ever the default, so rows still at exactly 10 move to the new one; a value the owner typed stays.
UPDATE "StatValues" SET "allStat" = 14.65 WHERE "allStat" = 10;
