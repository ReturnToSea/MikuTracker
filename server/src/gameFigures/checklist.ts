import { type LimitScope, type TaskCategory, type TaskReset, WEEKLY_RESET_DAY } from "@miku/shared";

// The checklist's preset tasks: GMS's dailies and weeklies, by category, with their level and
// their limits. Sources (checked 2026-10-23):
//   - Resets: daily content at 00:00 UTC; weekly content at Thursday 00:00 UTC since v.264
//     (13 Nov 2025, "Weekly Reset Unification": the Arcane River weeklies, Dojo, weekly quests,
//     Legion's Weekly Dragon Extermination and the Sol Erda weekly moved from Monday). Epic
//     Dungeons: "Entry count and dungeon progress resets every Thursday at 12:00 AM UTC" (v.267).
//     Culvert's score "resets weekly on Thursday" (MapleStory Wiki). Flag Race: Thursday (the
//     owner; not documented in what was found).
//   - Areas and levels: Nexon's patch notes v.259–v.271 and the MapleStory Wiki (Geardock added
//     in v.270).
//   - Limits: Monster Park, 2 characters a day per world, each up to 7 runs (v.269; the owner);
//     Ursus, 3 entries a day per account (wiki); Erda's Request, weekly, once per account (v.264);
//     Epic Dungeons, "Up to two Epic Dungeons can be cleared once a week per account. Each
//     character can clear only one Epic Dungeon type per week." (v.267), so one "Epic Dungeon"
//     task per character, 2 per account; Monster Park Extreme, 2 characters per world a week
//     (v.260); Legion's Weekly Dragon Extermination, once per world (Legion is per world).
//   - Monster Park Extreme may be removed in November 2026 (the wiki): drop it then.
// Re-check after each GMS patch.
export const CHECKLIST_PATCH = "v.271";

export interface TaskFigure {
  id: string;
  name: string;
  category: TaskCategory;
  reset: TaskReset;
  weekday: number | null; // a weekly task's reset day (0 Sunday … 6 Saturday), at 00:00 UTC
  level: number | null; // the level it needs, shown as a reminder
  limit: { scope: LimitScope; count: number } | null; // shared between characters; null: each character on its own
}

const daily = (id: string, name: string, category: TaskCategory, level: number | null, limit: TaskFigure["limit"] = null): TaskFigure => ({ id, name, category, reset: "daily", weekday: null, level, limit });
const weekly = (id: string, name: string, category: TaskCategory, level: number | null, limit: TaskFigure["limit"] = null): TaskFigure => ({ id, name, category, reset: "weekly", weekday: WEEKLY_RESET_DAY, level, limit });

export const PRESET_TASKS: readonly TaskFigure[] = [
  daily("vanishing-journey", "Vanishing Journey", "arcane", 200),
  daily("chu-chu-island", "Chu Chu Island", "arcane", 210),
  daily("lachelein", "Lachelein", "arcane", 220),
  daily("arcana", "Arcana", "arcane", 225),
  daily("morass", "Morass", "arcane", 230),
  daily("esfera", "Esfera", "arcane", 235),
  daily("cernium", "Cernium", "sacred", 260),
  daily("hotel-arcus", "Hotel Arcus", "sacred", 265),
  daily("odium", "Odium", "sacred", 270),
  daily("shangri-la", "Shangri-La", "sacred", 275),
  daily("arteria", "Arteria", "sacred", 280),
  daily("carcion", "Carcion", "sacred", 285),
  daily("tallahart", "Tallahart", "sacred", 290),
  daily("geardock", "Geardock", "sacred", 295),
  daily("monster-park", "Monster Park", "other", 105, { scope: "world", count: 2 }),
  daily("ursus", "Ursus", "other", 100, { scope: "account", count: 1 }),
  weekly("erda-spectrum", "Erda Spectrum", "arcane", 200),
  weekly("hungry-muto", "Hungry Muto", "arcane", 210),
  weekly("midnight-chaser", "Midnight Chaser", "arcane", 220),
  weekly("spirit-savior", "Spirit Savior", "arcane", 225),
  weekly("ranheim-defense", "Ranheim Defense", "arcane", 230),
  weekly("esfera-guardian", "Esfera Guardian", "arcane", 235),
  weekly("erdas-request", "Erda's Request", "other", 260, { scope: "account", count: 1 }),
  weekly("epic-dungeon", "Epic Dungeon", "other", 260, { scope: "account", count: 2 }),
  weekly("monster-park-extreme", "Monster Park Extreme", "other", 260, { scope: "world", count: 2 }),
  weekly("legion-dragon", "Legion Weekly Dragon", "other", null, { scope: "world", count: 1 }),
  weekly("guild-culvert", "Guild Culvert", "other", 101),
  weekly("guild-flag-race", "Guild Flag Race", "other", 101),
  weekly("mu-lung-dojo", "Mu Lung Dojo", "other", 105),
];
