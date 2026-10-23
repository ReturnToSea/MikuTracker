// Backups, on real files in throwaway folders inside the test run's own data folder (never from
// getConfig(): see CLAUDE.md's testing rules). Adapted from Goal Tracker's tests.
import { mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { backupIfDue, backupPlace, backupsToKeep, HOUR_MS, KEEP_DAILY, KEEP_MONTHS, listBackups, makeBackup, pruneBackups, scheduleBackups, type BackupPlace } from "./backups";
import { addUtcDays } from "./calc/utcDays";

const day = (s: string) => new Date(`${s}T12:00:00Z`); // noon UTC
const named = (days: string[]) => days.map((d) => ({ day: d, name: `miku-${d}.db` }));
const daysFrom = (start: string, count: number) => Array.from({ length: count }, (_, i) => addUtcDays(start, i));

let dir: string;
let place: BackupPlace;
beforeEach(() => {
  mkdirSync(process.env.MIKU_DATA_DIR!, { recursive: true });
  dir = mkdtempSync(path.join(process.env.MIKU_DATA_DIR!, "backups-test-"));
  place = { dbFile: path.join(dir, "miku.db"), folder: path.join(dir, "backups") };
  const db = new Database(place.dbFile);
  db.exec("CREATE TABLE Note (text TEXT); INSERT INTO Note VALUES ('first')");
  db.close();
});
afterEach(() => {
  vi.useRealTimers();
  rmSync(dir, { recursive: true, force: true });
});

const notes = (file: string) => {
  const db = new Database(file, { readonly: true });
  const rows = db.prepare("SELECT text FROM Note").all();
  db.close();
  return rows;
};

describe("which backups are kept", () => {
  it("keeps the newest 30, plus the first of each month", () => {
    // Aug 1 – Sep 9: 40 daily backups. The newest 30 are Aug 11 – Sep 9; Aug 1 stays as August's first.
    const keep = backupsToKeep(named(daysFrom("2026-08-01", 40)), day("2026-09-09"));
    expect([...keep].sort()).toEqual(["miku-2026-08-01.db", ...daysFrom("2026-08-11", 30).map((d) => `miku-${d}.db`)]);
  });

  it("keeps monthly ones for 12 months, this month included", () => {
    // One backup on the 15th of each month from Jan 2025 to Sep 2026 (21), none newer.
    const months = Array.from({ length: 21 }, (_, i) => new Date(Date.UTC(2025, i, 15)).toISOString().slice(0, 10));
    const keep = backupsToKeep(named(months), day("2026-09-28"));
    expect(keep.size).toBe(21); // all within the newest 30
    const old = named([...daysFrom("2026-09-01", 30), ...months]);
    const keptOld = [...backupsToKeep(old, day("2026-09-30"))].filter((n) => n < "miku-2026-09");
    // Oct 2025 – Aug 2026 (11 months) plus September itself from its first day make the 12.
    expect(keptOld.sort()).toEqual(months.slice(9, 20).map((d) => `miku-${d}.db`));
  });

  it("counts a before-update copy like any other, the regular one of the day first", () => {
    const files = [
      { day: "2026-09-28", name: "miku-2026-09-28-before-update.db" },
      ...named(daysFrom("2026-08-30", 30)), // Aug 30 – Sep 28
    ];
    const keep = backupsToKeep(files, day("2026-09-28"));
    expect(keep.has("miku-2026-09-28.db")).toBe(true);
    expect(keep.has("miku-2026-09-28-before-update.db")).toBe(true);
    expect(keep.has("miku-2026-08-31.db")).toBe(true); // 30th newest
    expect(keep.has("miku-2026-08-30.db")).toBe(true); // 31st, but August's first
    expect(keep.size).toBe(31);
  });

  it("keeps the regular copy over the before-update one when only one of a day fits", () => {
    const files = [
      { day: "2026-08-19", name: "miku-2026-08-19-before-update.db" }, // listed first on purpose
      ...named(["2026-08-01", "2026-08-19", ...daysFrom("2026-08-20", 29)]), // Aug 19 is the 30th newest day
    ];
    const keep = backupsToKeep(files, day("2026-09-17"));
    expect(keep.has("miku-2026-08-19.db")).toBe(true);
    expect(keep.has("miku-2026-08-19-before-update.db")).toBe(false);
    expect(keep.size).toBe(31); // + Aug 1, August's first
  });

  it("over 400 days of daily backups, always has the last 30 days and one for each of the last 12 months", () => {
    let files: { day: string; name: string }[] = [];
    for (const d of daysFrom("2025-06-01", 400)) {
      files.push(...named([d]));
      const keep = backupsToKeep(files, day(d));
      files = files.filter((f) => keep.has(f.name));
      expect(files.length).toBeLessThanOrEqual(KEEP_DAILY + KEEP_MONTHS);
      const days = new Set(files.map((f) => f.day));
      const last30 = daysFrom(addUtcDays(d, -(KEEP_DAILY - 1)), KEEP_DAILY).filter((x) => x >= "2025-06-01");
      for (const x of last30) expect(days.has(x)).toBe(true);
      const months = new Set(files.map((f) => f.day.slice(0, 7)));
      for (let m = 0; m < KEEP_MONTHS; m++) {
        const month = new Date(Date.UTC(day(d).getUTCFullYear(), day(d).getUTCMonth() - m, 1)).toISOString().slice(0, 7);
        if (month >= "2025-06") expect(months.has(month)).toBe(true);
      }
    }
  });
});

describe("making backups", () => {
  it("copies the database into the backups folder, named by the day", async () => {
    const made = await makeBackup(place, day("2026-09-28"));
    expect(made).toMatchObject({ name: "miku-2026-09-28.db", day: "2026-09-28", beforeUpdate: false });
    expect(made!.sizeBytes).toBeGreaterThan(0);
    expect(made!.savedAt).toBeInstanceOf(Date);
    expect(notes(path.join(place.folder, "miku-2026-09-28.db"))).toEqual([{ text: "first" }]);
    expect(readdirSync(place.folder)).toEqual(["miku-2026-09-28.db"]); // nothing half-written left behind
  });

  it("replaces the same day's copy, and keeps a before-update copy separately", async () => {
    await makeBackup(place, day("2026-09-28"));
    const db = new Database(place.dbFile);
    db.exec("INSERT INTO Note VALUES ('second')");
    db.close();
    await makeBackup(place, day("2026-09-28"));
    expect(notes(path.join(place.folder, "miku-2026-09-28.db"))).toEqual([{ text: "first" }, { text: "second" }]);
    const before = await makeBackup(place, day("2026-09-28"), true);
    expect(before).toMatchObject({ name: "miku-2026-09-28-before-update.db", beforeUpdate: true });
    // Saved last, listed first.
    utimesSync(path.join(place.folder, "miku-2026-09-28.db"), day("2026-09-28"), new Date(Date.UTC(2026, 8, 28, 7, 18)));
    utimesSync(path.join(place.folder, "miku-2026-09-28-before-update.db"), day("2026-09-28"), new Date(Date.UTC(2026, 8, 28, 7, 22)));
    expect(listBackups(place.folder).map((f) => f.name)).toEqual(["miku-2026-09-28-before-update.db", "miku-2026-09-28.db"]);
    utimesSync(path.join(place.folder, "miku-2026-09-28.db"), day("2026-09-28"), new Date(Date.UTC(2026, 8, 28, 7, 30)));
    expect(listBackups(place.folder).map((f) => f.name)).toEqual(["miku-2026-09-28.db", "miku-2026-09-28-before-update.db"]);
  });

  it("returns the backup it just made, even when a newer day's is there", async () => {
    mkdirSync(place.folder);
    writeFileSync(path.join(place.folder, "miku-2026-09-29.db"), "newer");
    expect((await makeBackup(place, day("2026-09-28")))!.name).toBe("miku-2026-09-28.db");
  });

  it("always closes the database it read, even when the copy fails", async () => {
    const close = vi.spyOn(Database.prototype, "close");
    await makeBackup(place, day("2026-09-28"));
    expect(close).toHaveBeenCalledTimes(1);
    vi.spyOn(Database.prototype, "backup").mockRejectedValueOnce(new Error("disk full"));
    await expect(makeBackup(place, day("2026-09-28"))).rejects.toThrow("disk full");
    expect(close).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });

  it("a copy cut short never looks like a finished backup (it's written under a temporary name first)", async () => {
    const backup = vi.spyOn(Database.prototype, "backup").mockImplementationOnce(async (file: string) => {
      writeFileSync(file, "half a copy");
      throw new Error("the Mac went to sleep");
    });
    await expect(makeBackup(place, day("2026-09-28"))).rejects.toThrow("the Mac went to sleep");
    expect(backup.mock.calls[0]![0]).toBe(path.join(place.folder, "miku-2026-09-28.db.partial"));
    expect(listBackups(place.folder)).toEqual([]);
    vi.restoreAllMocks();
    // still due, and the next try works despite the half copy left behind
    expect((await backupIfDue(place, day("2026-09-28")))!.name).toBe("miku-2026-09-28.db");
    expect(notes(path.join(place.folder, "miku-2026-09-28.db"))).toEqual([{ text: "first" }]);
    expect(readdirSync(place.folder)).toEqual(["miku-2026-09-28.db"]);
  });

  it("does nothing when there's no database yet", async () => {
    rmSync(place.dbFile);
    expect(await makeBackup(place, day("2026-09-28"))).toBeNull();
    expect(listBackups(place.folder)).toEqual([]);
  });

  it("prunes old ones after each backup", async () => {
    mkdirSync(place.folder);
    for (const d of daysFrom("2026-08-01", 40)) writeFileSync(path.join(place.folder, `miku-${d}.db`), "old");
    await makeBackup(place, day("2026-09-10"));
    const names = listBackups(place.folder).map((f) => f.name);
    expect(names).toHaveLength(31); // Aug 12 – Sep 10, plus Aug 1
    expect(names[0]).toBe("miku-2026-09-10.db");
    expect(names.at(-1)).toBe("miku-2026-08-01.db");
  });

  it("lists only backups, newest first, and leaves other files alone", () => {
    mkdirSync(place.folder);
    for (const name of ["miku-2026-09-01.db", "notes.txt", "old-miku-2026-09-04.db", "miku-2026-09-03-before-update.db", "miku-2026-09-02.db.partial", "miku-2026-09-02.db"]) {
      writeFileSync(path.join(place.folder, name), "x");
    }
    expect(listBackups(place.folder).map((f) => [f.name, f.day, f.beforeUpdate])).toEqual([
      ["miku-2026-09-03-before-update.db", "2026-09-03", true],
      ["miku-2026-09-02.db", "2026-09-02", false],
      ["miku-2026-09-01.db", "2026-09-01", false],
    ]);
    expect(pruneBackups(place.folder, day("2026-09-28"))).toEqual([]);
    expect(readdirSync(place.folder)).toContain("notes.txt");
    expect(listBackups(path.join(dir, "missing"))).toEqual([]);
  });
});

describe("when backups happen", () => {
  it("backs up once a day: when there's none from today yet", async () => {
    expect((await backupIfDue(place, day("2026-09-28")))!.name).toBe("miku-2026-09-28.db");
    expect(await backupIfDue(place, day("2026-09-28"))).toBeNull();
    expect((await backupIfDue(place, day("2026-09-29")))!.name).toBe("miku-2026-09-29.db");
  });

  it("a before-update copy doesn't count as today's backup (it was taken before the day's changes)", async () => {
    await makeBackup(place, day("2026-09-28"), true);
    expect((await backupIfDue(place, day("2026-09-28")))!.name).toBe("miku-2026-09-28.db");
    expect(await backupIfDue(place, day("2026-09-28"))).toBeNull();
    expect(listBackups(place.folder).map((f) => f.name).sort()).toEqual(["miku-2026-09-28-before-update.db", "miku-2026-09-28.db"]);
  });

  it("checks when the server starts, then every hour, until stopped", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 28, 23, 30)));
    const stop = scheduleBackups(place);
    await vi.waitFor(() => expect(listBackups(place.folder).map((f) => f.day)).toEqual(["2026-09-28"]));
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 29, 0, 29))); // just before the next check
    expect(listBackups(place.folder)).toHaveLength(1);
    vi.setSystemTime(new Date(Date.UTC(2026, 8, 28, 23, 30)));
    await vi.advanceTimersByTimeAsync(HOUR_MS - 1);
    expect(listBackups(place.folder)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1); // 00:30 UTC on the 29th (still the 28th in California)
    await vi.waitFor(() => expect(listBackups(place.folder).map((f) => f.day)).toEqual(["2026-09-29", "2026-09-28"]));
    stop();
    await vi.advanceTimersByTimeAsync(2 * 24 * HOUR_MS);
    expect(listBackups(place.folder)).toHaveLength(2);
  });

  it("never keeps the server running just for the hourly check", async () => {
    const unref = vi.fn();
    const handle = { unref } as unknown as NodeJS.Timeout;
    vi.spyOn(globalThis, "setInterval").mockReturnValue(handle);
    const clear = vi.spyOn(globalThis, "clearInterval").mockImplementation(() => {});
    const stop = scheduleBackups(place);
    expect(unref).toHaveBeenCalledTimes(1);
    stop();
    expect(clear).toHaveBeenCalledWith(handle);
    await vi.waitFor(() => expect(listBackups(place.folder)).toHaveLength(1));
    vi.restoreAllMocks();
  });

  it("reports a failed backup instead of stopping the server", async () => {
    const report = vi.fn();
    const broken = { dbFile: dir, folder: place.folder }; // a folder isn't a database
    const stop = scheduleBackups(broken, report);
    await vi.waitFor(() => expect(report).toHaveBeenCalledWith("Backup failed:", expect.any(Error)));
    stop();
  });
});

describe("backup days are UTC days", () => {
  it("named by the UTC day, whatever the Mac's time zone", async () => {
    // 01:00 UTC on Sep 29 is still the evening of Sep 28 in California
    expect((await makeBackup(place, new Date(Date.UTC(2026, 8, 29, 1))))!.name).toBe("miku-2026-09-29.db");
    expect(await backupIfDue(place, new Date(Date.UTC(2026, 8, 29, 23, 59)))).toBeNull();
    expect((await backupIfDue(place, new Date(Date.UTC(2026, 8, 30, 0, 1))))!.name).toBe("miku-2026-09-30.db");
  });

  it("the 12 months are UTC months: on Oct 1 at 01:00 UTC, October counts as this month", () => {
    const files = named(["2025-10-31", "2025-11-01", ...daysFrom("2026-08-02", 60)]);
    const keep = backupsToKeep(files, new Date(Date.UTC(2026, 9, 1, 1)));
    expect([keep.has("miku-2025-11-01.db"), keep.has("miku-2025-10-31.db")]).toEqual([true, false]);
  });
});

describe("where backups go", () => {
  it("the real database and the backups folder from the settings (here, the test run's own)", () => {
    expect(backupPlace()).toEqual({ dbFile: process.env.DATABASE_URL!.replace(/^file:/, ""), folder: path.join(process.env.MIKU_DATA_DIR!, "backups") });
  });
});
