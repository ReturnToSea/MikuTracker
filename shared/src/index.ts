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

// Saving settings: the theme, the world shown on Home, the price of a Black Flame (meso: at most
// 2,147,483,647, what the database column holds), or several.
export const settingsInput = z
  .strictObject({ theme: themeId.optional(), worldId: worldId.optional(), blackFlamePrice: z.number().int().min(0).max(2_147_483_647).optional() })
  .refine((s) => s.theme !== undefined || s.worldId !== undefined || s.blackFlamePrice !== undefined, { message: "Nothing to save" });
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

// The symbol calculator of a world: /api/symbols?world=45
export const symbolsQuery = z.strictObject({ world: worldId });

// One symbol of a character, as typed: its level (0: not unlocked), symbols held toward the next
// level, the days a week its daily is done, and its weekly clears (Arcane only). Whether the level
// and symbols held fit that symbol is checked by the server.
export const symbolInput = z.strictObject({
  level: z.number().int().min(0).max(20),
  held: z.number().int().min(0).max(100_000),
  days: z.number().int().min(0).max(7),
  weekly: z.number().int().min(0).max(3),
});
export type SymbolInput = z.infer<typeof symbolInput>;

// The gear tab of a world: /api/gear?world=45
export const gearQuery = z.strictObject({ world: worldId });

// What goes in one slot of the equipment window: a listed item (by its key), an unlisted one by
// name, or nothing. Whether the item fits the slot and the character is checked by the server.
export const gearInput = z
  .strictObject({
    item: z.string().regex(/^\d{7}(-\d)?$/, { message: "Unknown item" }).optional(),
    other: z.string().trim().min(1, { message: "Type the item's name" }).max(60).optional(),
    clear: z.literal(true).optional(),
  })
  .refine((v) => [v.item, v.other, v.clear].filter((x) => x !== undefined).length === 1, { message: "Choose an item, type one, or empty the slot" });
export type GearInput = z.infer<typeof gearInput>;

// v2.0.0: an item's stars, flames, potential and hammers (Save on the gear tab). Whether each value
// fits the item (its star limit, the flames and potential lines it can roll, its hammers) is checked
// by the server. A typed "Other item" also says what it is.
export const POTENTIAL_RANKS = ["rare", "epic", "unique", "legendary"] as const;
export const gearDetailsInput = z.strictObject({
  stars: z.number().int().min(0).max(30),
  // flame stat → tier, at most 4 different stats
  flames: z.record(z.string().max(20), z.number().int().min(1).max(7)).refine((f) => Object.keys(f).length <= 4, { message: "At most 4 flames" }),
  potential: z.strictObject({ rank: z.enum(POTENTIAL_RANKS), lines: z.array(z.string().max(80).nullable()).length(3) }).nullable(),
  hammers: z.number().int().min(0).max(3),
  // only for a typed "Other item"
  other: z
    .strictObject({
      kind: z.string().max(20),
      level: z.number().int().min(0).max(300),
      boss: z.boolean(),
      att: z.number().int().min(0).max(2000), // a weapon's base attack and magic attack (for its flames)
      matt: z.number().int().min(0).max(2000),
    })
    .optional(),
});
export type GearDetailsInput = z.infer<typeof gearDetailsInput>;

// What can be set on an item: a listed item by its key, or a typed one by what it is.
export const gearOptionsQuery = z.union([
  z.strictObject({ item: z.string().regex(/^\d{7}(-\d)?$/, { message: "Unknown item" }) }),
  z.strictObject({
    kind: z.string().max(20),
    level: z.coerce.number().int().min(0).max(300),
    boss: z.enum(["0", "1"]).transform((b) => b === "1"),
    att: z.coerce.number().int().min(0).max(2000),
    matt: z.coerce.number().int().min(0).max(2000),
  }),
]);

// One flame line's score in hundredths of a point (its value × what a point of it is worth), each line
// rounded on its own: the server and the page add scores up the same way.
export const flameLinePoints = (worth: number, value: number | null): number => Math.round(worth * (value ?? 0) * 100);

// The Flames page: the budget (meso per 1% final damage) its stop scores are for.
export const flamesQuery = z.strictObject({ budget: z.coerce.number().min(0).max(1e15) });
export type FlamesQuery = z.infer<typeof flamesQuery>;

// What each stat is worth to a character, in main stat (typed in on the gear tab).
export const STAT_VALUE_DEFAULTS = { att: 4, allStat: 10, secRatio: 0.125, bossDmg: 12, fdPer100: 0.785 } as const;
const statValue = z.number().min(0).max(10000);
export const statValuesInput = z.strictObject({ att: statValue, allStat: statValue, secRatio: statValue, bossDmg: statValue, fdPer100: statValue });
export type StatValuesInput = z.infer<typeof statValuesInput>;

// A new order for a world's character tabs: every one of its characters, once, first to last.
export const reorderInput = z.strictObject({
  world: worldId,
  ids: z.array(z.number().int().positive()).max(500),
});
export type ReorderInput = z.infer<typeof reorderInput>;
