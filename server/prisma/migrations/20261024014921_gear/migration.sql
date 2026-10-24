-- CreateTable
CREATE TABLE "GearSlot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "characterId" INTEGER NOT NULL,
    "slot" TEXT NOT NULL,
    "item" TEXT,
    "other" TEXT,
    CONSTRAINT "GearSlot_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "GearSlot_characterId_slot_key" ON "GearSlot"("characterId", "slot");
