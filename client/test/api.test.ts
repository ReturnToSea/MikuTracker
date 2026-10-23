import { describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../src/api/client";

describe("api", () => {
  it("sends JSON to /api and returns the reply", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ theme: "ren" }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    expect(await api("/settings", { method: "PUT", body: { theme: "ren" } })).toEqual({ theme: "ren" });
    expect(fetch).toHaveBeenCalledWith("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: '{"theme":"ren"}' });
  });

  it("a plain GET sends no body and no content type", async () => {
    const fetch = vi.fn(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await api("/x");
    expect(fetch).toHaveBeenCalledWith("/api/x", { method: "GET", headers: undefined, body: undefined });
  });

  it("204 No Content gives undefined", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    expect(await api("/x", { method: "DELETE" })).toBeUndefined();
  });

  it("an error reply becomes an ApiError with the server's message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Not on this world" }), { status: 422 })));
    const err = await api("/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect([(err as ApiError).status, (err as ApiError).message]).toEqual([422, "Not on this world"]);
  });

  it("a server that can't be reached at all says so plainly (not the browser's 'Failed to fetch')", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    const err = await api("/x").catch((e: unknown) => e);
    expect([err instanceof ApiError, (err as Error).message]).toEqual([false, "Couldn't reach MikuTracker's server. Is it running?"]);
  });

  it("an error reply without a message (or not JSON) still says what happened", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>oops</html>", { status: 502 })));
    await expect(api("/x")).rejects.toThrow("Request failed (502)");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    await expect(api("/x")).rejects.toThrow("Request failed (500)");
  });
});
