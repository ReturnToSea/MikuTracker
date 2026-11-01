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
// 2,147,483,647, what the database column holds), the MVP tier (its Star Force discount), or several.
export const MVP_TIERS = ["none", "silver", "gold", "diamond"] as const;
export const settingsInput = z
  .strictObject({ theme: themeId.optional(), worldId: worldId.optional(), blackFlamePrice: z.number().int().min(0).max(2_147_483_647).optional(), mvp: z.enum(MVP_TIERS).optional() })
  .refine((s) => Object.keys(s).length > 0, { message: "Nothing to save" });
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
  // Star Force (v2.2.0): what a boom costs (replacing or restoring it, in meso; none: 0), and the fixed
  // modes for an item too rare to risk ("1144", "4444"; none: the cheapest per star)
  boomCost: z.number().int().min(0).max(1e15).optional(),
  safety: z.enum(["1144", "4444"]).optional(),
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

// An item's ignore defense lines combined as in game (v2.3.0): each line leaves 1 − its share of the enemy's
// defense, multiplied in the lines' order (`left`); the combined share is worth `worth` main stat a percent.
// In hundredths of a point, so the server and the page add a score up the same way.
export const iedLinePoints = (worth: number, left: number): number => Math.round(worth * (1 - left) * 100 * 100);

// The Star Force page: the events on (any of them, comma separated), the budget its stop stars are for,
// and for one item the star to plan to.
export const SF_EVENTS = ["thirtyOff", "fewerBooms", "fiveTenFifteen", "plusOne"] as const;
const sfEvents = z
  .string()
  .max(100)
  .default("")
  .transform((s) => (s ? s.split(",") : []))
  .pipe(z.array(z.enum(SF_EVENTS)));
export const starForceQuery = z.strictObject({ events: sfEvents, budget: z.coerce.number().min(0).max(1e15) });
export const starForceItemQuery = z.strictObject({ events: sfEvents, target: z.coerce.number().int().min(1).max(30) });

// The Flames page: the budget (meso per 1% final damage) its stop scores are for.
export const flamesQuery = z.strictObject({ budget: z.coerce.number().min(0).max(1e15) });
export type FlamesQuery = z.infer<typeof flamesQuery>;

// The Potential page (v2.3.0): the events on (Double Miracle Time, a cube sale), the budget its stop
// scores are for, and for one item's graph a score to see the cost of reaching.
export const CUBE_EVENTS = ["miracle", "sale"] as const;
const cubeEvents = z
  .string()
  .max(100)
  .default("")
  .transform((s) => (s ? s.split(",") : []))
  .pipe(z.array(z.enum(CUBE_EVENTS)));
export const potentialQuery = z.strictObject({ events: cubeEvents, budget: z.coerce.number().min(0).max(1e15) });
export const potentialItemQuery = z.strictObject({ events: cubeEvents, target: z.coerce.number().min(0).max(1e6).optional() });

// The Upgrades page (v2.4.0): the Star Force page's events and the Potential page's, each as on its page.
export const upgradesQuery = z.strictObject({ sf: sfEvents, cubes: cubeEvents });

// What each stat is worth to a character, in main stat (typed in on the gear tab), one set shared by
// every page. The first five from v2.1.0 (all stat % was 10 until v2.3.0: below a main stat % line,
// which it includes); the potential lines' from v2.3.0, from the owner's MapleScouter sheet. 1% of each
// stat (STR, DEX, INT, LUK, and HP for a Demon Avenger) is its own value, empty until typed: then the
// job's default (STAT_PCT_DEFAULTS). Ignore defense is worth more against tougher bosses: one value for
// 300% defense, one for 380%, and which applies. Skill cooldown isn't worth the same each second (it
// depends on the class's skills): the final damage at 2 to 6 s in all (v2.4.1), each empty until typed;
// and the seconds a hat must keep (0: none). 1 main stat that % doesn't multiply (v3.1.0: HEXA Stat's
// main stat lines; MapleScouter's "Not Affected by % STR", the owner's sheet: 0.29).
export const COOLDOWN_SECONDS = [2, 3, 4, 5, 6] as const;
const statValue = z.number().min(0).max(10000);
export const statValuesInput = z.strictObject({
  att: statValue,
  allStat: statValue,
  secRatio: statValue,
  bossDmg: statValue,
  fdPer100: statValue,
  strPct: statValue.nullable(),
  dexPct: statValue.nullable(),
  intPct: statValue.nullable(),
  lukPct: statValue.nullable(),
  hpPct: statValue.nullable(),
  attPct: statValue,
  mainFlat: statValue,
  critDmg: statValue,
  ied300: statValue,
  ied380: statValue,
  bossDef: z.union([z.literal(300), z.literal(380)]),
  cd2: statValue.nullable(),
  cd3: statValue.nullable(),
  cd4: statValue.nullable(),
  cd5: statValue.nullable(),
  cd6: statValue.nullable(),
  cdMin: z.union([z.literal(0), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
});
export type StatValuesInput = z.infer<typeof statValuesInput>;
// 1% of a stat until typed: a main stat 12.97, a secondary stat 1.68 (the owner's sheet); Xenon's three
// main stats a third of a main stat each.
export const STAT_PCT_DEFAULTS = { main: 12.97, secondary: 1.68 } as const;
export const STAT_VALUE_DEFAULTS: Readonly<StatValuesInput> = { att: 4, allStat: 14.65, secRatio: 0.125, bossDmg: 12, fdPer100: 0.785, strPct: null, dexPct: null, intPct: null, lukPct: null, hpPct: null, attPct: 53.82, mainFlat: 0.29, critDmg: 42.38, ied300: 15.6, ied380: 20.52, bossDef: 380, cd2: null, cd3: null, cd4: null, cd5: null, cd6: null, cdMin: 0 };

// A new order for a world's character tabs: every one of its characters, once, first to last.
export const reorderInput = z.strictObject({
  world: worldId,
  ids: z.array(z.number().int().positive()).max(500),
});
export type ReorderInput = z.infer<typeof reorderInput>;

// ── v3.0.0: HEXA (6th job) ─────────────────────────────────────────────────────────────────────

// The HEXA page of a world: /api/hexa?world=45
export const hexaQuery = z.strictObject({ world: worldId });

// A job's HEXA nodes in GMS (Oct 2026): Origin and Ascent (skill nodes), four Mastery, four Boost
// (Enhancement), and three Common: Sol Janus, Sol Hecate and the job's 5th job common boost.
export const HEXA_NODES = ["origin", "ascent", "mastery1", "mastery2", "mastery3", "mastery4", "boost1", "boost2", "boost3", "boost4", "janus", "hecate", "common3"] as const;
export type HexaNode = (typeof HEXA_NODES)[number];
// The Epic Dungeon a character does each week for Sol Erda Fragments (none: no dungeon).
export const EPIC_DUNGEONS = ["none", "highMountain", "anglerCompany", "nightmareParadise"] as const;

// The input's limits (the game's): a node's level, a HEXA Stat line's level, a HEXA Stat node's rank.
export const HEXA_LEVEL_MAX = 30;
export const HEXA_LINE_MAX = 10;
export const HEXA_RANK_MAX = 20;
const hexaLevel = z.number().int().min(0).max(HEXA_LEVEL_MAX);
const hexaLevels = z.strictObject(Object.fromEntries(HEXA_NODES.map((n) => [n, hexaLevel])) as Record<HexaNode, typeof hexaLevel>);
// The stats a HEXA Stat line can be (main stat: flat, % doesn't multiply it).
export const HEXA_STATS = ["mainStat", "att", "bossDmg", "ied", "dmg", "critDmg"] as const;
export type HexaStat = (typeof HEXA_STATS)[number];
// One HEXA Stat line as typed: its stat (null: not picked yet) and its level (0–10).
const hexaStatLine = z.strictObject({ stat: z.enum(HEXA_STATS).nullable(), level: z.number().int().min(0).max(HEXA_LINE_MAX) });
// One HEXA Stat node as typed: its main line and its two additional lines (20 levels in all at most,
// three different stats), and whether it's unlocked (a node with any level is).
const hexaStat = z
  .strictObject({ lines: z.tuple([hexaStatLine, hexaStatLine, hexaStatLine]), unlocked: z.boolean() })
  .refine((s) => s.lines[0].level + s.lines[1].level + s.lines[2].level <= HEXA_RANK_MAX, { message: "A HEXA Stat node's three lines are 20 levels at most" })
  .refine((s) => new Set(s.lines.map((l) => l.stat).filter((x) => x !== null)).size === s.lines.filter((l) => l.stat !== null).length, { message: "A HEXA Stat node's three lines are three different stats" });
// A character's HEXA page, as typed (v3.0.0): each node's level now and the level wanted (Origin is at
// least 1: the 6th job gives it), the three HEXA Stat nodes (a stat is the main line of one node at
// most), whether Sol Janus counts in the totals, and the fragment calculator: fragments owned, fragments
// a day from farming, Erda's Request, the Epic Dungeon.
export const hexaInput = z
  .strictObject({
    current: hexaLevels,
    desired: hexaLevels,
    stats: z.tuple([hexaStat, hexaStat, hexaStat]),
    janus: z.boolean(),
    owned: z.number().int().min(0).max(10_000_000),
    perDay: z.number().min(0).max(100_000),
    erdaRequest: z.boolean(),
    dungeon: z.enum(EPIC_DUNGEONS),
  })
  .refine((h) => h.current.origin >= 1, { message: "Origin is at least level 1 (the 6th job gives it)" })
  .refine((h) => { const mains = h.stats.map((s) => s.lines[0].stat).filter((x) => x !== null); return new Set(mains).size === mains.length; }, { message: "A stat is the main line of one HEXA Stat node at most" });
export type HexaInput = z.infer<typeof hexaInput>;
// A new character's: Origin 1, everything else 0, every node wanted at 30, no HEXA Stat.
export const HEXA_DEFAULTS: HexaInput = {
  current: Object.fromEntries(HEXA_NODES.map((n) => [n, n === "origin" ? 1 : 0])) as Record<HexaNode, number>,
  desired: Object.fromEntries(HEXA_NODES.map((n) => [n, HEXA_LEVEL_MAX])) as Record<HexaNode, number>,
  stats: [0, 1, 2].map(() => ({ lines: [0, 1, 2].map(() => ({ stat: null, level: 0 })), unlocked: false })) as HexaInput["stats"],
  janus: false,
  owned: 0,
  perDay: 0,
  erdaRequest: false,
  dungeon: "none",
};
