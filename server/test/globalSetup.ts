import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TestProject } from "vitest/node";

// Before a test run: create the throwaway database (in the temporary folder) and give it every
// table, using the same migrations as the real one. After the run: delete it. (The folder is named
// after the run's process number, which the system reuses: one an interrupted run left behind is
// emptied first, or its old files would leak into this run.)
export default function setup(project: TestProject) {
  const env = project.config.env as Record<string, string>;
  // (only ever a throwaway test folder in the temporary folder: never anything else, the real data least of all)
  const dir = path.resolve(env.MIKU_DATA_DIR!);
  if (path.dirname(dir) !== path.resolve(os.tmpdir()) || !path.basename(dir).startsWith("miku-tracker-test-")) throw new Error(`Refusing to empty ${dir}: not a throwaway test folder`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(env.MIKU_DATA_DIR!, { recursive: true });
  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(import.meta.dirname, ".."), // the server folder, wherever the tests are started from
    env: { ...process.env, ...env, CHECKPOINT_DISABLE: "1" },
    stdio: "ignore",
  });
  return () => rmSync(env.MIKU_DATA_DIR!, { recursive: true, force: true });
}
