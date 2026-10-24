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
    CONSTRAINT "StatValues_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StatValues" ("allStat", "att", "bossDmg", "characterId", "fdPer100", "secRatio") SELECT "allStat", "att", "bossDmg", "characterId", "fdPer100", "secRatio" FROM "StatValues";
DROP TABLE "StatValues";
ALTER TABLE "new_StatValues" RENAME TO "StatValues";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

