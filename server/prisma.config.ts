import { defineConfig } from "prisma/config";
import { loadConfig } from "./src/config";

// Prisma's command-line tools (migrate, generate) use the same database setting as the server:
// the real one by default, dev.db with MIKU_DATABASE=dev, or the throwaway one in tests.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: loadConfig().databaseUrl },
});
