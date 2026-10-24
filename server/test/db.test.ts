import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { getConfig, isInside } from "../src/config";
import { db, openDatabase } from "../src/db";
import { MODELS, NOW, resetDb, tableCounts, useDbTestSetup } from "./helpers";

useDbTestSetup();

describe("the test database", () => {
  it("is a throwaway file in the temporary folder, and it exists", () => {
    const { databaseFile } = getConfig();
    expect(isInside(databaseFile, os.tmpdir())).toBe(true);
    expect(existsSync(databaseFile)).toBe(true);
  });

  it("has every table from the migrations", async () => {
    expect(MODELS).toContain("Settings");
    expect(Object.values(await tableCounts()).every((n) => n === 0)).toBe(true);
  });

  it("starts each test at the fixed time, with only Date faked", () => {
    expect(new Date().toISOString()).toBe("2026-10-20T19:00:00.000Z");
    expect(Date.now()).toBe(NOW.getTime());
  });
});

describe("migrations", () => {
  // A schema change without a migration would work in tests (if generated) but fail on the real
  // database, so the migrations must always produce exactly the schema. (Run without blocking:
  // a blocking execSync here sometimes crashed the test process at exit when tests run in worker
  // threads, as mutation testing does.)
  it("match the schema exactly", async () => {
    const run = promisify(execFile);
    await expect(
      run("npx", ["prisma", "migrate", "diff", "--from-migrations", "prisma/migrations", "--to-schema", "prisma/schema.prisma", "--exit-code"], {
        cwd: path.resolve(import.meta.dirname, ".."),
        env: { ...process.env, CHECKPOINT_DISABLE: "1" },
      }),
    ).resolves.toBeDefined();
  }, 60_000);
});

describe("helpers", () => {
  it("resetDb empties every table", async () => {
    await db().settings.create({ data: { ownerId: "someone" } });
    expect((await tableCounts()).Settings).toBe(1);
    await resetDb();
    expect(Object.values(await tableCounts())).toEqual(MODELS.map(() => 0));
  });
});

describe("Settings", () => {
  it("starts with the Ren theme on Kronos", async () => {
    const s = await db().settings.create({ data: { ownerId: "someone" } });
    expect(s).toMatchObject({ ownerId: "someone", theme: "ren", worldId: 45 });
    expect(s.updatedAt.getTime()).toBe(NOW.getTime());
  });

  it("keeps one row per owner", async () => {
    await db().settings.create({ data: { ownerId: "someone" } });
    await expect(db().settings.create({ data: { ownerId: "someone" } })).rejects.toThrow();
  });
});

describe("db()", () => {
  it("opens one shared connection, to the test database", async () => {
    expect(db()).toBe(db());
    await db().settings.create({ data: { ownerId: "someone" } });
    expect(await db().settings.count()).toBe(1);
  });
});

describe("openDatabase", () => {
  it("creates a missing database folder (first run on a new Mac or in a new container)", async () => {
    const folder = path.join(process.env.MIKU_DATA_DIR!, "fresh", "nested"); // from the test setup, not the code under test
    const file = path.join(folder, "new.db");
    expect(existsSync(folder)).toBe(false);
    const db = openDatabase({ databaseUrl: `file:${file}`, databaseFile: file });
    try {
      expect(existsSync(folder)).toBe(true);
      expect(await db.$queryRawUnsafe<{ ok: bigint }[]>("SELECT 1 AS ok")).toEqual([{ ok: 1n }]); // SQLite whole numbers come back as BigInt
    } finally {
      await db.$disconnect();
    }
  });
});
