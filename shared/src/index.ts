// Input rules shared by the API (server/) and the app (client/), written with zod.
import { z } from "zod";

// The themes the app offers. Ren is the default (dark first).
export const THEMES = ["ren", "pochacco"] as const;
export type ThemeId = (typeof THEMES)[number];
export const themeId = z.enum(THEMES);

// Saving settings: only the theme for now; the selected world joins in v0.5.0.
export const settingsInput = z.strictObject({ theme: themeId });
export type SettingsInput = z.infer<typeof settingsInput>;
