// Input rules shared by the API (server/) and the app (client/), written with zod.
import { z } from "zod";
import { WORLDS } from "./worlds";

export * from "./worlds";

// The themes the app offers. Ren is the default (dark first).
export const THEMES = ["ren", "pochacco"] as const;
export type ThemeId = (typeof THEMES)[number];
export const themeId = z.enum(THEMES);

// Saving settings: only the theme for now; the selected world joins in v0.5.0.
export const settingsInput = z.strictObject({ theme: themeId });
export type SettingsInput = z.infer<typeof settingsInput>;

// A world MikuTracker tracks (45 Kronos, 70 Hyperion), from a form or an address.
export const worldId = z.coerce.number().refine((id) => WORLDS.some((w) => w.id === id), { message: "Unknown world" });

// A GMS character name: 1–12 letters and numbers (no spaces or symbols). Spaces around it are ignored.
export const characterName = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{1,12}$/, { message: "Names are 1–12 letters and numbers" });

// Looking a character up on a world: /api/search?world=45&name=…
export const searchQuery = z.strictObject({ world: worldId, name: characterName });
export type SearchQuery = z.infer<typeof searchQuery>;
