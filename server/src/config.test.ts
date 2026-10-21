import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getConfig, isInside, loadConfig } from "./config";

// A made-up home folder, so nothing here depends on this Mac.
const HOME = "/Users/someone";
const REAL = "/Users/someone/Library/Application Support/MikuTracker";
// Settings as they'd be outside a test run (no VITEST).
const load = (env: Record<string, string> = {}) => loadConfig(env, HOME);

describe("defaults", () => {
  it("keeps everything in the real data folder and listens only on this Mac, port 4750", () => {
    expect(load()).toEqual({
      dataDir: REAL,
      databaseUrl: `file:${REAL}/miku.db`,
      databaseFile: `${REAL}/miku.db`,
      backupDir: `${REAL}/backups`,
      themeArtDir: `${REAL}/theme-art`,
      avatarDir: `${REAL}/avatars`,
      host: "127.0.0.1",
      port: 4750,
      backups: true,
      refresh: true,
      nexonRankingsUrl: "https://www.nexon.com/api/maplestory/no-auth/ranking/v2/na",
    });
  });
});

describe("overrides", () => {
  it("MIKU_DATA_DIR moves the database, backups and theme art with it", () => {
    const c = load({ MIKU_DATA_DIR: "/data" });
    expect([c.dataDir, c.databaseUrl, c.databaseFile, c.backupDir, c.themeArtDir, c.avatarDir]).toEqual([
      "/data",
      "file:/data/miku.db",
      "/data/miku.db",
      "/data/backups",
      "/data/theme-art",
      "/data/avatars",
    ]);
  });

  it("each folder and the database can be set on its own", () => {
    const c = load({ DATABASE_URL: "file:/elsewhere/dev.db", BACKUP_DIR: "/b", THEME_ART_DIR: "/art", AVATAR_DIR: "/av" });
    expect([c.dataDir, c.databaseUrl, c.databaseFile, c.backupDir, c.themeArtDir, c.avatarDir]).toEqual([REAL, "file:/elsewhere/dev.db", "/elsewhere/dev.db", "/b", "/art", "/av"]);
  });

  it("MIKU_DATABASE=dev picks the development database next to the real one", () => {
    expect(load({ MIKU_DATABASE: "dev" })).toMatchObject({ databaseUrl: `file:${REAL}/dev.db`, databaseFile: `${REAL}/dev.db` });
    expect(load({ MIKU_DATABASE: "real" }).databaseFile).toBe(`${REAL}/miku.db`);
    expect(load({ MIKU_DATABASE: "dev", MIKU_DATA_DIR: "/data" }).databaseFile).toBe("/data/dev.db");
  });

  it("DATABASE_URL wins over MIKU_DATABASE", () => {
    expect(load({ MIKU_DATABASE: "dev", DATABASE_URL: "file:/x/y.db" }).databaseFile).toBe("/x/y.db");
  });

  it("a relative database path is taken from the folder the server starts in", () => {
    expect(load({ DATABASE_URL: "file:./dev.db" }).databaseFile).toBe(`${process.cwd()}/dev.db`);
  });

  it("empty values count as not set", () => {
    expect(load({ MIKU_DATA_DIR: "", MIKU_DATABASE: "", DATABASE_URL: "", BACKUP_DIR: "", THEME_ART_DIR: "", AVATAR_DIR: "", HOST: "", NEXON_RANKINGS_URL: "" })).toEqual(load());
  });

  it("the port, and the other addresses that only reach this Mac", () => {
    expect(load({ PORT: "4751" }).port).toBe(4751);
    expect(load({ HOST: "localhost" }).host).toBe("localhost");
    expect(load({ HOST: "::1" }).host).toBe("::1");
  });

  it("the address of Nexon's rankings data can be changed", () => {
    expect(load({ NEXON_RANKINGS_URL: "http://127.0.0.1:9/fake" }).nexonRankingsUrl).toBe("http://127.0.0.1:9/fake");
  });

  it("backups and the daily refresh can be turned off (and explicitly on)", () => {
    expect(load({ MIKU_BACKUPS: "off", MIKU_REFRESH: "off" })).toMatchObject({ backups: false, refresh: false });
    expect(load({ MIKU_BACKUPS: "on", MIKU_REFRESH: "on" })).toMatchObject({ backups: true, refresh: true });
  });
});

describe("refusals", () => {
  it.each(["0.0.0.0", "192.168.1.20", "example.com"])("won't listen on %s without a login", (address) => {
    expect(() => load({ HOST: address })).toThrow(`HOST "${address}" would let other machines connect`);
  });

  it("allows 0.0.0.0 only inside a container, and only that address", () => {
    expect(load({ HOST: "0.0.0.0", MIKU_IN_CONTAINER: "1" }).host).toBe("0.0.0.0");
    expect(() => load({ HOST: "0.0.0.0", MIKU_IN_CONTAINER: "yes" })).toThrow("would let other machines connect");
    expect(() => load({ HOST: "192.168.1.20", MIKU_IN_CONTAINER: "1" })).toThrow("would let other machines connect");
  });

  it.each(["0", "65536", "abc", "47.5", "-1", " 4750", ""])("rejects PORT %j", (value) => {
    expect(() => load({ PORT: value })).toThrow(`PORT must be a whole number from 1 to 65535 (it is "${value}")`);
  });

  it("accepts the lowest and highest ports", () => {
    expect(load({ PORT: "1" }).port).toBe(1);
    expect(load({ PORT: "65535" }).port).toBe(65535);
  });

  it.each([
    ["MIKU_BACKUPS", "false"],
    ["MIKU_REFRESH", "OFF"],
  ])("rejects %s=%s (only on or off)", (name, value) => {
    expect(() => load({ [name]: value })).toThrow(`${name} must be "on" or "off" (it is "${value}")`);
  });

  it.each(["Dev", "test"])("rejects MIKU_DATABASE=%j (only real or dev)", (value) => {
    expect(() => load({ MIKU_DATABASE: value })).toThrow(`MIKU_DATABASE must be "real" or "dev" (it is "${value}")`);
  });

  it("only SQLite databases for now", () => {
    expect(() => load({ DATABASE_URL: "postgresql://localhost/miku" })).toThrow('Only SQLite databases ("file:…") are supported for now');
  });
});

describe("test runs can never reach the real data", () => {
  // As in a real test run: a throwaway data folder unless a test says otherwise.
  const testRun = (env: Record<string, string>) => loadConfig({ VITEST: "true", MIKU_DATA_DIR: "/tmp/t", ...env }, HOME);

  it("refuses a run that leaves the data folder at its real default", () => {
    expect(() => loadConfig({ VITEST: "true", DATABASE_URL: "file:/tmp/t/test.db" }, HOME)).toThrow(`Tests may not use anything inside the real data folder (${REAL})`);
  });

  it("refuses to run without a throwaway database", () => {
    expect(() => testRun({})).toThrow("Tests must use a throwaway database");
  });

  it("refuses a database inside the real data folder, at any depth", () => {
    expect(() => testRun({ DATABASE_URL: `file:${REAL}/miku.db` })).toThrow("Tests may not use anything inside the real data folder");
    expect(() => testRun({ DATABASE_URL: `file:${REAL}/old/copy.db` })).toThrow("Tests may not use anything inside the real data folder");
  });

  it.each(["MIKU_DATA_DIR", "BACKUP_DIR", "THEME_ART_DIR", "AVATAR_DIR"])("refuses %s inside the real data folder", (name) => {
    expect(() => testRun({ DATABASE_URL: "file:/tmp/t/test.db", [name]: `${REAL}/x` })).toThrow(`Tests may not use anything inside the real data folder (${REAL}/x`);
  });

  it("refuses the real data folder of the account's own home, whatever HOME says", () => {
    const own = path.join(os.userInfo().homedir, "Library", "Application Support", "MikuTracker");
    expect(() => testRun({ DATABASE_URL: "file:/tmp/t/test.db", THEME_ART_DIR: own })).toThrow("Tests may not use anything inside the real data folder");
    expect(() => testRun({ DATABASE_URL: `file:${own}/dev.db` })).toThrow("Tests may not use anything inside the real data folder");
  });

  it("this test run's home folder is a fake one in the temporary folder, and the config uses it", () => {
    const fakeHome = process.env.HOME!;
    expect(isInside(fakeHome, os.tmpdir())).toBe(true);
    expect(fakeHome).not.toBe(os.userInfo().homedir);
    // With no data folder given, the config falls back to the fake home's "real" data folder (and refuses it).
    expect(() => loadConfig({ VITEST: "true", DATABASE_URL: "file:/tmp/t/test.db", HOME: fakeHome })).toThrow(path.join(fakeHome, "Library", "Application Support", "MikuTracker"));
  });

  it("the home folder comes from HOME when set, else from the system", () => {
    expect(loadConfig({ HOME: "/Users/elsewhere" }).dataDir).toBe("/Users/elsewhere/Library/Application Support/MikuTracker");
    expect(loadConfig({}).dataDir).toBe(path.join(os.homedir(), "Library", "Application Support", "MikuTracker"));
  });

  it("allows a throwaway database elsewhere, even in a folder whose name starts the same", () => {
    expect(testRun({ DATABASE_URL: "file:/tmp/t/test.db" }).databaseFile).toBe("/tmp/t/test.db");
    expect(testRun({ DATABASE_URL: `file:${REAL}-old/test.db` }).databaseFile).toBe(`${REAL}-old/test.db`);
  });

  it("this test run is using a throwaway database in the temporary folder", () => {
    const c = getConfig();
    expect(isInside(c.databaseFile, os.tmpdir())).toBe(true);
    expect(isInside(c.databaseFile, c.dataDir)).toBe(true); // MIKU_DATA_DIR is the scratch folder too
    expect(c).toMatchObject({ backups: false, refresh: false });
  });

  it("getConfig reads the settings once and reuses them", () => {
    expect(getConfig()).toBe(getConfig());
  });
});

describe("isInside", () => {
  it("is true for the folder itself and anything under it", () => {
    expect(isInside("/a/b", "/a/b")).toBe(true);
    expect(isInside("/a/b/c.db", "/a/b")).toBe(true);
    expect(isInside("/a/b/c/d.db", "/a/b")).toBe(true);
  });

  it("is true inside a folder whose name merely starts with two dots", () => {
    expect(isInside("/a/b/..cache/c.db", "/a/b")).toBe(true);
    expect(isInside("/a/b/..", "/a/b/..")).toBe(true);
  });

  it("is false for a parent, a sibling, or a folder that only starts with the same name", () => {
    expect(isInside("/a", "/a/b")).toBe(false);
    expect(isInside("/a/c.db", "/a/b")).toBe(false);
    expect(isInside("/a/bc/d.db", "/a/b")).toBe(false);
    expect(isInside("/a/b/../c.db", "/a/b")).toBe(false);
  });
});
