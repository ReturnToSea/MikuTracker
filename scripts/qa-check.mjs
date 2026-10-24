// npm run qa:check: clicks through every button and edge case of the production build, in a real
// browser (Chrome), on a QA copy started empty with the fake Nexon. Nothing here touches your data
// or the internet, and nothing depends on your characters: it adds made-up ones, writes a known
// history into the copy, and makes the fake Nexon level one up and lose another. Run before each
// version (CLAUDE.md). Screenshots go to the folder it prints. Exit status 1 if anything failed.
//   CHROME=/path/to/chrome  if Chrome isn't in /Applications
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
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
  for (const [label, where, heading] of [["EXP table", "/exp-table", "EXP table (GMS)"], ["Themes", "/themes", "Themes"], ["Gear", "/gear", null], ["Bosses", "/bosses", null], ["Checklist", "/checklist", null], ["Symbols", "/symbols", null], ["Home", "/", null]]) {
    await page.locator(".rail a", { hasText: label }).first().click();
    await page.waitForFunction((l) => document.querySelector(".rail a.active")?.textContent?.includes(l), label, { timeout: 3000 }).catch(() => {});
    const url = new URL(page.url()).pathname;
    check("Rail", `"${label}" opens ${where} and is highlighted`, url === where && (await text(".rail a.active"))?.includes(label) && (!heading || (await text("h1.page-title")) === heading), url);
  }
  check("Rail", "no TBD tab left: Gear comes after Bosses, Checklist and Symbols", (await page.locator(".rail a", { hasText: "TBD" }).count()) === 0 && (await page.locator(".rail a").nth(3).innerText()).includes("Symbols") && (await page.locator(".rail a").nth(4).innerText()).includes("Gear"));
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
    await page.locator('section[aria-label="EXP"] [aria-label="Days shown"] button', { hasText: `${d} days` }).click();
    await settle(200);
    check("Ranges", `the "${d} days" button shows ${d} bars and highlights its box`, (await count(".bar-col")) === d && (await text(".range-box.on .range-name"))?.toLowerCase() === `${d} days`);
  }
  await page.locator(".range-box").nth(0).click();
  await settle(200);
  check("Ranges", "clicking a box picks its range (the buttons follow)", (await count(".bar-col")) === 7 && (await text('section[aria-label="EXP"] [aria-label="Days shown"] [aria-pressed="true"]')) === "7 days");
  const labels = await page.locator(".bar-label").allInnerTexts();
  check("Chart", "7 bars: amounts, the 0 day, the missed day empty, '2 days', today so far", labels.map((l) => l.replace(/\n/g, " ")).join("|") === "|2.00T 2 days|1.00T|0|1.00T|1.00T|400B", labels.join("|"));
  check("Chart", "the last bar is today, dated 'Today'", (await page.locator(".xaxis span").last().innerText()) === "Today" && /\(today\)/.test((await page.locator(".bar-col").last().getAttribute("title")) ?? ""));
  check("Chart", "the missed day says so in its tooltip", /no data/.test((await page.locator(".bar-col").first().getAttribute("title")) ?? ""));
  check("Chart", "the countdown to 00:00 UTC is shown", /New day in \d+h \d\dm \d\ds/.test((await text(".countdown")) ?? ""));
  const ttl = (await text('section[aria-label="Time to level"]')) ?? "";
  check("Time to level", "follows the chosen range (7 days)", /7-day average of 771B/.test(ttl), ttl.replace(/\n/g, " | ").slice(0, 120));
  await shot("03-history");

  // ---------- the Level view (v1.1.0) ----------
  // The same history as levels: MikuBeam ends at 285 and 86.92% (86.5T of 99.5T); 88.4T earlier it was
  // just below 285, so the line crosses into 285 near the start of the 90 days.
  await page.locator(".chart-view button", { hasText: "Level" }).click();
  await settle(300);
  check("Level", "'Level' swaps the bars for the level line (7 days: 7 columns)", (await count(".bar-col")) === 0 && (await count(".level-col")) === 7 && (await count(".level-line polyline")) === 1);
  check("Level", "today's tooltip: Lv. 285 · 86.92%", /Lv\. 285 · 86\.92%/.test((await page.locator(".level-col").last().getAttribute("title")) ?? ""), await page.locator(".level-col").last().getAttribute("title"));
  check("Level", "the missed day has no point, and says so", /no data/.test((await page.locator(".level-col").first().getAttribute("title")) ?? "") && (await count(".level-dot")) === 6);
  await page.locator('section[aria-label="EXP"] [aria-label="Days shown"] button', { hasText: "90 days" }).click();
  await settle(300);
  check("Level", "90 days: the level-up into 285 is marked", (await count(".level-dot.up")) === 1 && /reached 285/.test((await page.locator(".level-col").evaluateAll((cols) => cols.map((c) => c.title).join("|")))), "");
  check("Level", "the scale labels levels", (await page.locator(".yaxis span").allInnerTexts()).some((t) => t === "285"));
  await shot("03b-level");
  await page.locator(".chart-view button", { hasText: "EXP per day" }).click();
  await page.locator('section[aria-label="EXP"] [aria-label="Days shown"] button', { hasText: "7 days" }).click();
  await settle(300);

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

  // ---------- the Bosses tab (v1.2.0) ----------
  // Kronos has MikuBeam and LeekSpin now; Hyperion has NewHere and SakuraRin.
  const card = (name) => page.locator("article.boss-card", { has: page.locator("h2", { hasText: name }) });
  const dialog = page.getByRole("dialog");
  const planCard = (name) => dialog.getByRole("group", { name, exact: true });
  await go("/bosses");
  check("Bosses", "a card for each of the world's characters, in tab order", (await page.locator("article.boss-card h2").allInnerTexts()).join(",") === "MikuBeam,LeekSpin");
  check("Bosses", "nothing planned yet: each card says so", (await page.locator(".boss-empty").count()) === 2);
  check("Bosses", "the weekly reset countdown and the price patch show", /Weekly reset in (\d+d \d+h|\d+h \d+m|\d+m) · \w{3} \d+:\d\d [AP]M your time/.test((await text(".countdown")) ?? "") && /v\.270/.test((await text(".page-head")) ?? ""), await text(".countdown"));
  await card("MikuBeam").getByRole("button", { name: "Plan bosses…" }).click();
  check("Planner", "opens for that character, with focus inside", (await dialog.getByRole("heading").first().innerText()) === "Plan bosses · MikuBeam" && (await dialog.evaluate((d) => d === document.activeElement)));
  check("Planner", "lists every boss once: 28 weekly, then Black Mage", (await dialog.getByRole("group").filter({ has: page.locator(".plan-pick") }).count()) === 29 && (await dialog.locator(".plan-grid").last().locator(".plan-card").count()) === 1);
  check("Planner", "a boss not in the plan has its controls off", (await planCard("Magnus").getByRole("button", { name: "Hard" }).isDisabled()) && (await planCard("Magnus").getByRole("button", { name: "More people" }).isDisabled()));
  if (existsSync(path.join(qa.dir, "boss-art"))) {
    const art = await planCard("Lucid").locator("img").evaluate((i) => [i.naturalWidth, i.getBoundingClientRect().width, getComputedStyle(i).imageRendering]);
    check("Planner", "banners show at 2× with sharp pixels", art[0] === 135 && art[1] === 270 && art[2] === "pixelated", String(art));
  }
  const fifteen = ["Zakum", "Papulatus", "Vellum", "Akechi Mitsuhide", "Lotus", "Damien", "Guardian Angel Slime", "Lucid", "Will", "Gloom", "Verus Hilla", "Darknell", "Chosen Seren", "Kalos the Guardian", "First Adversary"];
  for (const n of fifteen) await dialog.getByRole("checkbox", { name: `Plan ${n}` }).click();
  await planCard("Lotus").getByRole("button", { name: "Extreme" }).click();
  const more = planCard("Lotus").getByRole("button", { name: "More people" });
  await more.click();
  check("Planner", "Extreme Lotus: a party of 2 at most, and the meso per person halves", (await planCard("Lotus").locator(".plan-party").innerText()).includes("party of 2") && (await more.isDisabled()) && (await planCard("Lotus").locator(".plan-meso").innerText()) === "699M");
  check("Planner", "15 weekly bosses: warns that the least valuable won't count", /15 weekly bosses · 1 over the 14-crystal limit/.test(await dialog.locator(".modal-head").innerText()));
  await dialog.getByRole("checkbox", { name: "Plan Black Mage" }).click();
  check("Planner", "Black Mage adds a monthly amount", /4\.50B a month/.test(await dialog.locator(".modal-head").innerText()));
  await shot("06-planner");
  await page.keyboard.press("Escape");
  check("Planner", "Escape closes it without saving", (await dialog.count()) === 0 && (await page.locator(".boss-empty").count()) === 2);
  await card("MikuBeam").getByRole("button", { name: "Plan bosses…" }).click();
  check("Planner", "opening again starts from the saved plan", !(await dialog.getByRole("checkbox", { name: "Plan Zakum" }).isChecked()));
  for (const n of [...fifteen, "Black Mage"]) await dialog.getByRole("checkbox", { name: `Plan ${n}` }).click();
  await dialog.getByRole("button", { name: "Save" }).click();
  await dialog.waitFor({ state: "detached" });
  const mikuCard = card("MikuBeam");
  check("Bosses", "the saved plan shows in game order", (await mikuCard.locator(".boss-row input").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).join(",") === [...fifteen, "Black Mage"].map((n) => `${n} cleared`).join(","));
  check("Bosses", "the cheapest weekly crystal (Zakum) isn't counted, with a warning", (await mikuCard.locator(".boss-row.over input").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).join() === "Zakum cleared" && /1 over the 14-crystal limit/.test(await mikuCard.innerText()));
  await mikuCard.getByRole("checkbox", { name: "Lucid cleared" }).click();
  await mikuCard.getByRole("checkbox", { name: "Black Mage cleared" }).click();
  await settle();
  await go("/bosses");
  check("Bosses", "ticks are saved: still ticked after reloading", (await mikuCard.getByRole("checkbox", { name: "Lucid cleared" }).isChecked()) && (await mikuCard.getByRole("checkbox", { name: "Black Mage cleared" }).isChecked()));
  check("Bosses", "the totals count the tick: 1 / 15 cleared", /1 \/ 15/.test(await page.locator(".boss-stats").innerText()) && (await mikuCard.locator(".boss-card-sum").innerText()).startsWith("1 / 15 cleared"));
  await shot("07-bosses");
  // A week and a month go by: the ticks are moved into the past (the server keeps them as last week's).
  const bossDb = new Database(path.join(qa.dir, "miku.db"));
  bossDb.prepare("UPDATE BossClear SET period = '2000-01-06' WHERE boss = 'lucid'").run();
  await go("/bosses");
  check("Bosses", "after the weekly reset: unticked, the plan kept", !(await mikuCard.getByRole("checkbox", { name: "Lucid cleared" }).isChecked()) && (await mikuCard.locator(".boss-row").count()) === 16);
  check("Bosses", "the monthly tick stays through the weekly reset", await mikuCard.getByRole("checkbox", { name: "Black Mage cleared" }).isChecked());
  bossDb.prepare("UPDATE BossClear SET period = '2000-01' WHERE boss = 'black_mage'").run();
  bossDb.close();
  await go("/bosses");
  check("Bosses", "after the monthly reset: Black Mage unticked", !(await mikuCard.getByRole("checkbox", { name: "Black Mage cleared" }).isChecked()));
  await page.getByRole("button", { name: "Hyperion" }).click();
  await settle();
  const hyperion = (await page.locator("article.boss-card h2").allInnerTexts()).join(",");
  check("Bosses", "the world switch shows Hyperion's characters", hyperion === "NewHere,SakuraRin", hyperion);
  await page.getByRole("button", { name: "Kronos" }).click();
  await settle();
  for (const [what, method, where, body, status] of [
    ["bosses: bad world", "GET", "/bosses?world=3", undefined, 400],
    ["plan: unknown boss", "PUT", `/bosses/${miku.id}/plan`, { plan: [{ boss: "nobody", difficulty: "Hard", partySize: 1 }] }, 400],
    ["plan: a party too big", "PUT", `/bosses/${miku.id}/plan`, { plan: [{ boss: "limbo", difficulty: "Hard", partySize: 4 }] }, 400],
    ["tick: a boss not planned", "PUT", `/bosses/${miku.id}/clears/magnus`, { cleared: true }, 409],
    ["tick: unknown character", "PUT", "/bosses/99999/clears/zakum", { cleared: true }, 404],
  ]) {
    const r = await api(method, where, body);
    check("API", `${what}: ${status}`, r.status === status, `${r.status} ${JSON.stringify(r.json)}`);
  }

  // ---------- the Checklist tab (v1.3.0) ----------
  // Kronos: MikuBeam and LeekSpin; Hyperion: NewHere and SakuraRin.
  const col = (name) => page.getByRole("region", { name });
  const box = (name) => page.getByRole("checkbox", { name, exact: true });
  const planTasks = async (who, tasks) => {
    await page.getByRole("tab", { name: new RegExp(who) }).click();
    await page.getByRole("button", { name: "Plan tasks…" }).click();
    for (const t of tasks) await page.getByRole("dialog").getByRole("checkbox", { name: `Plan ${t}`, exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
  };
  await go("/checklist");
  check("Checklist", "a tab for each of the world's characters", (await page.getByRole("tab").allInnerTexts()).map((t) => t.split("\n")[0]).join(",") === "MikuBeam,LeekSpin");
  check("Checklist", "nothing planned yet: both columns say so", (await page.getByText("Nothing planned.").count()) === 2);
  check("Checklist", "the countdowns: daily and weekly resets in your time", /Daily reset in .+your time/s.test(await page.locator(".checklist-side").innerText()) && /Weekly reset in .+your time/s.test(await page.locator(".checklist-side").innerText()));
  await page.getByRole("button", { name: "Plan tasks…" }).click();
  const menu = page.getByRole("dialog");
  const menuHeads = (await menu.getByRole("heading", { level: 3 }).allInnerTexts()).join("|");
  check("Planner", "the checklist menu lists every preset (29) by reset", (await menu.getByRole("checkbox").count()) === 29 && /^daily · 00:00 utc\|weekly$/i.test(menuHeads), `${await menu.getByRole("checkbox").count()} boxes; ${menuHeads}`);
  check("Planner", "a level above the character's is flagged (Geardock 295 vs MikuBeam 286)", (await menu.getByText("295+ (above Lv. 286)").count()) === 1);
  await page.keyboard.press("Escape");
  await planTasks("MikuBeam", ["Cernium", "Monster Park", "Ursus", "Erda Spectrum", "Epic Dungeon"]);
  check("Checklist", "the plan shows by category: Sacred and Other daily, Arcane and Other weekly", (await col("Daily").getByRole("heading", { level: 3 }).allInnerTexts()).join("|").toLowerCase() === "sacred symbols|other" && (await col("Weekly").getByRole("heading", { level: 3 }).allInnerTexts()).join("|").toLowerCase() === "arcane symbols|other");
  await box("Cernium done").click();
  await box("Ursus done").click();
  await box("Monster Park done").click();
  await settle();
  await go("/checklist");
  check("Checklist", "ticks are saved: still done after reloading, counted in the tab", (await box("Cernium done").isChecked()) && (await page.getByRole("tab", { name: /MikuBeam/ }).innerText()).includes("D 3/3"));
  await planTasks("LeekSpin", ["Ursus", "Monster Park"]);
  check("Checklist", "Ursus (once per account) done by MikuBeam: greyed out on LeekSpin, saying who", (await box("Ursus done").isDisabled()) && (await col("Daily").getByText("done by MikuBeam").count()) === 1);
  await box("Monster Park done").click();
  await settle();
  check("Checklist", "Monster Park: the second character of the world can still do it", await box("Monster Park done").isChecked());
  check("Checklist", "the side panel shows who used each limit", /Monster Park\s+2\/2 per world · MikuBeam, LeekSpin/.test(await page.locator(".limits").innerText()) && /Ursus\s+1\/1 per account · MikuBeam/.test(await page.locator(".limits").innerText()));
  await page.getByRole("button", { name: "Hyperion" }).click();
  await settle();
  await planTasks("NewHere", ["Ursus", "Monster Park"]);
  check("Checklist", "per account reaches the other world (Ursus blocked on Hyperion); per world doesn't (Monster Park free)", (await box("Ursus done").isDisabled()) && !(await box("Monster Park done").isDisabled()));
  await page.getByRole("button", { name: "Kronos" }).click();
  await settle();
  // your own task: weekly on Monday, on Kronos only
  await page.getByRole("button", { name: "New task…" }).click();
  const tform = page.getByRole("dialog", { name: "New task" });
  await tform.getByLabel("Name").fill("Mondays");
  await tform.getByRole("button", { name: "Weekly" }).click();
  await tform.getByRole("combobox", { name: "Reset day" }).selectOption({ label: "Monday" });
  await tform.getByRole("button", { name: "Kronos" }).click();
  await tform.getByRole("button", { name: "Add task" }).click();
  await tform.waitFor({ state: "detached" });
  await planTasks("MikuBeam", ["Mondays"]);
  check("Custom tasks", "a new weekly task (Monday) is planned and shown with its day and a custom badge", (await col("Weekly").getByText("resets Mon").count()) === 1 && (await col("Weekly").getByText("custom").count()) === 1);
  await box("Mondays done").click();
  await settle();
  // a day and a week go by: the ticks move into the past
  const clDb = new Database(path.join(qa.dir, "miku.db"));
  clDb.prepare("UPDATE ChecklistTick SET period = '2000-01-03' WHERE task = 'cernium'").run();
  await go("/checklist");
  check("Checklist", "after the daily reset: Cernium unticked, Ursus still ticked (its own tick moved nothing)", !(await box("Cernium done").isChecked()) && (await box("Ursus done").isChecked()));
  clDb.prepare("UPDATE ChecklistTick SET period = '2000-01-06' WHERE task = 'ursus'").run();
  clDb.close();
  await go("/checklist");
  await page.getByRole("tab", { name: /LeekSpin/ }).click();
  check("Checklist", "once Ursus's tick is in the past, LeekSpin can do it", !(await box("Ursus done").isDisabled()));
  await shot("08-checklist");
  // delete the custom task from the planning menu
  page.once("dialog", (d) => d.accept());
  await page.getByRole("tab", { name: /MikuBeam/ }).click();
  await page.getByRole("button", { name: "Plan tasks…" }).click();
  await page.getByRole("button", { name: "Change Mondays" }).click();
  await page.getByRole("dialog", { name: "Change Mondays" }).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog", { name: "Change Mondays" }).waitFor({ state: "detached" });
  await page.keyboard.press("Escape");
  await settle();
  check("Custom tasks", "deleted: off MikuBeam's checklist", (await page.getByText("Mondays").count()) === 0);
  for (const [what, method, where, body, status] of [
    ["checklist: bad world", "GET", "/checklist?world=3", undefined, 400],
    ["checklist plan: unknown task", "PUT", `/checklist/${miku.id}/plan`, { tasks: ["nobody"] }, 400],
    ["checklist tick: a task not planned", "PUT", `/checklist/${miku.id}/ticks/geardock`, { done: true }, 409],
    ["custom task: no name", "POST", "/checklist/tasks", { name: " ", category: "other", reset: "daily", weekday: null, worlds: "both", limitScope: "character", limitCount: 1 }, 400],
  ]) {
    const r = await api(method, where, body);
    check("API", `${what}: ${status}`, r.status === status, `${r.status} ${JSON.stringify(r.json)}`);
  }

  // ---------- the Symbols tab (v1.4.0) ----------
  const symCard = (name) => page.getByRole("group", { name, exact: true });
  const typeIn = async (label, value) => {
    const box = page.getByRole("spinbutton", { name: label, exact: true });
    await box.fill(String(value));
    await box.press("Enter");
    await settle(300);
  };
  await go("/symbols");
  check("Symbols", "a tab per character; every Arcane symbol starts not unlocked", (await page.getByRole("tab").count()) === 2 && (await page.getByText("not unlocked", { exact: true }).count()) === 6);
  await typeIn("Esfera level", 17);
  await typeIn("Esfera symbols held", 40);
  await typeIn("Arcana level", 19);
  await typeIn("Arcana symbols held", 200);
  await page.getByRole("combobox", { name: "Arcana weekly clears" }).selectOption("3");
  await settle();
  // Arcana: 372 − 200 = 172 left at (7 × 40 + 3 × 80) / 7 ≈ 74.3 a day → 2.3 days; Esfera: 300 + 335 + 372 − 40 = 967 at 40 a day → 24.2 days
  const ttmText = await page.getByRole("region", { name: "Time to max" }).innerText();
  check("Symbols", "time to max worked out by hand: Arcana ≈ 2.3 days, Esfera ≈ 24.2 days (all maxed)", /Arcana\s+2\.3 days/.test(ttmText) && /Esfera\s+24\.2 days/.test(ttmText) && /All maxed\s+24\.2 days/.test(ttmText), ttmText.replace(/\n/g, " | "));
  check("Symbols", "Force: Arcana 210 + Esfera 190 = 400 of 1,320", /400\s*\/ 1320/.test(ttmText));
  // meso: Arcana 19→20 = 10,000 × floor(372 × 15.9) = 59,140,000; Esfera 17→20 = 59,100,000 + 66,330,000 + 74,020,000
  check("Symbols", "meso to go worked out by hand: 258.59M (≈ 259M)", /259M meso to go/.test(ttmText), ttmText.replace(/\n/g, " | "));
  await page.getByRole("spinbutton", { name: "Selector coupons" }).fill("300");
  const advice = await page.getByRole("region", { name: "Selector coupons" }).innerText();
  check("Symbols", "300 coupons: maxed soonest puts them all into Esfera; most Force first finishes Arcana (172)", /Everything maxed soonest\s+Esfera\s+300/.test(advice) && /Most Force soonest\s+Arcana\s+172/.test(advice), advice.replace(/\n/g, " | "));
  check("Symbols", "the forecast graph is drawn", (await page.locator("svg.force-graph path.graph-line").count()) === 1);
  await go("/symbols");
  check("Symbols", "what was typed is saved: still there after reloading", (await page.getByRole("spinbutton", { name: "Esfera level", exact: true }).inputValue()) === "17" && (await page.getByRole("combobox", { name: "Arcana weekly clears" }).inputValue()) === "3");
  await page.getByRole("button", { name: "Sacred", exact: true }).click();
  check("Symbols", "Sacred: 8 symbols, Tallahart and Geardock marked Grand, Geardock without a selector, no weekly clears", (await page.getByRole("group").filter({ has: page.locator(".symbol-top") }).count()) === 8 && (await symCard("Geardock").getByText("no selector").count()) === 1 && (await symCard("Tallahart").getByText("Grand").count()) === 1 && (await page.getByRole("combobox", { name: /weekly clears/ }).count()) === 0);
  await shot("09-symbols");
  for (const [what, method, where, body, status] of [
    ["symbols: bad world", "GET", "/symbols?world=3", undefined, 400],
    ["symbol: above its top level", "PUT", `/symbols/${miku.id}/cernium`, { level: 12, held: 0, days: 7, weekly: 0 }, 400],
    ["symbol: more held than the level takes", "PUT", `/symbols/${miku.id}/cernium`, { level: 9, held: 909, days: 7, weekly: 0 }, 400],
    ["symbol: weekly clears on a Sacred symbol", "PUT", `/symbols/${miku.id}/cernium`, { level: 1, held: 0, days: 7, weekly: 1 }, 400],
    ["symbol: unknown", "PUT", `/symbols/${miku.id}/nowhere`, { level: 1, held: 0, days: 7, weekly: 0 }, 404],
  ]) {
    const r = await api(method, where, body);
    check("API", `${what}: ${status}`, r.status === status, `${r.status} ${JSON.stringify(r.json)}`);
  }

  // ---------- the Gear tab (v1.5.0) ----------
  const slotBtn = (name) => page.getByRole("region", { name: "Equipment window" }).getByRole("button", { name });
  const listBtn = (name) => page.getByRole("region", { name: / slot$/ }).getByRole("button", { name });
  const setsText = () => page.getByLabel("Sets").innerText();
  await go("/gear");
  check("Gear", "a tab per character, MikuBeam (Kanna) first, every slot empty", (await page.getByRole("tab").count()) === 2 && (await text('.ctab[aria-selected="true"] b')) === "MikuBeam" && (await page.locator(".gear-slot").count()) === 28 && (await page.locator('.gear-slot[aria-label$=": empty"]').count()) === 28);
  check("Gear", "the hat list is the Magician's: Mage Crown, no Bandit Cap", (await listBtn(/AbsoLab Mage Crown/).count()) === 1 && (await listBtn(/AbsoLab Bandit Cap/).count()) === 0);
  await listBtn(/AbsoLab Mage Crown/).click();
  await settle();
  check("Gear", "picking an item puts it in the slot", (await slotBtn(/^Hat: AbsoLab Mage Crown/).count()) === 1);
  const iconOk = await slotBtn(/^Hat:/).locator("img").evaluate((img) => img.complete && img.naturalWidth > 0).catch(() => null);
  check("Gear", "its icon loads from the data folder (when the icons were downloaded)", iconOk !== false, String(iconOk));
  await slotBtn(/^Weapon:/).click();
  const weapons = await page.getByRole("region", { name: "Weapon slot" }).locator(".gear-item b").allInnerTexts();
  check("Gear", "Kanna's weapons: the six fans (Fafnir, AbsoLab, Arcane Umbra, Genesis, Destiny ×2)", weapons.length === 6 && weapons.every((w) => /Fan/.test(w)), weapons.join(", "));
  await slotBtn(/^Secondary:/).click();
  const secondaries = (await page.getByRole("region", { name: "Secondary slot" }).locator(".gear-item b").allInnerTexts()).sort().join(", ");
  check("Gear", "Kanna's four secondaries: shop, Frozen, Princess No, Astra", secondaries === "Astra Talisman, Frozen Talisman, Princess No's Talisman, Shikigami Talisman", secondaries);
  // AbsoLab hat, overall, shoes, plus a bottom that the overall covers
  await slotBtn(/^Bottom:/).click();
  await listBtn(/Eternal Mage Pants/).click();
  await slotBtn(/^Top:/).click();
  await listBtn(/AbsoLab Mage Suit/).click();
  await slotBtn(/^Shoes:/).click();
  await listBtn(/AbsoLab Mage Shoes/).click();
  await settle();
  const covered = slotBtn(/^Bottom: Eternal Mage Pants \(not counted/);
  check("Gear", "an overall greys out the saved bottom, which stays saved", (await covered.count()) === 1 && /covered/.test((await covered.getAttribute("class")) ?? ""));
  await covered.click();
  check("Gear", "the covered bottom can still be picked (to empty it), and says it isn't counted", (await text(".gear-panel h2")) === "Bottom" && /overall covers the bottom/.test((await text(".gear-panel p")) ?? ""));
  let sets = await setsText();
  check("Gear", "set counts: AbsoLab 3, the covered Eternal bottom not counted", /AbsoLab\s+3/.test(sets) && !/Eternal/.test(sets), sets.replace(/\n/g, " | "));
  await slotBtn(/^Weapon:/).click();
  await listBtn(/Genesis Spirit Walker Fan/).click();
  await settle();
  sets = await setsText();
  check("Gear", "a Genesis weapon adds +1 lucky to AbsoLab (3 pieces → 4)", /AbsoLab \+1 lucky \(Genesis Spirit Walker Fan\)\s+4/.test(sets), sets.replace(/\n/g, " | "));
  // the special skill rings
  await slotBtn(/^Ring: empty/).first().click();
  await listBtn(/Ring of Restraint Lv\. 4/).click();
  await settle();
  check("Gear", "a Lv. 4 Ring of Restraint shows the + for the passive ring slot", (await slotBtn("Passive ring: empty").count()) === 1);
  await slotBtn("Passive ring: empty").click();
  const passives = await page.getByRole("region", { name: "Passive ring slot" }).locator(".gear-item b").allInnerTexts();
  check("Gear", "the passive slot lists the Weapon Jump rings and the Continuous Ring, not Restraint", passives.some((p) => /Weapon Jump I Ring Lv\. 4/.test(p)) && passives.some((p) => /Continuous Ring/.test(p)) && !passives.some((p) => /Restraint/.test(p)), passives.join(", "));
  await listBtn(/Weapon Jump I Ring Lv\. 4/).click();
  await settle();
  await slotBtn(/^Ring: empty/).first().click();
  check("Gear", "the other ring slots have the special skill rings off", await listBtn(/Continuous Ring Lv\. 5/).isDisabled());
  await slotBtn(/^Ring: Ring of Restraint/).click();
  await listBtn("None").first().click();
  await settle();
  check("Gear", "taking the opener off keeps the passive ring, faded", (await slotBtn(/^Passive ring, kept but not counted: Weapon Jump I Ring Lv\. 4/).count()) === 1);
  await slotBtn(/^Pocket:/).click();
  await page.getByRole("textbox", { name: "Other item" }).fill("Pink Holy Cup (event)");
  await page.getByRole("button", { name: "Use", exact: true }).click();
  await settle();
  check("Gear", "an unlisted item by its typed name", (await slotBtn(/^Pocket: Pink Holy Cup \(event\)/).count()) === 1);
  await go("/gear");
  check("Gear", "everything is saved: still there after reloading", (await slotBtn(/^Hat: AbsoLab Mage Crown/).count()) === 1 && (await slotBtn(/^Pocket: Pink Holy Cup/).count()) === 1 && (await slotBtn(/^Passive ring, kept/).count()) === 1);
  await shot("10-gear");
  await page.locator(".ctab", { hasText: "LeekSpin" }).click();
  await settle();
  check("Gear", "LeekSpin (Bishop) has nothing on, and the Magician's list", (await slotBtn(/^Hat: empty/).count()) === 1 && (await listBtn(/AbsoLab Mage Crown/).count()) === 1);
  for (const [what, method, where, body, status] of [
    ["gear: bad world", "GET", "/gear?world=3", undefined, 400],
    ["gear: unknown slot", "PUT", `/gear/${miku.id}/tail`, { item: "1122447" }, 404],
    ["gear: another class's item", "PUT", `/gear/${miku.id}/hat`, { item: "1003800" }, 400],
    ["gear: an item in the wrong slot", "PUT", `/gear/${miku.id}/hat`, { item: "1122447" }, 400],
    ["gear: the passive ring slot while closed", "PUT", `/gear/${miku.id}/ringP`, { item: "1113116-4" }, 409],
    ["gear: an item and a typed name at once", "PUT", `/gear/${miku.id}/hat`, { item: "1122447", other: "x" }, 400],
  ]) {
    const r = await api(method, where, body);
    check("API", `${what}: ${status}`, r.status === status, `${r.status} ${JSON.stringify(r.json)}`);
  }

  // ---------- gear details (v2.0.0) ----------
  await go("/gear");
  // the Gear pages remember the picked character (LeekSpin, just above), even after reloading
  check("Gear", "the picked character is remembered after reloading", (await text('.ctab[aria-selected="true"] b')) === "LeekSpin");
  await page.locator(".ctab", { hasText: "MikuBeam" }).click();
  const details = () => page.getByRole("region", { name: /details$/ });
  const pickIcon = (name) => page.getByRole("group", { name: "Equipped items" }).getByRole("button", { name, exact: true }).click();
  check("Gear details", "every equipped item has an icon to edit", (await page.getByRole("group", { name: "Equipped items" }).getByRole("button").count()) >= 5);
  await pickIcon("AbsoLab Mage Crown");
  await details().getByRole("button", { name: "30 stars" }).waitFor();
  check("Gear details", "the Lv. 160 hat takes 30 stars, laid out 15 + 15", (await details().getByRole("button", { name: /^\d+ stars$/ }).count()) === 30 && (await page.locator(".details .star-row").count()) === 2);
  await details().getByRole("button", { name: "22 stars" }).click();
  await details().getByRole("button", { name: "INT tier 7: 63" }).click();
  const tipText = async () => (await page.getByLabel("Item summary").innerText()).replace(/\n/g, " | ");
  // by hand: INT 45 + 131 (40 + 7 × 13) + 63 (9 × 7) = 239; LUK 45 + 131 = 176; Magic ATT 3 + 92 = 95
  let tipNow = await tipText();
  check("Gear details", "22★ and an INT T7 flame worked out by hand: INT 239, LUK 176, Magic ATT 95", /INT \+239/.test(tipNow) && /LUK \+176/.test(tipNow) && /Magic ATT \+95/.test(tipNow), tipNow);
  check("Gear details", "boss item: flame tiers 1–2 can't be picked", (await details().getByRole("button", { name: /^INT tier [12]:/ }).count()) === 0);
  await details().getByRole("combobox", { name: "Potential rank" }).selectOption("legendary");
  const line1 = await details().getByRole("combobox", { name: "Potential line 1" }).locator("option").allInnerTexts();
  check("Gear details", "a Lv. 160 hat's Legendary first line can be INT +13% (GMS's 151+ step), and Skill Cooldown", line1.includes("INT +13%") && line1.some((l) => /Skill Cooldown -2 sec/.test(l)) && !line1.includes("INT +12%"), line1.slice(0, 6).join(", "));
  await details().getByRole("combobox", { name: "Potential line 1" }).selectOption("INT +13%");
  check("Gear details", "unsaved changes are marked", (await details().getByText("Unsaved changes").count()) === 1);
  await details().getByRole("button", { name: "Save", exact: true }).click();
  await settle();
  await go("/gear");
  await pickIcon("AbsoLab Mage Crown");
  await details().getByRole("button", { name: "22 stars" }).waitFor();
  tipNow = await tipText();
  check("Gear details", "saved: still there after reloading (22★, the flame, the potential line)", /INT \+239/.test(tipNow) && /Legendary potential/.test(tipNow) && /INT \+13%/.test(tipNow), tipNow);
  await pickIcon("Genesis Spirit Walker Fan");
  const fixedShown = await details().getByText(/22★, fixed/).waitFor({ timeout: 5000 }).then(() => true, () => false);
  check("Gear details", "the Genesis weapon shows its fixed 22★", fixedShown, (await details().innerText().catch(() => "")).slice(0, 200).replace(/\n/g, " | "));
  await pickIcon("AbsoLab Mage Suit");
  await details().getByRole("combobox", { name: "Potential rank" }).selectOption("legendary");
  const suitLine = await details().getByRole("combobox", { name: "Potential line 1" }).locator("option").allInnerTexts();
  check("Gear details", "the Lv. 160 overall gets GMS's 13% too (Korea has no Lv. 201+ overalls)", suitLine.includes("INT +13%") && !suitLine.includes("INT +12%"), suitLine.slice(0, 6).join(", "));
  await pickIcon("AbsoLab Mage Crown");
  await details().getByRole("button", { name: "25 stars" }).click();
  await pickIcon("AbsoLab Mage Suit");
  await pickIcon("AbsoLab Mage Crown");
  check("Gear details", "switching items drops unsaved changes, without asking", (await details().getByText("Saved", { exact: true }).count()) === 1 && /\(\+22★\)/.test(await tipText()));
  const values = page.getByRole("group", { name: "Stat values" });
  await values.getByRole("spinbutton", { name: "1 ATT =" }).fill("2.6");
  await values.getByRole("spinbutton", { name: "1 ATT =" }).press("Enter");
  await settle();
  await go("/gear");
  check("Gear details", "stat values: the defaults, a change saved", (await page.getByRole("group", { name: "Stat values" }).getByRole("spinbutton", { name: "1 ATT =" }).inputValue()) === "2.6" && (await page.getByRole("group", { name: "Stat values" }).getByRole("spinbutton", { name: "1% All Stat =" }).inputValue()) === "10");
  await pickIcon("AbsoLab Mage Crown");
  await details().getByRole("button", { name: "22 stars" }).waitFor();
  await shot("11-gear-details");
  for (const [what, method, where, body, status] of [
    ["details: too many stars", "PUT", `/gear/${miku.id}/hat/details`, { stars: 31, flames: {}, potential: null, hammers: 0 }, 400],
    ["details: a flame tier a boss item can't roll", "PUT", `/gear/${miku.id}/hat/details`, { stars: 0, flames: { INT: 1 }, potential: null, hammers: 0 }, 400],
    ["details: a potential line it can't have", "PUT", `/gear/${miku.id}/hat/details`, { stars: 0, flames: {}, potential: { rank: "legendary", lines: ["Boss Damage +40%", null, null] }, hammers: 0 }, 400],
    ["details: an empty slot", "PUT", `/gear/${miku.id}/android/details`, { stars: 0, flames: {}, potential: null, hammers: 0 }, 404],
    ["options: an unknown item", "GET", "/gear/options?item=1234567", undefined, 404],
    ["stat values: negative", "PUT", `/gear/${miku.id}/stat-values`, { att: -1, allStat: 12, secRatio: 0.1, bossDmg: 10, fdPer100: 0.8 }, 400],
  ]) {
    const r = await api(method, where, body);
    check("API", `${what}: ${status}`, r.status === status, `${r.status} ${JSON.stringify(r.json)}`);
  }

  // ---------- the Flames page (v2.1.0) ----------
  await go("/gear");
  await page.locator(".rail-group").getByRole("link", { name: "Flames" }).click();
  await page.getByRole("group", { name: /Items, cheapest/ }).waitFor();
  check("Flames", "the Gear group lists Equipment and Flames; Flames opens from it", (await text("h1")) === "Flames" && (await page.locator(".rail-page").allInnerTexts()).join(",") === "Equipment,Flames" && (await page.locator(".rail-page.active").innerText()) === "Flames");
  const flameBoard = async () => (await api("GET", `/gear/${miku.id}/flames?budget=10000000000`)).json;
  let fb = await flameBoard();
  const rowNames = await page.getByRole("group", { name: /Items, cheapest/ }).getByRole("button").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")));
  const costs = fb.items.map((i) => i.metrics.mesoPerFd ?? Infinity);
  check("Flames", "only the flameable items, cheapest per 1% final damage first", rowNames.join("|") === fb.items.map((i) => i.name).join("|") && costs.every((c, i) => i === 0 || costs[i - 1] <= c) && !rowNames.some((n) => /Ring|Medal|Emblem|Badge|Talisman/.test(n)), rowNames.join(", "));
  await page.getByRole("group", { name: /Items, cheapest/ }).getByRole("button", { name: "AbsoLab Mage Crown" }).click();
  const crown = page.getByRole("region", { name: "AbsoLab Mage Crown flames" });
  // by hand (a Kanna: INT main, LUK secondary, Magic ATT): INT T7 63; the best: all stats T7 70 + INT 63 + INT+LUK 35 × 1.125 + INT+STR 35 = 207.375
  check("Flames", "the crown's score worked out by hand: 63 of a best of 207.4", /^63 \/ 207\.4 best/.test(await crown.locator(".flame-tile.wide .big").first().innerText()), await crown.locator(".flame-tile.wide .big").first().innerText());
  await crown.getByRole("button", { name: "All Stats % tier 7: 7" }).click();
  check("Flames", "a click is unsaved: the numbers stay until Save", (await crown.getByText(/Unsaved changes/).count()) === 1 && /^63 /.test(await crown.locator(".flame-tile.wide .big").first().innerText()));
  await crown.getByRole("button", { name: "Save", exact: true }).click();
  await settle(800);
  // 63 + all stats T7 7 × 10 = 133
  check("Flames", "saved: the score is 63 + 70 = 133, and the row is sorted again", /^133 /.test(await page.getByRole("region", { name: "AbsoLab Mage Crown flames" }).locator(".flame-tile.wide .big").first().innerText()));
  fb = await flameBoard();
  check("Flames", "the same flames as the Equipment page (one saved set)", JSON.stringify(fb.items.find((i) => i.slot === "hat").flames) === JSON.stringify({ INT: 7, "All Stats %": 7 }));
  const graph = page.getByRole("region", { name: "One flame's score" });
  await graph.getByRole("img", { name: "Distribution" }).waitFor();
  const scores = await graph.getByText(/of them\)/).innerText();
  check("Flames", "the graph plots every score a flame can give", /\((\d{1,3}(,\d{3})+|\d{3,}) of them\)/.test(scores), scores);
  await graph.getByRole("button", { name: "Cost curve (+1 score)" }).click();
  check("Flames", "the graph switches to the cost curve", (await graph.getByRole("img", { name: "Cost curve (+1 score)" }).count()) === 1);
  await shot("12-flames");
  const before = fb.items.find((i) => i.slot === "hat").metrics.mesoToBetter;
  await page.getByRole("spinbutton", { name: /Black Flame price/ }).fill("6");
  await page.getByRole("spinbutton", { name: /Black Flame price/ }).press("Enter");
  await settle(600);
  fb = await flameBoard();
  check("Flames", "the Black Flame price (6m) doubles the meso to a better roll", fb.price === 6_000_000 && Math.abs(fb.items.find((i) => i.slot === "hat").metrics.mesoToBetter / before - 2) < 1e-9, `${before} → ${fb.items.find((i) => i.slot === "hat").metrics.mesoToBetter}`);
  await page.getByRole("button", { name: "Targets", exact: true }).click();
  const targets = page.getByRole("region", { name: "Targets" });
  await targets.getByRole("button", { name: "2.5B" }).click();
  await settle(600);
  check("Flames", "Targets: a stop score for every item, for the chosen budget", (await targets.locator("tbody tr").count()) === fb.items.length && (await targets.getByRole("button", { name: "2.5B" }).getAttribute("aria-pressed")) === "true");
  await shot("13-flame-targets");
  await api("PUT", "/settings", { blackFlamePrice: 3_000_000 });
  await go("/gear");
  await page.getByRole("group", { name: "Equipped items" }).getByRole("button", { name: "AbsoLab Mage Crown", exact: true }).waitFor();
  const crownScore = await page.getByRole("group", { name: "Equipped items" }).getByRole("button", { name: "AbsoLab Mage Crown", exact: true }).locator("xpath=..").locator(".icon-score").innerText().catch(() => null);
  check("Flames", "the Equipment page shows the crown's score (133) under its icon", crownScore === "133", String(crownScore));
  for (const [what, method, where, body, status] of [
    ["flames: no budget", "GET", `/gear/${miku.id}/flames`, undefined, 400],
    ["flames: a slot without a flameable item", "GET", `/gear/${miku.id}/flames/ring1`, undefined, 404],
    ["flames: an unknown character", "GET", "/gear/99999/flames?budget=1", undefined, 404],
    ["settings: a negative Black Flame price", "PUT", "/settings", { blackFlamePrice: -1 }, 400],
  ]) {
    const r = await api(method, where, body);
    check("API", `${what}: ${status}`, r.status === status, `${r.status} ${JSON.stringify(r.json)}`);
  }

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
  await page.locator(".ctab", { hasText: "MikuBeam" }).click();
  await settle(500);
  await page.locator(".chart-view button", { hasText: "Level" }).click();
  await page.locator('section[aria-label="EXP"] [aria-label="Days shown"] button', { hasText: "30 days" }).click();
  await settle(300);
  await shot("04a-pochacco-level");
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
  await page.locator(".ctab", { hasText: "MikuBeam" }).click();
  await settle(400);
  await page.locator(".chart-view button", { hasText: "Level" }).click();
  await page.locator('section[aria-label="EXP"] [aria-label="Days shown"] button', { hasText: "90 days" }).click();
  await settle(300);
  check("Layout", "the Level view at 90 days, 900 px wide: no sideways scrolling", (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  // each point sits over its own day's column: today's dot over the last column's middle
  const lined = await page.evaluate(() => {
    const dot = document.querySelector(".level-dot.latest").getBoundingClientRect();
    const col = [...document.querySelectorAll(".level-col")].at(-1).getBoundingClientRect();
    return Math.abs(dot.left + dot.width / 2 - (col.left + col.width / 2));
  });
  check("Layout", "the Level view's points line up with their days' columns", lined < 1.5, `${lined.toFixed(2)} px off`);
  await shot("05-narrow");
  await go("/symbols");
  check("Layout", "the Symbols tab at 900 px wide: no sideways scrolling", (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  await go("/gear");
  check("Layout", "the Gear tab at 900 px wide: no sideways scrolling", (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  await go("/gear/flames");
  await page.getByRole("group", { name: /Items, cheapest/ }).waitFor();
  check("Layout", "the Flames page at 900 px wide: no sideways scrolling", (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  // a phone-sized window: the rail along the bottom; Gear opens its pages as a menu, without leaving the page
  await page.setViewportSize({ width: 390, height: 800 });
  await settle(300);
  await page.locator(".rail-group > .tab").click();
  await settle(300);
  check("Layout", "phone width: Gear opens a menu of its pages, staying on Flames", (await text("h1")) === "Flames" && (await page.locator(".rail-group.menu .rail-pages").isVisible()));
  check("Layout", "the Flames page at phone width: no sideways scrolling", (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  await shot("14-flames-phone");
  await page.locator(".rail-page", { hasText: "Equipment" }).click();
  await settle(300);
  check("Layout", "picking Equipment from the menu opens it and closes the menu", (await text("h1")) === "Gear" && !(await page.locator(".rail-group.menu").count()));
  await page.setViewportSize({ width: 900, height: 900 });
  await go("/checklist");
  check("Layout", "the Checklist tab at 900 px wide: no sideways scrolling", (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  await go("/bosses");
  check("Layout", "the Bosses tab at 900 px wide: no sideways page scrolling (the cards scroll on their own)", (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);

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
