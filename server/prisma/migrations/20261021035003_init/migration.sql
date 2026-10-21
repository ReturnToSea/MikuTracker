-- CreateTable
CREATE TABLE "Settings" (
    "ownerId" TEXT NOT NULL PRIMARY KEY,
    "theme" TEXT NOT NULL DEFAULT 'ren',
    "worldId" INTEGER NOT NULL DEFAULT 45,
    "updatedAt" DATETIME NOT NULL
);
