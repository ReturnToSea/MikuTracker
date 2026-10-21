import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The client folder of the checkout being tested, found from the working folder: inside
// Stryker's sandbox copy, import.meta.url still points at the original repo (same as the
// server's vitest.config.ts). npm scripts run from client/; Stryker runs from the repo root.
function clientFolder() {
  const cwd = process.cwd();
  if (existsSync(path.join(cwd, "vite.config.ts")) && existsSync(path.join(cwd, "src/App.tsx"))) return cwd;
  if (existsSync(path.join(cwd, "client/vite.config.ts"))) return path.join(cwd, "client");
  return path.dirname(fileURLToPath(import.meta.url));
}
const here = clientFolder();

// During development (npm run dev) the page is served on 4752 and forwards API calls, theme art
// and avatars to the development server on 4751 (the always-on app has 4750).
const devApi = process.env.MIKU_DEV_API ?? "http://127.0.0.1:4751";

export default defineConfig({
  root: here,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@miku/shared": path.join(here, "../shared/src/index.ts") } },
  server: {
    host: "127.0.0.1", // only this Mac, like the API
    port: Number(process.env.MIKU_DEV_PAGE_PORT ?? 4752),
    strictPort: true,
    proxy: { "/api": devApi, "/theme-art": devApi, "/avatars": devApi },
  },
  test: {
    environment: "jsdom",
    maxWorkers: 2, // each worker runs its own simulated browser; two keep memory low on an 8 GB Mac
    setupFiles: [path.join(here, "test/setup.ts")],
    env: { TZ: process.env.TEST_TZ ?? "America/Los_Angeles" },
  },
});
