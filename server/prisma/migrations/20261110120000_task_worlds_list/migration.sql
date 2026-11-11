-- v4.2.0: a task's worlds become a list of world IDs (Challenger, 900, joins Kronos and Hyperion).
-- "both" was Kronos and Hyperion; "45" and "70" are already lists of one.
UPDATE "ChecklistTask" SET "worlds" = '45,70' WHERE "worlds" = 'both';
