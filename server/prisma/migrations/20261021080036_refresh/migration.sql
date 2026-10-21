-- DropIndex
DROP INDEX "Snapshot_characterId_capturedAt_idx";

-- AlterTable
ALTER TABLE "Character" ADD COLUMN "avatarUrl" TEXT;
ALTER TABLE "Character" ADD COLUMN "missingSince" DATETIME;

-- CreateTable
CREATE TABLE "RefreshRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "startedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME,
    "checked" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "missing" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "problem" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "Snapshot_characterId_day_key" ON "Snapshot"("characterId", "day");

