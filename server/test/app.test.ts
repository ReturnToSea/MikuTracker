import type { AddressInfo } from "node:net";
import express from "express";
import request from "supertest";
import { afterAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createApp, jsonValue } from "../src/app";
import { db } from "../src/db";
import { Prisma } from "../src/generated/prisma/client";
import { HttpError } from "../src/http";
import { currentOwner, SOLE_OWNER } from "../src/owner";
import { startServer } from "../src/server";
import { api } from "./api";
import { useDbTestSetup } from "./helpers";

useDbTestSetup();

describe("the API", () => {
  it("answers the health check", async () => {
    const res = await api().get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("answers unknown API addresses with a JSON 404", async () => {
    const res = await api().get("/api/no-such-thing");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });

  it("leaves addresses outside /api alone (they're not answered with the API's JSON 404)", async () => {
    const res = await api().get("/not-the-api");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({});
  });

  it("rejects malformed JSON with a 400", async () => {
    const res = await api().post("/api/health").set("Content-Type", "application/json").send("{not json");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Malformed JSON" });
  });

  it("rejects bodies over 100 KB with a 413, and accepts ones just under", async () => {
    const big = await api().post("/api/no-such-thing").set("Content-Type", "application/json").send(JSON.stringify({ s: "x".repeat(101 * 1024) }));
    expect(big.status).toBe(413);
    expect(big.body).toEqual({ error: "That's too large to send" });
    const fine = await api().post("/api/no-such-thing").set("Content-Type", "application/json").send(JSON.stringify({ s: "x".repeat(99 * 1024) }));
    expect(fine.status).toBe(404); // got past the size check
  });
});

// The real app, plus test routes that throw each kind of error (under /api, behind the real
// login check, JSON handling and error handler).
function errorApp() {
  return createApp({ extraRoutes: (app) => addErrorRoutes(express.Router(), app) });
}
function addErrorRoutes(router: express.Router, app: express.Express) {
  app.use("/api/test", router);
  const r = router;
  r.get("/owner", (_req, res) => {
    res.json({ owner: currentOwner(res) });
  });
  r.get("/zod", () => {
    z.object({ level: z.number().int(), name: z.string() }).parse({ level: 1.5 });
  });
  r.get("/zod-nested", () => {
    z.object({ stats: z.object({ level: z.number() }) }).parse({ stats: { level: "high" } });
  });
  r.get("/prisma-other", () => {
    throw new Prisma.PrismaClientKnownRequestError("Foreign key failed", { code: "P2003", clientVersion: "test" });
  });
  r.get("/string", () => {
    throw "just a string";
  });
  r.get("/http", () => {
    throw new HttpError(422, "Not on this world");
  });
  r.get("/duplicate", async () => {
    await db().settings.create({ data: { ownerId: "x" } });
    await db().settings.create({ data: { ownerId: "x" } });
  });
  r.get("/missing", async () => {
    await db().settings.update({ where: { ownerId: "nobody" }, data: { theme: "ren" } });
  });
  r.get("/boom", () => {
    throw new Error("secret details");
  });
  r.get("/max-exp", (_req, res) => {
    res.json({ exp: 8_509_498_537_428_819n }); // the most EXP a character can have: still exact
  });
  r.get("/too-big", (_req, res) => {
    res.json({ exp: 9_007_199_254_740_993n });
  });
}

describe("errors", () => {
  const app = errorApp();

  it("every request belongs to the sole owner (no login yet)", async () => {
    expect((await request(app).get("/api/test/owner")).body).toEqual({ owner: SOLE_OWNER });
  });

  it("invalid input → 400 listing each problem", async () => {
    const res = await request(app).get("/api/test/zod");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid input");
    expect(res.body.issues.map((i: { path: string }) => i.path)).toEqual(["level", "name"]);
  });

  it("names nested input problems by their full path", async () => {
    expect((await request(app).get("/api/test/zod-nested")).body.issues).toEqual([expect.objectContaining({ path: "stats.level" })]);
  });

  it("a database error we don't map, or a thrown non-Error, still gets the plain JSON 500", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const path of ["/api/test/prisma-other", "/api/test/string"]) {
      const res = await request(app).get(path);
      expect([res.status, res.body]).toEqual([500, { error: "Server error" }]);
    }
    log.mockRestore();
  });

  it("an HttpError keeps its status and message", async () => {
    const res = await request(app).get("/api/test/http");
    expect([res.status, res.body]).toEqual([422, { error: "Not on this world" }]);
  });

  it("a duplicate → 409, a missing record → 404", async () => {
    expect([(await request(app).get("/api/test/duplicate")).status, (await request(app).get("/api/test/duplicate")).body]).toEqual([409, { error: "Already exists" }]);
    const missing = await request(app).get("/api/test/missing");
    expect([missing.status, missing.body]).toEqual([404, { error: "Not found" }]);
  });

  it("anything else → a plain 500, logged but with no details sent", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(app).get("/api/test/boom");
    expect([res.status, res.body]).toEqual([500, { error: "Server error" }]);
    expect(log).toHaveBeenCalledOnce();
    expect(String(log.mock.calls[0]![0])).toContain("secret details");
    log.mockRestore();
  });

  it("sends the most EXP a character can have exactly, and refuses a number too big to be exact", async () => {
    const max = await request(app).get("/api/test/max-exp");
    expect(max.text).toBe('{"exp":8509498537428819}');
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await request(app).get("/api/test/too-big")).status).toBe(500);
    log.mockRestore();
  });

  it("currentOwner refuses a request that skipped the login check", () => {
    expect(() => currentOwner({ locals: {} } as never)).toThrow("No owner for this request");
  });
});

describe("big numbers in JSON", () => {
  it("sends BigInt as a plain number, exactly, up to the safe limit", () => {
    expect(JSON.stringify({ exp: 1_737_759_854_037_637n, level: 299 }, jsonValue)).toBe('{"exp":1737759854037637,"level":299}');
    expect(jsonValue("", BigInt(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
    expect(jsonValue("", BigInt(Number.MIN_SAFE_INTEGER))).toBe(Number.MIN_SAFE_INTEGER);
  });

  it("refuses anything beyond it", () => {
    expect(() => jsonValue("", BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow("too big to send exactly");
    expect(() => jsonValue("", BigInt(Number.MIN_SAFE_INTEGER) - 1n)).toThrow("too big to send exactly");
  });

  it("leaves everything else alone", () => {
    expect(jsonValue("", "text")).toBe("text");
    expect(jsonValue("", 5)).toBe(5);
  });
});

describe("startServer", () => {
  const servers: { close(cb: () => void): void }[] = [];
  afterAll(async () => {
    await Promise.all(servers.map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
  });

  it("listens on the given address and port", async () => {
    const server = await startServer({ host: "127.0.0.1", port: 0 });
    servers.push(server);
    expect((server.address() as AddressInfo).address).toBe("127.0.0.1");
    const res = await request(`http://127.0.0.1:${(server.address() as AddressInfo).port}`).get("/api/health");
    expect(res.body).toEqual({ ok: true });
  });

  it("fails clearly when the port is taken", async () => {
    const first = await startServer({ host: "127.0.0.1", port: 0 });
    servers.push(first);
    await expect(startServer({ host: "127.0.0.1", port: (first.address() as AddressInfo).port })).rejects.toThrow("EADDRINUSE");
  });
});
