import { mkdirSync } from "node:fs";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { type Config, getConfig } from "./config";
import { PrismaClient } from "./generated/prisma/client";

// A connection to the database, through the better-sqlite3 driver. Its folder is created if
// needed (the first run on a new Mac or in a new container).
export function openDatabase({ databaseUrl, databaseFile }: Pick<Config, "databaseUrl" | "databaseFile">): PrismaClient {
  mkdirSync(path.dirname(databaseFile), { recursive: true });
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databaseUrl }) });
}

// The one connection the server uses, opened the first time it's needed (not when this file is
// imported, so a failure shows up where the database is used).
let connection: PrismaClient | undefined;
export function db(): PrismaClient {
  connection ??= openDatabase(getConfig());
  return connection;
}
