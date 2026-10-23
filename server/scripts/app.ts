// The always-on app (see src/launchAgent.ts). It runs from its own copy of the latest finished
// version (the main branch) in ~/Library/Application Support/MikuTracker/app, so work in progress
// in this checkout never reaches it. Adapted from Goal Tracker.
//   npm run app:install    set it up and start it at every login
//   npm run app:restart    after a new version: copy main and build it, rehearse it on a copy of the
//                          data, then stop, back up, update the database, swap, start
//   npm run app:rehearse   only the rehearsal: the new version on a copy of the data (nothing real changes)
//   npm run app:status     is it running?
//   npm run app:uninstall  stop it and remove it (your data and backups stay)
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { backupPlace, makeBackup } from "../src/backups";
import { getConfig, realDataDir } from "../src/config";
import { LABEL, launchAgentPlist, logFile, plistFile } from "../src/launchAgent";

const RELEASE = "main";
const PORT = 4750;
const REHEARSAL_PORT = 4756;
const checkout = path.resolve(import.meta.dirname, "../..");
const home = os.homedir();
const appDir = path.join(realDataDir(home), "app");
const domain = `gui/${process.getuid!()}`;
const run = (cmd: string, args: string[], cwd: string) => execFileSync(cmd, args, { cwd, stdio: "inherit", env: { ...process.env, CHECKPOINT_DISABLE: "1" } });
const quiet = (cmd: string, args: string[]) => {
  try {
    execFileSync(cmd, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
// Node as found on the PATH (/opt/homebrew/bin/node), not the versioned folder it runs from:
// that one disappears when Homebrew updates Node.
function findNode() {
  try {
    return execFileSync("which", ["node"], { encoding: "utf8" }).trim() || process.execPath;
  } catch {
    return process.execPath;
  }
}
const read = (file: string) => (existsSync(file) ? readFileSync(file, "utf8") : null);

// Only ever the real database: the always-on app is the one place that uses it.
const { databaseFile } = getConfig();
if (path.basename(databaseFile) !== "miku.db") throw new Error(`The always-on app uses the real database (miku.db), not ${databaseFile}. Unset MIKU_DATABASE / DATABASE_URL.`);

async function backUp() {
  const made = await makeBackup(backupPlace(), new Date(), true);
  console.log(made ? `Backed up the database: ${made.name}` : "No database yet: nothing to back up");
}

// A fresh copy of the release, made ready next to the running one while it keeps running (its
// files untouched). Nothing here touches the database.
function prepareRelease(): string {
  const next = `${appDir}.next`;
  rmSync(next, { recursive: true, force: true });
  mkdirSync(next, { recursive: true });
  execFileSync("bash", ["-c", `git archive ${RELEASE} | tar -x -C "$1"`, "_", next], { cwd: checkout, stdio: "inherit" });
  // Libraries: a copy of the running app's when they're the same (a clone on macOS, so instant and
  // the running app keeps its own), otherwise installed.
  if (read(path.join(next, "package-lock.json")) === read(path.join(appDir, "package-lock.json")) && existsSync(path.join(appDir, "node_modules"))) {
    execFileSync("cp", ["-cR", path.join(appDir, "node_modules"), path.join(next, "node_modules")], { stdio: "inherit" });
  } else {
    run("npm", ["ci", "--no-audit", "--no-fund"], next);
  }
  run("npx", ["prisma", "generate"], path.join(next, "server"));
  run("npm", ["run", "build"], next);
  return next;
}

// A rehearsal of the new copy on a copy of the real database, on its own port, with backups and
// the Nexon refresh off: the database update has to work on your real data, and the app has to
// start and answer for every character. Nothing real is touched; the copy is deleted afterwards,
// also when interrupted (Ctrl+C). (Its settings isolate everything in the copy's folder, like the
// QA copy's in scripts/qa.mjs: a new data setting goes in both.)
async function rehearse(next: string) {
  const base = `http://127.0.0.1:${REHEARSAL_PORT}`;
  const answers = async (where: string) => (await fetch(base + where).catch(() => null))?.ok ?? false;
  // Something already there (say, a rehearsal left behind) could answer for a new version that
  // doesn't start, so the port must be free.
  const free = await new Promise<boolean>((resolve) => {
    const probe = createServer().once("error", () => resolve(false));
    probe.listen(REHEARSAL_PORT, "127.0.0.1", () => probe.close(() => resolve(true)));
  });
  if (!free) throw new Error(`Rehearsal: port ${REHEARSAL_PORT} is already in use; stop whatever is on it and try again.`);
  const data = mkdtempSync(path.join(os.tmpdir(), "miku-rehearsal-"));
  let server: ReturnType<typeof spawn> | undefined;
  let output = "";
  const cleanUp = () => {
    if (server?.pid && server.exitCode === null) {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {
        // already gone
      }
    }
    rmSync(data, { recursive: true, force: true });
  };
  const interrupted = () => {
    cleanUp();
    rmSync(next, { recursive: true, force: true }); // nothing real was touched yet: the new copy goes too
    process.exit(130);
  };
  process.once("SIGINT", interrupted);
  process.once("SIGTERM", interrupted);
  try {
    if (existsSync(databaseFile)) {
      const { default: Database } = await import("better-sqlite3");
      const from = new Database(databaseFile, { readonly: true, fileMustExist: true });
      try {
        await from.backup(path.join(data, "miku.db"));
      } finally {
        from.close();
      }
    }
    const env = { ...process.env, CHECKPOINT_DISABLE: "1", MIKU_DATA_DIR: data, MIKU_DATABASE: "real", DATABASE_URL: "", BACKUP_DIR: "", AVATAR_DIR: "", THEME_ART_DIR: "", BOSS_ART_DIR: "", NEXON_IMAGES_URL: "", MIKU_BACKUPS: "off", MIKU_REFRESH: "off", PORT: String(REHEARSAL_PORT) };
    execFileSync("npx", ["prisma", "migrate", "deploy"], { cwd: path.join(next, "server"), env, stdio: "inherit" });
    server = spawn(path.join(next, "node_modules", ".bin", "tsx"), ["src/index.ts"], { cwd: path.join(next, "server"), env, stdio: ["ignore", "pipe", "pipe"], detached: true });
    for (const stream of [server.stdout, server.stderr]) stream?.on("data", (chunk) => (output = (output + chunk).slice(-4000)));
    const why = () => (output.trim() ? `\nIts output:\n${output.trim()}` : "");
    let up = false;
    for (let i = 0; i < 60 && !up && server.exitCode === null; i++) {
      up = await answers("/api/health");
      if (!up) await new Promise((r) => setTimeout(r, 500));
    }
    if (!up) throw new Error(`Rehearsal: the new version didn't start on a copy of your data.${why()}`);
    const failed: string[] = [];
    if (!(await answers("/"))) failed.push("the page");
    for (const world of [45, 70]) {
      const list = (await fetch(`${base}/api/characters?world=${world}`)
        .then((r) => r.json())
        .catch(() => null)) as { characters?: { id: number; name: string }[] } | null;
      if (!list?.characters) failed.push(`the characters on world ${world}`);
      for (const c of list?.characters ?? []) if (!(await answers(`/api/characters/${c.id}/progress`))) failed.push(`${c.name}'s EXP history`);
    }
    // Still its own server answering (not something that took the port meanwhile).
    if (server.exitCode !== null) failed.push("anything (it stopped running)");
    if (failed.length) throw new Error(`Rehearsal: on a copy of your data, the new version couldn't load ${failed.join(", ")}.${why()}`);
    console.log("Rehearsal passed: the new version updated a copy of your data and loaded every character.");
  } finally {
    process.off("SIGINT", interrupted);
    process.off("SIGTERM", interrupted);
    cleanUp();
  }
}

// Then, with the old app stopped (so nothing uses the database or its files meanwhile): back up,
// update the database, swap the new copy in. If any step fails, the old copy is still in place
// and gets started again.
async function swapIn(next: string) {
  await stop();
  try {
    await backUp();
    run("npx", ["prisma", "migrate", "deploy"], path.join(next, "server"));
  } catch (error) {
    if (existsSync(appDir)) await start();
    throw error;
  }
  rmSync(`${appDir}.old`, { recursive: true, force: true });
  if (existsSync(appDir)) renameSync(appDir, `${appDir}.old`);
  renameSync(next, appDir);
  rmSync(`${appDir}.old`, { recursive: true, force: true });
}

async function waitUntilUp() {
  for (let i = 0; i < 30; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok) return console.log(`Running: open http://127.0.0.1:${PORT}`);
    } catch {
      // not yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`Not answering yet; see ${logFile(home)}`);
}

const loaded = () => quiet("launchctl", ["print", `${domain}/${LABEL}`]);

// Stops the app. macOS finishes removing it a moment after the command returns, and starting
// it again before that fails, so this waits (up to 10 seconds).
async function stop() {
  quiet("launchctl", ["bootout", `${domain}/${LABEL}`]);
  for (let i = 0; i < 20 && loaded(); i++) await new Promise((r) => setTimeout(r, 500));
}

async function start() {
  mkdirSync(path.dirname(logFile(home)), { recursive: true });
  mkdirSync(path.dirname(plistFile(home)), { recursive: true });
  writeFileSync(plistFile(home), launchAgentPlist({ node: findNode(), repo: appDir, home, port: PORT }));
  await stop(); // an older one, if any
  run("launchctl", ["bootstrap", domain, plistFile(home)], checkout);
}

const command = process.argv[2];
if (command === "install" || command === "restart") {
  const next = prepareRelease();
  try {
    await rehearse(next);
  } catch (error) {
    rmSync(next, { recursive: true, force: true });
    console.log("Stopped before touching anything real: the running app and your data are unchanged.");
    throw error;
  }
  await swapIn(next);
  await start(); // a restart also picks up changes to the launch agent itself
  await waitUntilUp();
} else if (command === "rehearse") {
  const next = prepareRelease();
  try {
    await rehearse(next);
  } finally {
    rmSync(next, { recursive: true, force: true });
  }
} else if (command === "status") {
  const isLoaded = loaded();
  console.log(isLoaded ? `Set up to start at login, from ${appDir}.` : "Not set up (npm run app:install).");
  if (isLoaded) await waitUntilUp();
} else if (command === "uninstall") {
  await stop();
  rmSync(plistFile(home), { force: true });
  rmSync(appDir, { recursive: true, force: true });
  console.log("Removed: the app no longer starts at login. Your data and backups are untouched.");
} else {
  console.log("Use: install, restart, rehearse, status or uninstall");
}
