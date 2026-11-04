// What the server sends back (types only, taken from the server's own code so they can't drift).
import type { ThemeId } from "@miku/shared";
export type { SettingsView } from "../../../server/src/services/settings";
export type { ExpTableRow, ExpTableView } from "../../../server/src/routes/expTable";
export type { CharacterList, CharacterView } from "../../../server/src/services/characters";
export type { SearchResult } from "../../../server/src/services/search";
export type { RefreshStatus } from "../../../server/src/services/refresh";
export type { ProgressView } from "../../../server/src/services/progress";
export type { DayBar, LevelPoint } from "../../../server/src/calc/dailyGains";
export type { LevelGoal } from "../../../server/src/calc/levelGoals";
export type { BossBoard, BossCharacter, BossInfo, BossRow } from "../../../server/src/services/bosses";
export type { ChecklistBoard, ChecklistCharacter, LimitUse, TaskView } from "../../../server/src/services/checklist";
export type { SymbolInfo, SymbolsBoard, SymbolsCharacter } from "../../../server/src/services/symbols";
export type { DetailOptions, GearBoard, GearCharacter, GearItemView } from "../../../server/src/services/gear";
export type { FlameGraph, FlameItem, FlamesBoard } from "../../../server/src/services/flames";
export type { StarForceBoard, StarForceDetail, StarForceItem, StarForceRow } from "../../../server/src/services/starForce";
export type { PotentialBoard, PotentialGraph, PotentialItem } from "../../../server/src/services/potential";
export type { CubeMetrics } from "../../../server/src/calc/potential";
export type { Cube } from "../../../server/src/gameFigures/cubes";
export type { UpgradeStep, UpgradeSystem, UpgradesBoard } from "../../../server/src/services/upgrades";
export type { HexaBoard, HexaCharacter, HexaNodeView, HexaOrderStep, HexaStatView, HexaTabs } from "../../../server/src/services/hexa";

export type ThemeArt = Record<ThemeId, string | null>;
export type { BadgeView, FamiliarBoard } from "../../../server/src/services/familiars";
export type { StatsBoard } from "../../../server/src/services/stats";
