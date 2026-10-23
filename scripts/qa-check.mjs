// npm run qa:check: clicks through every button and edge case of the production build, in a real
// browser (Chrome), on a QA copy started empty with the fake Nexon. Nothing here touches your data
// or the internet, and nothing depends on your characters: it adds made-up ones, writes a known
// history into the copy, and makes the fake Nexon level one up and lose another. Run before each
// version (CLAUDE.md). Screenshots go to the folder it prints. Exit status 1 if anything failed.
//   CHROME=/path/to/chrome  if Chrome isn't in /Applications
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { chromium } from "playwright-core";
import { API_PORT, FAKE_NEXON, repo, startQa } from "./qa.mjs";

const BASE = `http://127.0.0.1:${API_PORT}`;
const SHOTS = mkdtempSync(path.join(os.tmpdir(), "miku-qa-check-"));
const results = [];
const check = (area, what, ok, detail = "") => {
  results.push({ area, what, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  [${area}] ${what}${!ok && detail ? `  (${detail})` : ""}`);
};

const qa = await startQa({ empty: true, fakeNexon: true, devPage: false, onEnd: () => process.exit(1) });
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !m.text().includes("Failed to load resource") && errors.push(`console: ${m.text()}`));
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
  const text = (sel) => page.locator(sel).first().innerText().catch(() => null);
  const count = (sel) => page.locator(sel).count();
  const tabNames = () => page.locator(".ctab b").allInnerTexts();
  const go = async (where = "/") => {
    await page.goto(BASE + where);
    await page.waitForLoadState("networkidle");
  };
  const settle = (ms = 400) => page.waitForTimeout(ms);
  const api = async (method, where, body) => {
    const r = await page.request.fetch(`${BASE}/api${where}`, { method, data: body, failOnStatusCode: false });
    return { status: r.status(), json: await r.json().catch(() => null) };
  };
  const nexon = (action, body) => fetch(`${FAKE_NEXON}/control/${action}`, { method: "POST", body: JSON.stringify(body) });
  const refresh = () => execFileSync("npx", ["tsx", "scripts/refresh.ts"], { cwd: path.join(repo, "server"), env: qa.env, encoding: "utf8" });
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);

  // ---------- the rail and pages ----------
  await go("/");
  for (const [label, where, heading] of [["EXP table", "/exp-table", "EXP table (GMS)"], ["Themes", "/themes", "Themes"], ["TBD", "/tbd/1", "TBD"], ["Home", "/", null]]) {
    await page.locator(".rail a", { hasText: label }).first().click();
    await page.waitForFunction((l) => document.querySelector(".rail a.active")?.textContent?.includes(l), label, { timeout: 3000 }).catch(() => {});
    const url = new URL(page.url()).pathname;
    check("Rail", `"${label}" opens ${where} and is highlighted`, url === where && (await text(".rail a.active"))?.includes(label) && (!heading || (await text("h1.page-title")) === heading), url);
  }
  check("Rail", "four TBD tabs", (await page.locator(".rail a", { hasText: "TBD" }).count()) === 4);
  for (let n = 1; n <= 4; n++) {
    await go(`/tbd/${n}`);
    check("TBD", `/tbd/${n} shows the placeholder`, (await text(".notice")) === "A feature still to be decided.");
  }
  await go("/no-such-page");
  check("Rail", "an unknown address goes to Home", new URL(page.url()).pathname === "/");
  await go("/themes");
  check("Rail", "reloading on a page stays on it", (await text("h1.page-title")) === "Themes");

  // ---------- an empty start ----------
  await go("/");
  check("Home", "no characters yet: says so", (await text(".notice")) === "No characters on Kronos yet. Use + to add one.");
  check("Home", "not checked yet: says so", /Not checked yet/.test((await text(".updated")) ?? ""));

  // ---------- the + box ----------
  const plus = page.locator(".add-tab");
  const search = async (name, wait = true) => {
    await page.locator('input[aria-label="Character name"]').fill(name);
    await page.locator(".popover button[type=submit]").click();
    if (wait) await page.waitForFunction(() => !document.querySelector(".popover button[type=submit]")?.disabled, null, { timeout: 30000 });
    await settle(200);
  };
  await plus.click();
  check("Add box", "+ opens the box, titled with the world", (await text(".popover h3")) === "Add a character on Kronos");
  check("Add box", "the name field has focus", await page.locator('input[aria-label="Character name"]').evaluate((el) => el === document.activeElement));
  const plusBox = await plus.boundingBox();
  const popBox = await page.locator(".popover").boundingBox();
  check("Add box", "it opens just below the +, left edges lined up", Math.abs(popBox.x - plusBox.x) < 2 && popBox.y >= plusBox.y + plusBox.height - 4);
  await page.keyboard.press("Escape");
  check("Add box", "Escape closes it", (await count(".popover")) === 0);
  await plus.click();
  await page.mouse.click(700, 800);
  check("Add box", "a click outside closes it", (await count(".popover")) === 0);
  await plus.click();
  await plus.click();
  check("Add box", "clicking + again closes it", (await count(".popover")) === 0);
  await plus.click();
  for (const [typed, why] of [["", "empty"], ["a b", "a space"], ["Miku!", "a symbol"], ["ABCDEFGHIJKLM", "13 characters"], ["ミク", "non-Latin letters"]]) {
    await search(typed, false);
    check("Add box", `refuses a name with ${why} before asking Nexon`, (await text(".popover .error")) === "Names are 1–12 letters and numbers");
  }
  await search("Nobody1");
  check("Add box", "a name nobody has: not found", /No character named Nobody1/.test((await text(".popover .error")) ?? ""));
  await search("SakuraRin");
  check("Add box", "a character on the other world says which", (await text(".popover .error")) === "SakuraRin is on Hyperion, not Kronos.");
  await nexon("set", { name: "Broken", worldID: 45, level: 200, exp: 5_000_000_000, jobName: "Hero", worldRank: 5, overallRank: 5 }); // more EXP than level 200 has
  await search("Broken");
  check("Add box", "numbers that don't fit the EXP table are refused, saying why", /doesn't fit the EXP table/.test((await text(".popover .error")) ?? ""));
  await search("mikubeam");
  const found = (await text(".found")) ?? "";
  check("Add box", "the preview: Nexon's spelling, job, level, ranks, Legion", /MikuBeam/.test(found) && /Kanna/.test(found) && /285/.test(found) && /#6,390/.test(found) && /#19,172/.test(found) && /5,804/.test(found), found.replace(/\n/g, " | "));
  const img = await page.locator(".found img").evaluate((i) => [i.naturalWidth, i.getBoundingClientRect().width]);
  check("Add box", "the avatar arrives (from the server) and shows at 2×", img[0] === 96 && img[1] === 192, String(img));
  const pop2 = await page.locator(".popover").boundingBox();
  const top = await page.locator(".block.top").boundingBox();
  check("Add box", "with a result it still fits inside its section", pop2.x >= top.x - 1 && pop2.x + pop2.width <= top.x + top.width + 1);
  await shot("01-add-preview");
  const t0 = Date.now();
  await page.locator(".found-add").click();
  await page.waitForFunction(() => [...document.querySelectorAll(".ctab b")].some((b) => b.textContent === "MikuBeam"), null, { timeout: 10000 });
  check("Add", "Add is instant after a search (remembered)", Date.now() - t0 < 1000, `${Date.now() - t0} ms`);
  check("Add", "the box closes and the new character is selected", (await count(".popover")) === 0 && (await text('.ctab[aria-selected="true"] b')) === "MikuBeam");
  const addOne = async (name) => {
    await plus.click();
    await search(name);
    await page.locator(".found-add").click();
    await page.waitForFunction((n) => [...document.querySelectorAll(".ctab b")].some((b) => b.textContent === n), name, { timeout: 15000 });
    await settle();
  };
  await addOne("LeekSpin");
  check("Legion", "a world's Legion shows on its other characters, from whoever it's listed under", /listed under MikuBeam/.test((await text("main")) ?? ""));
  await addOne("MaxedOut");
  const maxed = (await text("main")) ?? "";
  check("Level 300", "the summary says it's the highest level", /Level 300: the highest level\./.test(maxed));
  check("Level 300", "Time to level: nothing left to reach", /Level 300: nothing left to reach\./.test(maxed));
  check("New character", "the chart says there's no history yet", /No EXP history yet/.test(maxed));
  check("New character", "the range boxes show dashes", (await page.locator(".range-avg").allInnerTexts()).every((t) => t.startsWith("—")));
  await plus.click();
  await search("MikuBeam");
  check("Add box", "an added character shows 'Added', disabled", (await text(".found-add")) === "Added" && (await page.locator(".found-add").isDisabled()));
  await page.keyboard.press("Escape");
  check("API", "adding a duplicate directly is refused (409)", (await api("POST", "/characters", { world: 45, name: "mikubeam" })).status === 409);
  await shot("02-level-300");

  // ---------- Hyperion ----------
  await page.locator("button", { hasText: "Hyperion" }).first().click();
  await settle(600);
  check("Worlds", "Hyperion starts empty, and says so", (await text(".notice")) === "No characters on Hyperion yet. Use + to add one.");
  await addOne("NewHere");
  check("Legion", "N/A until the world's Legion character is added", /N\/A/.test((await text("main")) ?? ""));
  await addOne("SakuraRin");
  await page.locator(".ctab", { hasText: "NewHere" }).click();
  await settle();
  check("Legion", "…then shown on the world's others", /4,200/.test((await text("main")) ?? "") && /listed under SakuraRin/.test((await text("main")) ?? ""));
  await go("/");
  check("Worlds", "the world choice is saved", (await text('[aria-label="World"] [aria-pressed="true"]')) === "Hyperion");
  await page.locator("button", { hasText: "Kronos" }).first().click();
  await settle(600);
  check("Worlds", "each world keeps its own characters", (await tabNames()).join(",") === "MikuBeam,LeekSpin,MaxedOut", (await tabNames()).join(","));

  // ---------- selecting, reordering, deleting ----------
  await page.locator(".ctab", { hasText: "LeekSpin" }).click();
  await settle();
  await go("/");
  check("Select", "the selection is saved", (await text('.ctab[aria-selected="true"] b')) === "LeekSpin");
  await page.locator(".ctab", { hasText: "MaxedOut" }).focus();
  await page.keyboard.press("Alt+ArrowLeft");
  await settle(600);
  check("Reorder", "Alt+← moves a tab left", (await tabNames()).join(",") === "MikuBeam,MaxedOut,LeekSpin", (await tabNames()).join(","));
  await page.keyboard.press("Alt+ArrowLeft");
  await page.keyboard.press("Alt+ArrowLeft"); // already first
  await settle(600);
  check("Reorder", "Alt+← at the start stays first", (await tabNames()).join(",") === "MaxedOut,MikuBeam,LeekSpin", (await tabNames()).join(","));
  await page.locator(".ctab", { hasText: "MaxedOut" }).dragTo(page.locator(".ctab", { hasText: "LeekSpin" }));
  await settle(800);
  check("Reorder", "dragging a tab onto another moves it there", (await tabNames()).join(",") === "MikuBeam,LeekSpin,MaxedOut", (await tabNames()).join(","));
  await go("/");
  check("Reorder", "the order is saved", (await tabNames()).join(",") === "MikuBeam,LeekSpin,MaxedOut");
  await page.locator(".ctab", { hasText: "MaxedOut" }).click();
  await page.keyboard.press("Alt+ArrowRight"); // already last: a move that goes nowhere
  let asked = "";
  page.once("dialog", (d) => ((asked = d.message()), d.dismiss()));
  await page.locator(".danger-link").click();
  await settle();
  check("Delete", "asks first, warning that history goes too", asked === "Delete MaxedOut? This also deletes all of its saved history.", asked);
  check("Delete", "Cancel keeps it", (await tabNames()).includes("MaxedOut"));
  page.once("dialog", (d) => d.accept());
  await page.locator(".danger-link").click();
  await page.waitForFunction(() => ![...document.querySelectorAll(".ctab b")].some((b) => b.textContent === "MaxedOut"), null, { timeout: 10000 }).catch(() => {});
  check("Delete", "OK deletes it (even right after a move that went nowhere), the rest stay in order", (await tabNames()).join(",") === "MikuBeam,LeekSpin");
  check("API", "deleting an unknown character: 404", (await api("DELETE", "/characters/99999")).status === 404);

  // ---------- a known history: 90 days for MikuBeam ----------
  // 1T a day, except: 3 days ago 0, 6 days ago not checked (so 5 days ago covers 2 days, 2T), and today 0.4T so far.
  const db = new Database(path.join(qa.dir, "miku.db"));
  const miku = db.prepare("SELECT id, level, exp FROM Character WHERE name = 'MikuBeam'").get();
  const T = 1e12;
  const day = (back) => new Date(Date.now() - back * 864e5).toISOString().slice(0, 10);
  const gains = Array.from({ length: 100 }, (_, i) => {
    const back = 99 - i;
    return back === 6 ? null : back === 3 ? 0 : back === 5 ? 2 * T : back === 0 ? 0.4 * T : back === 99 ? 0 : T;
  });
  const now = db.prepare("SELECT totalExp FROM Snapshot WHERE characterId = ?").get(miku.id).totalExp;
  db.prepare("DELETE FROM Snapshot WHERE characterId = ?").run(miku.id);
  let total = Number(now) - gains.reduce((s, g) => s + (g ?? 0), 0);
  const insert = db.prepare("INSERT INTO Snapshot (characterId, capturedAt, day, level, exp, totalExp, gained, worldRank) VALUES (?, ?, ?, 285, 0, ?, ?, 6390)");
  gains.forEach((g, i) => {
    if (g === null) return;
    total += g;
    insert.run(miku.id, new Date().toISOString(), day(99 - i), BigInt(total), BigInt(g));
  });
  db.close();
  await page.locator(".ctab", { hasText: "MikuBeam" }).click();
  await go("/");
  const boxes = await page.locator(".range-box").allInnerTexts();
  // By hand: 7 days = today .4 + 1 + 1 + 0 + 1 + 2 (2 days) + … the 7th day back is the missed one, so it starts from the end of day 7 back:
  // 0.4 + 1 + 1 + 0 + 1 + 2 = 5.4T over 7 days (6 back had no snapshot: from the end of 7 back, 7 days to today).
  check("Ranges", "7 days: 5.4T total, 771B a day, by hand", /771B/.test(boxes[0]) && /5\.40T/.test(boxes[0]), boxes[0].replace(/\n/g, " "));
  // 14 days: 5.4 + 7 more 1T days = 12.4T over 14 days.
  check("Ranges", "14 days: 12.4T total, 886B a day, by hand", /886B/.test(boxes[1]) && /12\.4T/.test(boxes[1]), boxes[1].replace(/\n/g, " "));
  // 90 days: 12.4 + 76 more 1T days = 88.4T over 90 days.
  check("Ranges", "90 days: 88.4T total, 982B a day, by hand", /982B/.test(boxes[3]) && /88\.4T/.test(boxes[3]), boxes[3].replace(/\n/g, " "));
  for (const d of [7, 14, 30, 90]) {
    await page.locator('section[aria-label="EXP"] .segmented button', { hasText: `${d} days` }).click();
    await settle(200);
    check("Ranges", `the "${d} days" button shows ${d} bars and highlights its box`, (await count(".bar-col")) === d && (await text(".range-box.on .range-name"))?.toLowerCase() === `${d} days`);
  }
  await page.locator(".range-box").nth(0).click();
  await settle(200);
  check("Ranges", "clicking a box picks its range (the buttons follow)", (await count(".bar-col")) === 7 && (await text('section[aria-label="EXP"] .segmented [aria-pressed="true"]')) === "7 days");
  const labels = await page.locator(".bar-label").allInnerTexts();
  check("Chart", "7 bars: amounts, the 0 day, the missed day empty, '2 days', today so far", labels.map((l) => l.replace(/\n/g, " ")).join("|") === "|2.00T 2 days|1.00T|0|1.00T|1.00T|400B", labels.join("|"));
  check("Chart", "the last bar is today, dated 'Today'", (await page.locator(".xaxis span").last().innerText()) === "Today" && /\(today\)/.test((await page.locator(".bar-col").last().getAttribute("title")) ?? ""));
  check("Chart", "the missed day says so in its tooltip", /no data/.test((await page.locator(".bar-col").first().getAttribute("title")) ?? ""));
  check("Chart", "the countdown to 00:00 UTC is shown", /New day in \d+h \d\dm \d\ds/.test((await text(".countdown")) ?? ""));
  const ttl = (await text('section[aria-label="Time to level"]')) ?? "";
  check("Time to level", "follows the chosen range (7 days)", /7-day average of 771B/.test(ttl), ttl.replace(/\n/g, " | ").slice(0, 120));
  await shot("03-history");

  // ---------- a refresh: a level-up, and a character that disappears ----------
  await nexon("set", { name: "MikuBeam", level: 286, exp: 1_000 });
  await nexon("remove", { name: "LeekSpin" });
  const out = refresh();
  check("Refresh", "the run checks both worlds: 3 updated, 1 not found", /Checked 4: 3 updated, 1 not found, 0 failed/.test(out), out.trim());
  await go("/");
  check("Refresh", "the level-up shows (286) in the tab and summary", (await text('.ctab[aria-selected="true"] small'))?.startsWith("Lv. 286") && /286/.test((await text(".hero")) ?? ""));
  check("Refresh", "today's bar grew by the EXP to the level-up", (await page.locator(".bar-label").last().innerText()) !== "400B");
  check("Refresh", "the last check shows at the top", /Checked Nexon/.test((await text(".updated")) ?? ""));
  await page.locator(".ctab", { hasText: "LeekSpin" }).click();
  await settle();
  check("Refresh", "a character Nexon no longer has is marked, keeping its numbers", /Not found in Nexon's rankings since/.test((await text("main")) ?? ""));
  await nexon("reset", {});

  // ---------- EXP table ----------
  await go("/exp-table");
  check("EXP table", "says which patch it's current as of", /v\.271/.test((await text(".section-head")) ?? ""));
  for (const label of await page.locator(".segmented button").allInnerTexts()) {
    await page.locator(".segmented button", { hasText: label }).click();
    await settle(150);
    check("EXP table", `"${label}" is chosen and lists levels`, (await text('.segmented button[aria-pressed="true"]')) === label && (await count(".exp-table tbody tr")) > 0);
  }
  const jump = async (v) => {
    await page.locator('input[aria-label="Jump to level"]').fill(v);
    await page.locator("form.search button").click();
    await settle(250);
  };
  for (const [v, want] of [["250", "250"], ["15", "15"], [" 42 ", "42"], ["299", "299"]]) {
    await jump(v);
    check("EXP table", `jump to "${v}" highlights level ${want}`, (await text('tr[aria-current="true"] b')) === want);
  }
  for (const bad of ["0", "300", "abc", "", "-5", "2.5"]) {
    await jump(bad);
    check("EXP table", `jump to "${bad}" is refused with a message`, (await text('[role="alert"]')) === "Enter a level from 1 to 299.");
  }

  // ---------- themes, and the Ren sky after switching ----------
  const redPetals = () =>
    page.evaluate(() => {
      const c = document.querySelector("canvas.sky");
      if (!c) return 0;
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 16) if (d[i + 3] > 0 && d[i] > 150 && d[i + 1] < 120) n++;
      return n;
    });
  await go("/themes");
  check("Themes", "Ren draws its sky with red petals and blossoms", (await redPetals()) > 50);
  await page.locator(".theme-card", { hasText: "Pochacco" }).click();
  await settle(800);
  check("Themes", "Pochacco: in use, the page switches, no sky", (await theme()) === "pochacco" && (await count("canvas.sky")) === 0 && /In use/.test((await text('.theme-card[aria-pressed="true"]')) ?? ""));
  await go("/");
  check("Themes", "the theme is saved", (await theme()) === "pochacco");
  await go("/themes");
  await page.locator(".theme-card", { hasText: "Ren" }).click();
  await settle(1200);
  check("Themes", "back to Ren: the sky is red again, not black (v1.0.0's bug)", (await theme()) === "ren" && (await redPetals()) > 50);
  await shot("04-ren-after-switch");

  // ---------- when things go wrong (answers faked in this browser only) ----------
  const failing = async (pattern, where, expectText, what) => {
    await page.route(pattern, (r) => r.fulfill({ status: 500, json: { error: "Server error" } }));
    await go(where);
    await settle(500);
    const alerts = (await page.locator('[role="alert"]').allInnerTexts()).join(" | ");
    check("Errors", what, alerts.includes(expectText), alerts);
    await page.unroute(pattern);
  };
  await failing("**/api/characters?*", "/", "Couldn't load the characters: Server error", "the character list can't load: says so");
  await failing("**/api/characters/*/progress", "/", "Couldn't load the EXP history: Server error", "the EXP history can't load: says so");
  await failing("**/api/exp-table", "/exp-table", "Couldn't load the EXP table: Server error", "the EXP table can't load: says so");
  await failing("**/api/refresh", "/", "", "the refresh status can't load");
  check("Errors", "…and Home still works", (await count(".ctab")) === 2);
  await go("/themes");
  await page.route("**/api/settings", (r) => (r.request().method() === "PUT" ? r.fulfill({ status: 500, json: { error: "Server error" } }) : r.continue()));
  await page.locator(".theme-card", { hasText: "Pochacco" }).click();
  await settle(500);
  check("Errors", "a theme that can't be saved says so", (await text('[role="alert"]')) === "Couldn't save the theme: Server error");
  await page.unroute("**/api/settings");
  await go("/");
  await page.route("**/api/search?*", (r) => r.abort());
  await plus.click();
  await search("MikuBeam");
  check("Errors", "a search with the server unreachable says so plainly", (await text(".popover .error")) === "Couldn't reach MikuTracker's server. Is it running?");
  await page.unroute("**/api/search?*");
  await page.keyboard.press("Escape");
  await page.route("**/api/characters/order", (r) => r.fulfill({ status: 500, json: { error: "Couldn't save the order" } }));
  await page.locator(".ctab", { hasText: "MikuBeam" }).focus();
  await page.keyboard.press("Alt+ArrowRight");
  await settle(600);
  check("Errors", "a move that can't be saved goes back, and says so", (await tabNames()).join(",") === "MikuBeam,LeekSpin" && /Couldn't save the order/.test((await page.locator('[role="alert"]').allInnerTexts()).join(" ")));
  await page.unroute("**/api/characters/order");

  // ---------- the server refusing bad requests ----------
  for (const [what, method, where, body, status] of [
    ["search: bad world", "GET", "/search?world=1&name=MikuBeam", undefined, 400],
    ["search: bad name", "GET", "/search?world=45&name=a%20b", undefined, 400],
    ["search: extra field", "GET", "/search?world=45&name=MikuBeam&x=1", undefined, 400],
    ["search: no name", "GET", "/search?world=45", undefined, 400],
    ["add: bad world", "POST", "/characters", { world: 99, name: "MikuBeam" }, 400],
    ["list: bad world", "GET", "/characters?world=12", undefined, 400],
    ["reorder: not the world's characters", "PUT", "/characters/order", { world: 45, ids: [99999] }, 400],
    ["select: unknown", "POST", "/characters/99999/select", undefined, 404],
    ["progress: unknown", "GET", "/characters/99999/progress", undefined, 404],
    ["progress: not a number", "GET", "/characters/abc/progress", undefined, 400],
    ["settings: unknown theme", "PUT", "/settings", { theme: "nope" }, 400],
    ["settings: bad world", "PUT", "/settings", { worldId: 3 }, 400],
  ]) {
    const r = await api(method, where, body);
    check("API", `${what}: ${status}`, r.status === status, `${r.status} ${JSON.stringify(r.json)}`);
  }

  // ---------- a narrower window ----------
  await page.setViewportSize({ width: 900, height: 900 });
  await go("/");
  check("Layout", "at 900 px wide, no sideways scrolling", (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  await shot("05-narrow");

  check("Page errors", "no errors in the page or its console", errors.length === 0, errors.slice(0, 5).join(" || "));
} catch (error) {
  check("Run", "the click-through ran to the end", false, error instanceof Error ? error.stack : String(error));
} finally {
  await browser.close();
  await qa.stop();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed. Screenshots: ${SHOTS}`);
for (const f of failed) console.log(`FAILED: [${f.area}] ${f.what}${f.detail ? ` (${f.detail})` : ""}`);
process.exit(failed.length ? 1 : 0);
