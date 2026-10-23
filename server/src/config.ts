import "dotenv/config";
import os from "node:os";
import path from "node:path";

// Every setting the server uses, in one place. Each comes from an environment variable (or
// server/.env), with defaults for running on this Mac. Moving to a server or a Docker container
// means setting these, not changing code.

export interface Config {
  dataDir: string; // the database, backups, avatars and theme art live here
  databaseUrl: string; // "file:/…/miku.db" (SQLite); MIKU_DATABASE=dev picks dev.db, DATABASE_URL overrides both
  databaseFile: string;
  backupDir: string;
  themeArtDir: string;
  avatarDir: string; // character avatars, each named after its contents
  host: string;
  port: number;
  backups: boolean; // daily backups (off for the development copy)
  refresh: boolean; // the daily rankings refresh (off for the development copy)
  nexonRankingsUrl: string; // Nexon's public rankings data (NA); tests never reach it
  nexonImagesUrl: string | null; // a stand-in for Nexon's image servers, on this Mac only (the QA copy's fake Nexon)
}

type Env = Record<string, string | undefined>;

// The real data folder on this Mac. Tests may never put a database inside it.
export const realDataDir = (home: string) => path.join(home, "Library", "Application Support", "MikuTracker");

// Addresses that only this machine can reach. Listening anywhere else needs a login first.
const THIS_MACHINE = new Set(["127.0.0.1", "localhost", "::1"]);

// True when `file` is `folder` itself or anywhere inside it. Outside means the way there starts
// by going up a whole ".." folder (not a folder whose name merely starts with "..", like "..cache").
export function isInside(file: string, folder: string): boolean {
  const relative = path.relative(folder, file);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function onOff(env: Env, name: string): boolean {
  const value = env[name];
  if (value === undefined || value === "on") return true;
  if (value === "off") return false;
  throw new Error(`${name} must be "on" or "off" (it is "${value}")`);
}

// Which database in the data folder: the real one (only the always-on app uses it) or the
// development one (npm run dev and new migrations).
function databaseName(env: Env): string {
  const which = env.MIKU_DATABASE || "real";
  if (which === "real") return "miku.db";
  if (which === "dev") return "dev.db";
  throw new Error(`MIKU_DATABASE must be "real" or "dev" (it is "${which}")`);
}

// Where avatar downloads go instead of Nexon's image servers: only ever a fake on this Mac (the
// QA copy's), never somewhere else on the network.
function imagesUrl(value: string | undefined): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`NEXON_IMAGES_URL must be an address (it is "${value}")`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`NEXON_IMAGES_URL must be an http or https address (it is "${value}")`);
  const host = url.hostname;
  if (!["127.0.0.1", "localhost", "[::1]"].includes(host)) throw new Error(`NEXON_IMAGES_URL may only point at this Mac (it is "${value}")`);
  return value.replace(/\/+$/, "");
}

function port(value: string): number {
  const n = Number(value);
  if (!/^\d+$/.test(value) || n < 1 || n > 65535) throw new Error(`PORT must be a whole number from 1 to 65535 (it is "${value}")`);
  return n;
}

function host(env: Env): string {
  const value = env.HOST || "127.0.0.1";
  if (THIS_MACHINE.has(value)) return value;
  // Inside a Docker container the app has to listen on every address to be reachable at all;
  // the container's port must then be published to 127.0.0.1 only, until login exists.
  if (value === "0.0.0.0" && env.MIKU_IN_CONTAINER === "1") return value;
  throw new Error(
    `HOST "${value}" would let other machines connect, and there's no login yet. Use 127.0.0.1 (or, in Docker, HOST=0.0.0.0 with MIKU_IN_CONTAINER=1).`,
  );
}

// `env` and `home` are arguments so tests can pass made-up ones. The home folder comes from the
// HOME setting when there is one: a test run's fake HOME is then seen even in worker threads,
// where os.homedir() would still read the real one (mutation testing runs tests in threads).
export function loadConfig(env: Env = process.env, home: string = env.HOME || os.homedir()): Config {
  const testRun = Boolean(env.VITEST);
  // Vitest's config always sets a throwaway DATABASE_URL. A test run without one (started some
  // other way) would otherwise write fake data into the real database.
  if (testRun && !env.DATABASE_URL) throw new Error("Tests must use a throwaway database: run them with npm test (server/vitest.config.ts)");

  const dataDir = path.resolve(env.MIKU_DATA_DIR || realDataDir(home));
  const databaseUrl = env.DATABASE_URL || `file:${path.join(dataDir, databaseName(env))}`;
  if (!databaseUrl.startsWith("file:")) throw new Error(`Only SQLite databases ("file:…") are supported for now (DATABASE_URL is "${databaseUrl}")`);
  const databaseFile = path.resolve(databaseUrl.slice("file:".length));
  // The development database gets its own backups and avatars: clearing out avatars no character
  // uses, or old backups, must never touch the real app's files. Theme art is shared.
  const own = path.basename(databaseFile) === "dev.db" ? "dev-" : "";
  const folders = {
    backupDir: path.resolve(env.BACKUP_DIR || path.join(dataDir, `${own}backups`)),
    themeArtDir: path.resolve(env.THEME_ART_DIR || path.join(dataDir, "theme-art")),
    avatarDir: path.resolve(env.AVATAR_DIR || path.join(dataDir, `${own}avatars`)),
  };
  // A test run may not reach the real data folder at all: not its database, nor any folder.
  // Checked against the home folder given and the account's own (which a test's HOME can't hide).
  if (testRun) {
    const real = [realDataDir(home), realDataDir(os.userInfo().homedir)];
    for (const place of [databaseFile, dataDir, ...Object.values(folders)]) {
      if (real.some((r) => isInside(place, r))) throw new Error(`Tests may not use anything inside the real data folder (${place})`);
    }
  }

  return {
    dataDir,
    databaseUrl,
    databaseFile,
    ...folders,
    host: host(env),
    port: port(env.PORT ?? "4750"),
    backups: onOff(env, "MIKU_BACKUPS"),
    refresh: onOff(env, "MIKU_REFRESH"),
    nexonRankingsUrl: env.NEXON_RANKINGS_URL || "https://www.nexon.com/api/maplestory/no-auth/ranking/v2/na",
    nexonImagesUrl: imagesUrl(env.NEXON_IMAGES_URL),
  };
}

// Read once, the first time it's needed (not when this file is imported, so a bad setting
// shows up as a clear error where it's used).
let loaded: Config | undefined;
export function getConfig(): Config {
  loaded ??= loadConfig();
  return loaded;
}
