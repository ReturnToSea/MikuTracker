-- CreateTable
CREATE TABLE "Character" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ownerId" TEXT NOT NULL,
    "worldId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "exp" BIGINT NOT NULL,
    "worldRank" INTEGER NOT NULL,
    "overallRank" INTEGER,
    "legionLevel" INTEGER,
    "raidPower" BIGINT,
    "sortOrder" INTEGER NOT NULL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "characterId" INTEGER NOT NULL,
    "capturedAt" DATETIME NOT NULL,
    "day" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "exp" BIGINT NOT NULL,
    "totalExp" BIGINT NOT NULL,
    "worldRank" INTEGER NOT NULL,
    "overallRank" INTEGER,
    "legionLevel" INTEGER,
    "raidPower" BIGINT,
    CONSTRAINT "Snapshot_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Avatar" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "characterId" INTEGER NOT NULL,
    "file" TEXT NOT NULL,
    "firstSeenAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL,
    CONSTRAINT "Avatar_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Selection" (
    "ownerId" TEXT NOT NULL,
    "worldId" INTEGER NOT NULL,
    "characterId" INTEGER NOT NULL,

    PRIMARY KEY ("ownerId", "worldId"),
    CONSTRAINT "Selection_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Character_ownerId_worldId_sortOrder_idx" ON "Character"("ownerId", "worldId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Character_ownerId_worldId_nameKey_key" ON "Character"("ownerId", "worldId", "nameKey");

-- CreateIndex
CREATE INDEX "Snapshot_characterId_capturedAt_idx" ON "Snapshot"("characterId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Avatar_characterId_file_key" ON "Avatar"("characterId", "file");

-- CreateIndex
CREATE UNIQUE INDEX "Selection_characterId_key" ON "Selection"("characterId");
