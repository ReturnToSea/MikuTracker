import { execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import type { TestProject } from "vitest/node";

// Before a test run: create the throwaway database (in the temporary folder) and give it every
// table, using the same migrations as the real one. After the run: delete it.
export default function setup(project: TestProject) {
  const env = project.config.env as Record<string, string>;
  mkdirSync(env.MIKU_DATA_DIR!, { recursive: true });
  execSync("npx prisma migrate deploy", {
    cwd: path.resolve(import.meta.dirname, ".."), // the server folder, wherever the tests are started from
    env: { ...process.env, ...env, CHECKPOINT_DISABLE: "1" },
    stdio: "ignore",
  });
  return () => rmSync(env.MIKU_DATA_DIR!, { recursive: true, force: true });
}
