// npm run qa: a throwaway copy of the app for testing by hand or in a browser, so testing never
// touches your data. It copies the data (the real database once it exists, otherwise dev.db, with
// its avatars and the theme art) into a fresh temporary folder, starts the app on its own ports
// (API 4753, page http://127.0.0.1:4754) with backups and the Nexon refresh off, and deletes the
// folder when stopped (Ctrl+C). `npm run qa -- --empty` starts with no data instead.
// Searching and adding characters still ask Nexon's real rankings (read-only; there's no other source).
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const repo = path.resolve(import.meta.dirname, "..");
const real = path.join(os.homedir(), "Library", "Application Support", "MikuTracker");
const API_PORT = 4753;
const PAGE_PORT = 4754;
const empty = process.argv.includes("--empty");

const dir = mkdtempSync(path.join(os.tmpdir(), "miku-qa-"));
const remove = () => {
  // Only ever the folder made above.
  if (path.dirname(dir) === path.resolve(os.tmpdir()) && path.basename(dir).startsWith("miku-qa-")) rmSync(dir, { recursive: true, force: true });
};

// The data to copy: the real app's, or the dev copy's until the real one exists.
const source = existsSync(path.join(real, "miku.db")) ? { db: "miku.db", avatars: "avatars" } : { db: "dev.db", avatars: "dev-avatars" };
try {
  if (!empty && existsSync(path.join(real, source.db))) {
    // SQLite's own backup: a consistent copy even while the app is writing.
    const from = new Database(path.join(real, source.db), { readonly: true, fileMustExist: true });
    try {
      await from.backup(path.join(dir, "miku.db"));
    } finally {
      from.close();
    }
    if (existsSync(path.join(real, source.avatars))) cpSync(path.join(real, source.avatars), path.join(dir, "avatars"), { recursive: true });
    console.log(`Copied ${source.db} and its avatars into ${dir}`);
  } else {
    console.log(`Starting empty in ${dir}`);
  }
  if (existsSync(path.join(real, "theme-art"))) cpSync(path.join(real, "theme-art"), path.join(dir, "theme-art"), { recursive: true });
} catch (error) {
  remove(); // a failed copy leaves nothing behind
  throw error;
}

// Settings for every part: everything inside the copy's folder, and no backups or refresh.
const env = {
  ...process.env,
  MIKU_DATA_DIR: dir,
  MIKU_DATABASE: "real",
  DATABASE_URL: "",
  BACKUP_DIR: "",
  AVATAR_DIR: "",
  THEME_ART_DIR: "",
  MIKU_BACKUPS: "off",
  MIKU_REFRESH: "off",
  PORT: String(API_PORT),
  MIKU_DEV_API: `http://127.0.0.1:${API_PORT}`,
  MIKU_DEV_PAGE_PORT: String(PAGE_PORT),
  CHECKPOINT_DISABLE: "1",
};
// Each part runs in its own process group, so stopping it also stops what npx started under it
// (tsx, vite), and the ports are free again.
const children = new Set();
const start = (cmd, args, cwd, { lasting = true } = {}) => {
  const child = spawn(cmd, args, { cwd: path.join(repo, cwd), env, stdio: "inherit", detached: true });
  children.add(child);
  child.on("exit", (code, signal) => {
    children.delete(child);
    // The API or the page ending on its own (or the migration failing) ends the QA copy too.
    if (lasting || code !== 0) stop(code === 0 && !signal ? 0 : 1, `${cmd} ${args.join(" ")} ended (${signal ?? `exit ${code}`})`);
  });
  return child;
};
let stopping = false;
async function stop(status = 0, why = "") {
  if (stopping) return;
  stopping = true;
  if (why) console.log(why);
  const running = [...children];
  for (const c of running) {
    try {
      process.kill(-c.pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  // Wait (up to 5 seconds) until they've let go of the ports, then delete the copy.
  await Promise.race([Promise.all(running.map((c) => new Promise((r) => (c.exitCode !== null || c.signalCode !== null ? r() : c.once("exit", r))))), new Promise((r) => setTimeout(r, 5000))]);
  remove();
  console.log(status ? "Stopped after a problem; the QA copy is deleted." : "Stopped; the QA copy is deleted.");
  process.exit(status);
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

// Bring the copy's database up to date, then start the API and the page.
const migrate = start("npx", ["prisma", "migrate", "deploy"], "server", { lasting: false });
migrate.on("exit", (code) => {
  if (code !== 0 || stopping) return;
  start("npx", ["tsx", "src/index.ts"], "server");
  start("npx", ["vite"], "client");
  console.log(`QA copy: http://127.0.0.1:${PAGE_PORT} (Ctrl+C stops it and deletes the copy)`);
});
