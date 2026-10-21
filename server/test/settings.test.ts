import { describe, expect, it } from "vitest";
import { db } from "../src/db";
import { SOLE_OWNER } from "../src/owner";
import { api, ok } from "./api";
import { useDbTestSetup } from "./helpers";

useDbTestSetup();

describe("settings", () => {
  it("start as the Ren theme on Kronos, created on first read", async () => {
    expect(await db().settings.count()).toBe(0);
    const res = await api().get("/api/settings");
    expect([res.status, res.body]).toEqual([200, { theme: "ren", worldId: 45 }]);
    expect(await db().settings.findUnique({ where: { ownerId: SOLE_OWNER } })).toMatchObject({ theme: "ren" });
  });

  it("reading twice doesn't create a second row", async () => {
    await ok(api().get("/api/settings"));
    await ok(api().get("/api/settings"));
    expect(await db().settings.count()).toBe(1);
  });

  it("saving the theme keeps it, before or after a first read", async () => {
    const saved = await api().put("/api/settings").send({ theme: "pochacco" });
    expect([saved.status, saved.body]).toEqual([200, { theme: "pochacco", worldId: 45 }]);
    expect((await api().get("/api/settings")).body.theme).toBe("pochacco");
    await ok(api().put("/api/settings").send({ theme: "ren" }));
    expect((await api().get("/api/settings")).body.theme).toBe("ren");
  });

  it.each([{ theme: "dark" }, { theme: "" }, {}, { theme: "ren", worldId: 70 }, { theme: 1 }])("refuses %j", async (body) => {
    const res = await api().put("/api/settings").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid input");
    expect(await db().settings.count()).toBe(0);
  });
});
