-- CreateTable
CREATE TABLE "SymbolState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "characterId" INTEGER NOT NULL,
    "symbol" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "held" INTEGER NOT NULL,
    "days" INTEGER NOT NULL,
    "weekly" INTEGER NOT NULL,
    CONSTRAINT "SymbolState_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SymbolState_characterId_symbol_key" ON "SymbolState"("characterId", "symbol");
