import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The server folder of the checkout being tested, found from the working folder: when Stryker
// loads this config inside its sandbox copy, both import.meta.dirname and import.meta.url still
// point at the original repo, so the shared rules would be loaded unmutated (as in Goal Tracker).
//   npm test (cwd = server/) · repo root (cwd has server/) · anything else: this file's folder
function serverFolder() {
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, "vitest.config.ts")) && existsSync(path.join(cwd, "../shared/src"))) return cwd;
  if (existsSync(path.join(cwd, "server/vitest.config.ts"))) return path.join(cwd, "server");
  return path.dirname(fileURLToPath(import.meta.url));
}
const here = serverFolder();

// Every test run gets throwaway places for its database and backups, never the real ones.
const scratch = path.join(os.tmpdir(), `miku-tracker-test-${process.pid}`);

export default defineConfig({
  root: here,
  // Load the shared input rules from this checkout's shared/ folder. The workspace link in
  // node_modules would point Stryker's sandbox copy back at the original, unmutated files.
  resolve: { alias: { "@miku/shared": path.join(here, "../shared/src/index.ts") } },
  test: {
    // TEST_TZ=UTC npm test re-runs everything in another time zone to catch local-time assumptions.
    env: {
      TZ: process.env.TEST_TZ ?? "America/Los_Angeles",
      DATABASE_URL: `file:${path.join(scratch, "test.db")}`,
      MIKU_DATA_DIR: scratch,
      MIKU_BACKUPS: "off",
      MIKU_REFRESH: "off",
    },
    globalSetup: path.join(here, "test/globalSetup.ts"),
    setupFiles: [path.join(here, "test/setup.ts")],
    fileParallelism: false, // test files share the database
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/generated/**", "src/index.ts"],
    },
  },
});
