import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { CLIENT_DIST, createApp } from "../src/app";
import { getConfig } from "../src/config";
import { themeArt } from "../src/routes/themeArt";
import { api } from "./api";

const artDir = getConfig().themeArtDir; // inside this test run's scratch folder
afterEach(() => rmSync(artDir, { recursive: true, force: true }));

function addArt(name: string, contents = "picture", mtime = new Date(Date.UTC(2026, 9, 1))) {
  mkdirSync(artDir, { recursive: true });
  writeFileSync(path.join(artDir, name), contents);
  utimesSync(path.join(artDir, name), mtime, mtime);
}

describe("theme art", () => {
  it("is listed as missing for every theme when there is none", async () => {
    expect((await api().get("/api/theme-art")).body).toEqual({ ren: null, pochacco: null });
  });

  it("lists a theme's art with its change time, and serves the file", async () => {
    addArt("pochacco.png", "PNG bytes");
    const list = (await api().get("/api/theme-art")).body;
    expect(list).toEqual({ ren: null, pochacco: `/theme-art/pochacco.png?v=${Date.UTC(2026, 9, 1)}` });
    const file = await api().get("/theme-art/pochacco.png");
    expect([file.status, file.headers["content-type"]]).toEqual([200, "image/png"]);
    expect(file.body.toString()).toBe("PNG bytes");
  });

  it("finds .jpg and .webp too, preferring .png, then .jpg", () => {
    addArt("ren.webp");
    expect(themeArt(artDir).ren).toMatch(/^\/theme-art\/ren\.webp\?v=\d+$/);
    addArt("ren.jpg");
    expect(themeArt(artDir).ren).toMatch(/^\/theme-art\/ren\.jpg\?/);
    addArt("ren.png");
    expect(themeArt(artDir).ren).toMatch(/^\/theme-art\/ren\.png\?/);
  });

  it("ignores files that aren't a theme's art", () => {
    addArt("other.png");
    addArt("pochacco.gif");
    expect(themeArt(artDir)).toEqual({ ren: null, pochacco: null });
  });

  it("a replaced picture gets a new address", () => {
    addArt("ren.png", "old", new Date(Date.UTC(2026, 9, 1)));
    const before = themeArt(artDir).ren;
    addArt("ren.png", "new", new Date(Date.UTC(2026, 9, 2)));
    expect(themeArt(artDir).ren).not.toBe(before);
  });
});

describe("the built app", () => {
  it("is looked for in client/dist by default", () => {
    expect(CLIENT_DIST).toBe(path.resolve(import.meta.dirname, "../../client/dist"));
  });

  it("is served, and any other address gets its page (the app shows the right tab)", async () => {
    const dist = mkdtempSync(path.join(os.tmpdir(), "miku-dist-"));
    try {
      writeFileSync(path.join(dist, "index.html"), "<p>the app</p>");
      writeFileSync(path.join(dist, "app.js"), "console.log(1)");
      const app = createApp({ clientDist: dist });
      expect((await request(app).get("/")).text).toBe("<p>the app</p>");
      expect((await request(app).get("/themes")).text).toBe("<p>the app</p>");
      expect((await request(app).get("/app.js")).text).toBe("console.log(1)");
      const apiMiss = await request(app).get("/api/nothing");
      expect([apiMiss.status, apiMiss.body]).toEqual([404, { error: "Not found" }]); // the API still answers for itself
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });
});
