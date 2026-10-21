-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Snapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "characterId" INTEGER NOT NULL,
    "capturedAt" DATETIME NOT NULL,
    "day" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "exp" BIGINT NOT NULL,
    "totalExp" BIGINT NOT NULL,
    "gained" BIGINT NOT NULL DEFAULT 0,
    "worldRank" INTEGER NOT NULL,
    "overallRank" INTEGER,
    "legionLevel" INTEGER,
    "raidPower" BIGINT,
    CONSTRAINT "Snapshot_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Snapshot" ("capturedAt", "characterId", "day", "exp", "id", "legionLevel", "level", "overallRank", "raidPower", "totalExp", "worldRank") SELECT "capturedAt", "characterId", "day", "exp", "id", "legionLevel", "level", "overallRank", "raidPower", "totalExp", "worldRank" FROM "Snapshot";
DROP TABLE "Snapshot";
ALTER TABLE "new_Snapshot" RENAME TO "Snapshot";
CREATE UNIQUE INDEX "Snapshot_characterId_day_key" ON "Snapshot"("characterId", "day");
-- Existing days: the change since the character's snapshot before (as the chart worked it out
-- until now). A character's first snapshot gets 0: the checks before it weren't kept.
UPDATE "Snapshot" SET "gained" = COALESCE("totalExp" - (
  SELECT p."totalExp" FROM "Snapshot" p
  WHERE p."characterId" = "Snapshot"."characterId" AND p."day" < "Snapshot"."day"
  ORDER BY p."day" DESC LIMIT 1
), 0);
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

