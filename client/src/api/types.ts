// What the server sends back (types only, taken from the server's own code so they can't drift).
import type { ThemeId } from "@miku/shared";
export type { SettingsView } from "../../../server/src/services/settings";
export type { ExpTableRow, ExpTableView } from "../../../server/src/routes/expTable";
export type { CharacterList, CharacterView } from "../../../server/src/services/characters";
export type { SearchResult } from "../../../server/src/services/search";
export type { RefreshStatus } from "../../../server/src/services/refresh";
export type { ProgressView } from "../../../server/src/services/progress";
export type { DayBar } from "../../../server/src/calc/dailyGains";
export type { LevelGoal } from "../../../server/src/calc/levelGoals";

export type ThemeArt = Record<ThemeId, string | null>;
