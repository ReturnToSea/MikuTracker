import { defineConfig } from "vitest/config";

// Running Vitest from the repo root runs each part with its own config, so the server tests
// always get their throwaway database, and old copies of the tests inside Stryker's sandbox
// folders (.stryker-tmp*) are never picked up. (In Goal Tracker those once ran against the
// real database.)
export default defineConfig({
  test: {
    projects: ["server/vitest.config.ts", "client/vite.config.ts"],
    exclude: ["**/node_modules/**", "**/.stryker-tmp*/**"],
  },
});
