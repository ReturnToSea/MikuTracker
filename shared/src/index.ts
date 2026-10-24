// Input rules shared by the API (server/) and the app (client/), written with zod.
import { z } from "zod";
import { DIFFICULTIES } from "./bosses";
import { LIMIT_SCOPES, TASK_CATEGORIES, TASK_RESETS, TASK_WORLDS } from "./checklist";
import { WORLDS } from "./worlds";

export * from "./bosses";
export * from "./checklist";
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

// The Bosses tab for a world: /api/bosses?world=45
export const bossBoardQuery = z.strictObject({ world: worldId });

// A character's boss plan: every boss it does, each once, with the difficulty and party size.
// Whether the boss, its difficulty and the party size exist in the game is checked by the server
// against its price list.
export const bossPlanInput = z.strictObject({
  plan: z
    .array(z.strictObject({ boss: z.string().min(1).max(40), difficulty: z.enum(DIFFICULTIES), partySize: z.number().int().min(1).max(6) }))
    .max(100)
    .refine((plan) => new Set(plan.map((p) => p.boss)).size === plan.length, { message: "Each boss can be planned once" }),
});
export type BossPlanInput = z.infer<typeof bossPlanInput>;

// Ticking a planned boss as cleared this week (this month for a monthly one), or unticking it.
export const bossClearInput = z.strictObject({ cleared: z.boolean() });

// The checklist of a world: /api/checklist?world=45
export const checklistQuery = z.strictObject({ world: worldId });

// A task id: a preset's ("cernium", "ursus") or a custom task's ("custom-12").
const taskId = z.string().regex(/^[a-z0-9-]{1,40}$/, { message: "Unknown task" });

// A character's checklist plan: the tasks it does, each once.
export const checklistPlanInput = z.strictObject({
  tasks: z
    .array(taskId)
    .max(200)
    .refine((tasks) => new Set(tasks).size === tasks.length, { message: "Each task can be planned once" }),
});

// Ticking a planned task as done this period, or unticking it.
export const checklistTickInput = z.strictObject({ done: z.boolean() });

// Your own task. A weekly one names its reset day (0 Sunday … 6 Saturday, at 00:00 UTC); a limit
// per world or account says how many characters may do it each period.
export const customTaskInput = z
  .strictObject({
    name: z.string().trim().min(1, { message: "Give the task a name" }).max(40),
    category: z.enum(TASK_CATEGORIES),
    reset: z.enum(TASK_RESETS),
    weekday: z.number().int().min(0).max(6).nullable(),
    worlds: z.enum(TASK_WORLDS),
    limitScope: z.enum(LIMIT_SCOPES),
    limitCount: z.number().int().min(1).max(50),
  })
  .refine((t) => (t.reset === "weekly") === (t.weekday !== null), { message: "A weekly task needs its reset day, and only a weekly one has one" });
export type CustomTaskInput = z.infer<typeof customTaskInput>;

// A new order for a world's character tabs: every one of its characters, once, first to last.
export const reorderInput = z.strictObject({
  world: worldId,
  ids: z.array(z.number().int().positive()).max(500),
});
export type ReorderInput = z.infer<typeof reorderInput>;
