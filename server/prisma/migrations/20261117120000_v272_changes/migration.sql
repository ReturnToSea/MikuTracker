-- GMS v.272 (v4.3.0): the Arcane River weekly quest is once a week (saved clears become done or not);
-- Hard Hilla, Chaos Pink Bean and Normal Cygnus became daily bosses and Easy Cygnus was removed (their
-- plans go; past clears stay); Monster Park Extreme became the Extreme Monster Parker weekly quest (the
-- characters planned for it plan the quest instead; a tick from v.272's first week on, 2026-11-12, was
-- for the quest, Monster Park Extreme being gone, so it moves too; earlier weeks' ticks stay as history).
UPDATE "SymbolState" SET "weekly" = 1 WHERE "weekly" > 1;
DELETE FROM "BossPlan" WHERE "boss" IN ('hilla', 'pink_bean', 'cygnus');
UPDATE "ChecklistPlan" SET "task" = 'extreme-monster-parker' WHERE "task" = 'monster-park-extreme';
UPDATE "ChecklistTick" SET "task" = 'extreme-monster-parker' WHERE "task" = 'monster-park-extreme' AND "period" >= 'week-2026-11-12';
