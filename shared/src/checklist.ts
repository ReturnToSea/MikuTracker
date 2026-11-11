// The checklist's kinds of task, shared by the server and the app.
export const TASK_CATEGORIES = ["arcane", "sacred", "other"] as const; // Arcane symbols, Sacred symbols, Other
export type TaskCategory = (typeof TASK_CATEGORIES)[number];
export const TASK_RESETS = ["daily", "weekly", "none"] as const; // daily at 00:00 UTC, weekly on a day at 00:00 UTC, or a one-off
export type TaskReset = (typeof TASK_RESETS)[number];
export const LIMIT_SCOPES = ["character", "world", "account"] as const; // who shares a task's limit
export type LimitScope = (typeof LIMIT_SCOPES)[number];

// The game's weekly reset day (0 Sunday … 6 Saturday), at 00:00 UTC: Thursday since v.264 (Nov
// 2025, when weekly quests and content moved there from Monday; weekly bosses were already there).
export const WEEKLY_RESET_DAY = 4;
