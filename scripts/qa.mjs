// npm run qa: a throwaway copy of the app for testing by hand or in a browser, so testing never
// touches your data. It copies the data (the real database once it exists, otherwise dev.db, with
// its avatars and the theme art) into a fresh temporary folder, starts the app on its own ports
// with backups and the Nexon refresh off, and deletes the folder when stopped (Ctrl+C).
//   http://127.0.0.1:4753  the production build, exactly as the always-on app serves it: test here
//                          (built once, as it starts: restart the QA copy after changing the page)
//   http://127.0.0.1:4754  the development build (live reload), for looking while changing things
// (The development build runs some code twice on purpose, which once hid a bug only the production
// build had: v1.0.0's Ren sky.)
//   --empty       start with no data
//   --fake-nexon  use the fake Nexon (server/scripts/fakeNexon.ts, port 4755): made-up characters,
//                 no internet; otherwise searching and adding ask Nexon's real rankings (read-only)
// npm run qa:check (scripts/qa-check.mjs) starts one of these to click through every button.
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

export const repo = path.resolve(import.meta.dirname, "..");
const real = path.join(os.homedir(), "Library", "Application Support", "MikuTracker");
export const API_PORT = 4753;
export const PAGE_PORT = 4754;
export const FAKE_NEXON_PORT = 4755;
export const FAKE_NEXON = `http://127.0.0.1:${FAKE_NEXON_PORT}`;

// Starts a QA copy; resolves once it answers. stop() (also on any part ending by itself, which
// calls onEnd) stops every part, frees the ports and deletes the copy.
export async function startQa({ empty = false, fakeNexon = false, devPage = true, onEnd = () => {} } = {}) {
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
  // (The always-on app's rehearsal, server/scripts/app.ts, isolates its copy the same way: a new
  // data setting goes in both.)
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
    NEXON_RANKINGS_URL: fakeNexon ? `${FAKE_NEXON}/ranking` : "",
    NEXON_IMAGES_URL: fakeNexon ? `${FAKE_NEXON}/images` : "",
    FAKE_NEXON_PORT: String(FAKE_NEXON_PORT),
  };

  // Each part runs in its own process group, so stopping it also stops what npx started under it
  // (tsx, vite), and the ports are free again.
  const children = new Set();
  let stopping = false;
  const run = (cmd, args, cwd, { lasting = true } = {}) => {
    const child = spawn(cmd, args, { cwd: path.join(repo, cwd), env, stdio: "inherit", detached: true });
    children.add(child);
    child.on("exit", (code, signal) => {
      children.delete(child);
      // A lasting part ending on its own (or a step failing) ends the QA copy too.
      if (!stopping && (lasting || code !== 0)) {
        console.log(`${cmd} ${args.join(" ")} ended (${signal ?? `exit ${code}`})`);
        void stop().then(() => onEnd(1));
      }
    });
    return child;
  };
  const finished = (child) => new Promise((r) => (child.exitCode !== null || child.signalCode !== null ? r(child.exitCode) : child.once("exit", (code) => r(code))));

  async function stop() {
    if (stopping) return;
    stopping = true;
    const running = [...children];
    for (const c of running) {
      try {
        process.kill(-c.pid, "SIGTERM");
      } catch {
        // already gone
      }
    }
    // Wait (up to 5 seconds) until they've let go of the ports, then delete the copy.
    await Promise.race([Promise.all(running.map(finished)), new Promise((r) => setTimeout(r, 5000))]);
    remove();
  }

  if (fakeNexon) run("npx", ["tsx", "scripts/fakeNexon.ts"], "server");
  // Build the page (the API serves it at 4753) and bring the copy's database up to date.
  for (const [cmd, args, cwd] of [
    ["npm", ["run", "build"], "."],
    ["npx", ["prisma", "migrate", "deploy"], "server"],
  ]) {
    if ((await finished(run(cmd, args, cwd, { lasting: false }))) !== 0 || stopping) {
      await stop(); // the fake Nexon too, and the copy
      throw new Error(`QA copy: ${cmd} ${args.join(" ")} failed`);
    }
  }
  run("npx", ["tsx", "src/index.ts"], "server");
  if (devPage) run("npx", ["vite"], "client");

  // Ready when the API (and the fake Nexon) answer; after a minute, it says so and stops.
  const answers = async (url) => (await fetch(url).catch(() => null))?.ok ?? false;
  let ready = false;
  for (let i = 0; i < 120 && !stopping && !ready; i++) {
    ready = (await answers(`http://127.0.0.1:${API_PORT}/api/health`)) && (!fakeNexon || (await answers(`${FAKE_NEXON}/ranking?type=world&id=45`)));
    if (!ready) await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) {
    await stop();
    throw new Error("The QA copy didn't start (its API or the fake Nexon never answered).");
  }
  return { dir, env, stop };
}

// Run directly: npm run qa [-- --empty] [-- --fake-nexon]
if (process.argv[1] === import.meta.filename) {
  let qa;
  const end = async (status) => {
    await qa?.stop();
    console.log(status ? "Stopped after a problem; the QA copy is deleted." : "Stopped; the QA copy is deleted.");
    process.exit(status);
  };
  process.on("SIGINT", () => end(0));
  process.on("SIGTERM", () => end(0));
  try {
    qa = await startQa({ empty: process.argv.includes("--empty"), fakeNexon: process.argv.includes("--fake-nexon"), onEnd: end });
  } catch (error) {
    console.log(error instanceof Error ? error.message : error);
    await end(1);
  }
  console.log(
    `QA copy: http://127.0.0.1:${API_PORT} (production build, as of now: restart after changes; test here), http://127.0.0.1:${PAGE_PORT} (development build, live). ${process.argv.includes("--fake-nexon") ? "Using the fake Nexon. " : ""}Ctrl+C stops it and deletes the copy.`,
  );
}
