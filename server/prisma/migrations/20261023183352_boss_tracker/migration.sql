-- CreateTable
CREATE TABLE "BossPlan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "characterId" INTEGER NOT NULL,
    "boss" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "partySize" INTEGER NOT NULL,
    CONSTRAINT "BossPlan_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BossClear" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "characterId" INTEGER NOT NULL,
    "boss" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "partySize" INTEGER NOT NULL,
    "clearedAt" DATETIME NOT NULL,
    CONSTRAINT "BossClear_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "BossPlan_characterId_boss_key" ON "BossPlan"("characterId", "boss");

-- CreateIndex
CREATE UNIQUE INDEX "BossClear_characterId_boss_period_key" ON "BossClear"("characterId", "boss", "period");
