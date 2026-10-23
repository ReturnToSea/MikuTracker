// The always-on app (see src/launchAgent.ts). It runs from its own copy of the latest finished
// version (the main branch) in ~/Library/Application Support/MikuTracker/app, so work in progress
// in this checkout never reaches it. Adapted from Goal Tracker.
//   npm run app:install    set it up and start it at every login
//   npm run app:restart    after a new version: copy main and build it, then stop, back up, update the database, swap, start
//   npm run app:status     is it running?
//   npm run app:uninstall  stop it and remove it (your data and backups stay)
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { backupPlace, makeBackup } from "../src/backups";
import { getConfig, realDataDir } from "../src/config";
import { LABEL, launchAgentPlist, logFile, plistFile } from "../src/launchAgent";

const RELEASE = "main";
const PORT = 4750;
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
      if ((await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok) return console.log(`Running: open http://localhost:${PORT}`);
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
  await swapIn(prepareRelease());
  await start(); // a restart also picks up changes to the launch agent itself
  await waitUntilUp();
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
  console.log("Use: install, restart, status or uninstall");
}
