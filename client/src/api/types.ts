// What the server sends back (types only, taken from the server's own code so they can't drift).
import type { ThemeId } from "@miku/shared";
export type { SettingsView } from "../../../server/src/services/settings";
export type { ExpTableRow, ExpTableView } from "../../../server/src/routes/expTable";

export type ThemeArt = Record<ThemeId, string | null>;
