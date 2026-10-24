-- CreateTable
CREATE TABLE "ChecklistTask" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "reset" TEXT NOT NULL,
    "weekday" INTEGER,
    "worlds" TEXT NOT NULL,
    "limitScope" TEXT NOT NULL,
    "limitCount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ChecklistPlan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "characterId" INTEGER NOT NULL,
    "task" TEXT NOT NULL,
    CONSTRAINT "ChecklistPlan_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChecklistTick" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "characterId" INTEGER NOT NULL,
    "task" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "doneAt" DATETIME NOT NULL,
    CONSTRAINT "ChecklistTick_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ChecklistTask_ownerId_idx" ON "ChecklistTask"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistPlan_characterId_task_key" ON "ChecklistPlan"("characterId", "task");

-- CreateIndex
CREATE INDEX "ChecklistTick_task_period_idx" ON "ChecklistTick"("task", "period");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistTick_characterId_task_period_key" ON "ChecklistTick"("characterId", "task", "period");
