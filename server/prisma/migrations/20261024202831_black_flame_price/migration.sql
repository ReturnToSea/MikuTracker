-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Settings" (
    "ownerId" TEXT NOT NULL PRIMARY KEY,
    "theme" TEXT NOT NULL DEFAULT 'ren',
    "worldId" INTEGER NOT NULL DEFAULT 45,
    "blackFlamePrice" INTEGER NOT NULL DEFAULT 3000000,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Settings" ("ownerId", "theme", "updatedAt", "worldId") SELECT "ownerId", "theme", "updatedAt", "worldId" FROM "Settings";
DROP TABLE "Settings";
ALTER TABLE "new_Settings" RENAME TO "Settings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

