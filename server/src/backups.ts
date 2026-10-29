import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { utcDay } from "./calc/utcDays";
import { getConfig } from "./config";

// Copies of the database, one file per UTC day: miku-2026-10-23.db, plus one for each update of the
// always-on app that day, named by its UTC time: miku-2026-10-23-before-update-043612.db (v3.0.0:
// before, a second update on the same day replaced the first's copy; older copies are still named
// miku-2026-10-23-before-update.db). The Mac isn't
// always on, so nothing runs at a set time: a backup is made when the server starts and there's
// none from today, checked again every hour while it runs, before every update of the always-on
// app, and by hand (npm run backup). Adapted from Goal Tracker.
export const KEEP_DAILY = 30; // the newest 30 backups…
export const KEEP_MONTHS = 12; // …plus the first of each of the last 12 months
export const HOUR_MS = 60 * 60 * 1000;
const NAME = /^miku-(\d{4}-\d{2}-\d{2})(-before-update(?:-\d{6})?)?\.db$/;

export interface BackupPlace {
  dbFile: string;
  folder: string;
}

// The real database and its backups folder, from the settings.
export function backupPlace(): BackupPlace {
  const { databaseFile, backupDir } = getConfig();
  return { dbFile: databaseFile, folder: backupDir };
}

export interface BackupFile {
  name: string;
  day: string; // "2026-10-23" (UTC)
  beforeUpdate: boolean;
  sizeBytes: number;
  savedAt: Date;
}

// The backups in `folder`, newest first (on the same day, the one saved last first). Other
// files there are left alone.
export function listBackups(folder: string): BackupFile[] {
  if (!existsSync(folder)) return [];
  const files: BackupFile[] = [];
  for (const name of readdirSync(folder)) {
    const match = NAME.exec(name);
    if (!match) continue;
    const stat = statSync(path.join(folder, name));
    files.push({ name, day: match[1]!, beforeUpdate: match[2] !== undefined, sizeBytes: stat.size, savedAt: stat.mtime });
  }
  return files.sort((a, b) => b.day.localeCompare(a.day) || b.savedAt.getTime() - a.savedAt.getTime());
}

// For pruning, by name alone: newest day first, and on the same day the regular copy first.
const newestFirst = (a: Pick<BackupFile, "day" | "name">, b: Pick<BackupFile, "day" | "name">) => b.day.localeCompare(a.day) || b.name.localeCompare(a.name);

// The first day of the UTC month `months` before `today`'s: "2025-11-01" for 11 months before October 2026.
function monthStart(today: Date, months: number): string {
  return utcDay(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - months, 1)));
}

// Which backups to keep: the newest KEEP_DAILY, plus the oldest one of each of the last
// KEEP_MONTHS months (this month counts), so a mistake noticed weeks later can still be undone.
export function backupsToKeep(files: Pick<BackupFile, "day" | "name">[], today: Date): Set<string> {
  const sorted = [...files].sort(newestFirst);
  const keep = new Set(sorted.slice(0, KEEP_DAILY).map((f) => f.name));
  const since = monthStart(today, KEEP_MONTHS - 1);
  const monthly = new Map<string, string>();
  for (const f of sorted.toReversed()) {
    if (f.day >= since && !monthly.has(f.day.slice(0, 7))) monthly.set(f.day.slice(0, 7), f.name);
  }
  for (const name of monthly.values()) keep.add(name);
  return keep;
}

// Removes the backups no longer kept; returns their names.
export function pruneBackups(folder: string, today: Date): string[] {
  const files = listBackups(folder);
  const keep = backupsToKeep(files, today);
  const removed = files.filter((f) => !keep.has(f.name)).map((f) => f.name);
  for (const name of removed) rmSync(path.join(folder, name));
  return removed;
}

// Copies the database now (replacing today's regular copy; a before-update copy is its own), then prunes old ones.
// SQLite's own backup reads a consistent copy even while the app is writing. It's written
// under a temporary name first, so a copy cut short never looks like a finished backup; a
// leftover one from such a copy is cleared first (SQLite won't copy over it). Null when
// there's no database yet.
export async function makeBackup(place: BackupPlace, now: Date, beforeUpdate = false): Promise<BackupFile | null> {
  if (!existsSync(place.dbFile)) return null;
  mkdirSync(place.folder, { recursive: true });
  // (a before-update copy: its own, by the time; HHMMSS in UTC)
  const name = `miku-${utcDay(now)}${beforeUpdate ? `-before-update-${now.toISOString().slice(11, 19).replaceAll(":", "")}` : ""}.db`;
  const target = path.join(place.folder, name);
  const partial = `${target}.partial`;
  rmSync(partial, { force: true });
  // Stryker disable next-line ObjectLiteral,BooleanLiteral: read-only is a safeguard (a backup never writes) and the file was checked above
  const db = new Database(place.dbFile, { readonly: true, fileMustExist: true });
  try {
    await db.backup(partial);
  } finally {
    db.close();
  }
  renameSync(partial, target);
  pruneBackups(place.folder, now);
  return listBackups(place.folder).find((f) => f.name === name)!;
}

// A backup is due when there's no regular one from today (UTC) yet. A before-update copy doesn't
// count: it was taken before that day's changes.
export async function backupIfDue(place: BackupPlace, now: Date): Promise<BackupFile | null> {
  if (listBackups(place.folder).some((f) => f.day === utcDay(now) && !f.beforeUpdate)) return null;
  return makeBackup(place, now);
}

// While the server runs: check now, then every hour. A failed backup is reported, never fatal.
// Returns a function that stops the checks.
export function scheduleBackups(place: BackupPlace, report: (message: string, error: unknown) => void = console.error): () => void {
  const check = () => backupIfDue(place, new Date()).catch((error: unknown) => report("Backup failed:", error));
  void check();
  const timer = setInterval(check, HOUR_MS);
  timer.unref(); // never keeps the process alive on its own
  return () => clearInterval(timer);
}
