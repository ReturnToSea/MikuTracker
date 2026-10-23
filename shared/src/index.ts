// Input rules shared by the API (server/) and the app (client/), written with zod.
import { z } from "zod";
import { WORLDS } from "./worlds";

export * from "./levels";
export * from "./worlds";

// The themes the app offers. Ren is the default (dark first).
export const THEMES = ["ren", "pochacco"] as const;
export type ThemeId = (typeof THEMES)[number];
export const themeId = z.enum(THEMES);



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

// Saving settings: the theme, the world shown on Home, or both.
export const settingsInput = z
  .strictObject({ theme: themeId.optional(), worldId: worldId.optional() })
  .refine((s) => s.theme !== undefined || s.worldId !== undefined, { message: "Nothing to save" });
export type SettingsInput = z.infer<typeof settingsInput>;

// Adding a character: looked up again by the server, never taken from the page as is.
export const addCharacterInput = z.strictObject({ world: worldId, name: characterName });
export type AddCharacterInput = z.infer<typeof addCharacterInput>;

// The characters of a world: /api/characters?world=45
export const characterListQuery = z.strictObject({ world: worldId });

// A new order for a world's character tabs: every one of its characters, once, first to last.
export const reorderInput = z.strictObject({
  world: worldId,
  ids: z.array(z.number().int().positive()).max(500),
});
export type ReorderInput = z.infer<typeof reorderInput>;
