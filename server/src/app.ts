import { existsSync } from "node:fs";
import path from "node:path";
import express, { type Express } from "express";
import { getConfig } from "./config";
import { requireAuth } from "./middleware/auth";
import { errorHandler } from "./middleware/errors";
import { expTableRouter } from "./routes/expTable";
import { settingsRouter } from "./routes/settings";
import { themeArtRouter } from "./routes/themeArt";

// The built React app (npm run build). Tests pass a temporary folder instead.
export const CLIENT_DIST = path.resolve(import.meta.dirname, "../../client/dist");

// Big numbers (EXP, raid power) are BigInt in the database. JSON has no BigInt, so they're sent
// as plain numbers, which are exact up to 9,007,199,254,740,991; anything bigger is a bug, not
// something to round silently.
export function jsonValue(_key: string, value: unknown): unknown {
  if (typeof value !== "bigint") return value;
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error(`${value} is too big to send exactly`);
  }
  return Number(value);
}

// `clientDist`: where the built React app is. `extraRoutes`: more routes, mounted after the
// app's own and before the 404 and the error handler; only tests use it, to check how every kind
// of error is answered.
export function createApp({ clientDist = CLIENT_DIST, extraRoutes }: { clientDist?: string; extraRoutes?: (app: Express) => void } = {}) {
  const app = express();
  app.use(express.json()); // bodies over 100 KB (Express's default limit) are refused with a 413
  app.set("json replacer", jsonValue);

  // Stryker disable next-line StringLiteral: the login check only records the owner, and nothing outside /api reads it (testable once login exists)
  app.use("/api", requireAuth);
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api/settings", settingsRouter);
  app.use("/api/exp-table", expTableRouter);
  app.use("/api/theme-art", themeArtRouter);
  extraRoutes?.(app);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Theme art from the data folder, and the built app (any other address gets the app's page,
  // which then shows the right tab).
  app.use("/theme-art", express.static(getConfig().themeArtDir));
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get("*splat", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  }

  app.use(errorHandler);
  return app;
}
