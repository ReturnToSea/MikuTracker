-- AlterTable
ALTER TABLE "GearSlot" ADD COLUMN "details" TEXT;

-- CreateTable
CREATE TABLE "StatValues" (
    "characterId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "att" REAL NOT NULL,
    "allStat" REAL NOT NULL,
    "secRatio" REAL NOT NULL,
    "bossDmg" REAL NOT NULL,
    "hp" REAL NOT NULL,
    "fdPer100" REAL NOT NULL,
    CONSTRAINT "StatValues_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
