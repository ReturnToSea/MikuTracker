-- CreateTable
CREATE TABLE "FamiliarPlan" (
    "characterId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "data" TEXT NOT NULL,
    CONSTRAINT "FamiliarPlan_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
