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
  check("Rail", "no TBD tab left: after Bosses, Checklist and Symbols come HEXA (v3.0.0), Familiars (v3.2.0) and Gear", (await page.locator(".rail a", { hasText: "TBD" }).count()) === 0 && (await page.locator(".rail a").nth(3).innerText()).includes("Symbols") && (await page.locator(".rail a").nth(4).innerText()).includes("HEXA") && (await page.locator(".rail a").nth(5).innerText()).includes("Familiars") && (await page.locator(".rail a").nth(6).innerText()).includes("Gear"));
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
  // (the delete link is the picked character's: wait until the tab is picked)
  await page.locator(".ctab[aria-selected='true']", { hasText: "MaxedOut" }).waitFor({ timeout: 5000 });
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
  await values.getByRole("spinbutton", { name: "1 Magic ATT =" }).fill("2.6");
  await values.getByRole("spinbutton", { name: "1 Magic ATT =" }).press("Enter");
  await settle();
  await go("/gear");
  check("Gear details", "stat values: the defaults, a change saved", (await page.getByRole("group", { name: "Stat values" }).getByRole("spinbutton", { name: "1 Magic ATT =" }).inputValue()) === "2.6" && (await page.getByRole("group", { name: "Stat values" }).getByRole("spinbutton", { name: "1% All Stat =" }).inputValue()) === "14.65");
  await pickIcon("AbsoLab Mage Crown");
  await details().getByRole("button", { name: "22 stars" }).waitFor();
  await shot("11-gear-details");
  for (const [what, method, where, body, status] of [
    ["details: too many stars", "PUT", `/gear/${miku.id}/hat/details`, { stars: 31, flames: {}, potential: null, hammers: 0 }, 400],
    ["details: a flame tier a boss item can't roll", "PUT", `/gear/${miku.id}/hat/details`, { stars: 0, flames: { INT: 1 }, potential: null, hammers: 0 }, 400],
    ["details: a potential line it can't have", "PUT", `/gear/${miku.id}/hat/details`, { stars: 0, flames: {}, potential: { rank: "legendary", lines: ["Boss Damage +40%", null, null] }, hammers: 0 }, 400],
    ["details: an empty slot", "PUT", `/gear/${miku.id}/android/details`, { stars: 0, flames: {}, potential: null, hammers: 0 }, 404],
    ["options: an unknown item", "GET", "/gear/options?item=1234567", undefined, 404],
    ["stat values: negative", "PUT", `/gear/${miku.id}/stat-values`, { att: -1, allStat: 14.65, secRatio: 0.125, bossDmg: 12, fdPer100: 0.785, strPct: null, dexPct: null, intPct: null, lukPct: null, hpPct: null, attPct: 53.82, mainFlat: 0.29, critDmg: 42.38, ied300: 15.6, ied380: 20.52, bossDef: 380, cd2: null, cd3: null, cd4: null, cd5: null, cd6: null, cdMin: 0 }, 400],
  ]) {
    const r = await api(method, where, body);
    check("API", `${what}: ${status}`, r.status === status, `${r.status} ${JSON.stringify(r.json)}`);
  }

  // ---------- the Flames page (v2.1.0) ----------
  await go("/gear");
  await page.locator(".rail-group").getByRole("link", { name: "Flames" }).click();
  await page.getByRole("group", { name: /Items, cheapest/ }).waitFor();
  check("Flames", "the Gear group lists its pages; Flames opens from it", (await text("h1")) === "Flames" && (await page.locator(".rail-page").allInnerTexts()).join(",") === "Equipment,Flames,Star Force,Potential,Upgrades" && (await page.locator(".rail-page.active").innerText()) === "Flames");
  const flameBoard = async () => (await api("GET", `/gear/${miku.id}/flames?budget=10000000000`)).json;
  let fb = await flameBoard();
  const rowNames = await page.getByRole("group", { name: /Items, cheapest/ }).getByRole("button").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")));
  const costs = fb.items.map((i) => i.metrics.mesoPerFd ?? Infinity);
  check("Flames", "only the flameable items, cheapest per 1% final damage first", rowNames.join("|") === fb.items.map((i) => i.name).join("|") && costs.every((c, i) => i === 0 || costs[i - 1] <= c) && !rowNames.some((n) => /Ring|Medal|Emblem|Badge|Talisman/.test(n)), rowNames.join(", "));
  await page.getByRole("group", { name: /Items, cheapest/ }).getByRole("button", { name: "AbsoLab Mage Crown" }).click();
  const crown = page.getByRole("region", { name: "AbsoLab Mage Crown flames" });
  // by hand (a Kanna: INT main, LUK secondary, Magic ATT; 1% all stat = 14.65 from v2.3.0): INT T7 63; the best: all stats T7 7 × 14.65 = 102.55 + INT 63 + INT+LUK 35 × 1.125 = 39.38 + INT+STR 35 = 239.93
  check("Flames", "the crown's score worked out by hand: 63 of a best of 239.9", /^63 \/ 239\.9 best/.test(await crown.locator(".flame-tile.wide .big").first().innerText()), await crown.locator(".flame-tile.wide .big").first().innerText());
  await crown.getByRole("button", { name: "All Stats % tier 7: 7" }).click();
  check("Flames", "a click is unsaved: the numbers stay until Save", (await crown.getByText(/Unsaved changes/).count()) === 1 && /^63 /.test(await crown.locator(".flame-tile.wide .big").first().innerText()));
  await crown.getByRole("button", { name: "Save", exact: true }).click();
  await settle(800);
  // 63 + all stats T7 7 × 14.65 = 165.55
  check("Flames", "saved: the score is 63 + 102.55 = 165.55, and the row is sorted again", /^165\.6 /.test(await page.getByRole("region", { name: "AbsoLab Mage Crown flames" }).locator(".flame-tile.wide .big").first().innerText()));
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
  check("Flames", "the Equipment page shows the crown's score (165.55, rounded: 166) under its icon", crownScore === "166", String(crownScore));
  for (const [what, method, where, body, status] of [
    ["flames: no budget", "GET", `/gear/${miku.id}/flames`, undefined, 400],
    ["flames: a slot without a flameable item", "GET", `/gear/${miku.id}/flames/ring1`, undefined, 404],
    ["flames: an unknown character", "GET", "/gear/99999/flames?budget=1", undefined, 404],
    ["settings: a negative Black Flame price", "PUT", "/settings", { blackFlamePrice: -1 }, 400],
  ]) {
    const r = await api(method, where, body);
    check("API", `${what}: ${status}`, r.status === status, `${r.status} ${JSON.stringify(r.json)}`);
  }

  // ---------- the Star Force page (v2.2.0) ----------
  await api("PUT", "/settings", { mvp: "none" });
  await go("/gear");
  await page.locator(".rail-group").getByRole("link", { name: "Star Force" }).click();
  const sfRow = page.getByRole("group", { name: /Items, cheapest/ });
  await sfRow.waitFor();
  const sfNames = await sfRow.getByRole("button").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")));
  check("Star Force", "the Gear group's third page; the fixed-star Genesis fan isn't listed, the crown is", (await text("h1")) === "Star Force" && (await page.locator(".rail-page.active").innerText()) === "Star Force" && !sfNames.some((n) => /Genesis/.test(n)) && sfNames.includes("AbsoLab Mage Crown"), sfNames.join(", "));
  await sfRow.getByRole("button", { name: "AbsoLab Mage Crown" }).click();
  const crownSf = page.getByRole("region", { name: "AbsoLab Mage Crown Star Force" });
  await crownSf.getByRole("group", { name: "Summary" }).waitFor();
  const firstRow = async () => (await crownSf.locator("tbody tr").first().innerText()).replace(/\s+/g, " ");
  check("Star Force", "the crown at 22★: its first row 22→23★ at 15.75% / 16.85% (the rates unrounded)", /^22→23★ — 15\.75% 16\.85%/.test(await firstRow()), await firstRow());
  await crownSf.getByRole("group", { name: "Star Force" }).getByRole("button", { name: "17 stars" }).click();
  check("Star Force", "picking stars is unsaved until Save", (await crownSf.getByText(/Unsaved/).count()) === 1);
  await crownSf.getByRole("button", { name: "Save", exact: true }).click();
  await settle(900);
  const savedStars = (await api("GET", "/gear?world=45")).json.characters.find((c) => c.name === "MikuBeam").details.hat.stars;
  check("Star Force", "saved: the crown is at 17★ here and on the Equipment page", savedStars === 17 && /^17→18★ Mode 1 15\.75% 6\.74%/.test(await (async () => (await page.getByRole("region", { name: "AbsoLab Mage Crown Star Force" }).locator("tbody tr").first().innerText()).replace(/\s+/g, " "))()), String(savedStars));
  const crown2 = page.getByRole("region", { name: "AbsoLab Mage Crown Star Force" });
  const tapAt17 = async () => Number((await crown2.locator("tbody tr").first().locator("td").nth(4).innerText()).replace("m", "")) * 1e6;
  const plainTap = await tapAt17();
  await page.getByRole("checkbox", { name: "30% off" }).check();
  await settle(900);
  const offTap = await tapAt17();
  check("Star Force", "30% off: the 17→18★ tap costs 70% (to the shown million)", Math.abs(offTap / plainTap - 0.7) < 0.02, `${plainTap} → ${offTap}`);
  await page.getByRole("checkbox", { name: "30% off" }).uncheck();
  const boomBox = crown2.getByRole("spinbutton", { name: "Boom cost (meso)" });
  await boomBox.fill("500000000");
  await boomBox.press("Enter");
  await settle(700);
  await page.getByRole("region", { name: "AbsoLab Mage Crown Star Force" }).getByRole("checkbox", { name: "Modes 4 4 4 4" }).check();
  await settle(900);
  const hatDetails = (await api("GET", "/gear?world=45")).json.characters.find((c) => c.name === "MikuBeam").details.hat;
  const pick17 = (await page.getByRole("region", { name: "AbsoLab Mage Crown Star Force" }).locator("tbody tr").first().innerText()).replace(/\s+/g, " ");
  check("Star Force", "the boom cost (500m) and Modes 4 4 4 4 are saved with the crown, and 17→18★ is Safeguarded", hatDetails.boomCost === 500_000_000 && hatDetails.safety === "4444" && /Safeguard/.test(pick17), `${JSON.stringify({ boomCost: hatDetails.boomCost, safety: hatDetails.safety })} ${pick17}`);
  await page.getByRole("combobox", { name: "MVP" }).selectOption("gold");
  await settle(600);
  check("Star Force", "the MVP tier is a saved setting", (await api("GET", "/settings")).json.mvp === "gold");
  const sfGraph = page.getByRole("region", { name: "Star Force graph" });
  const sfStart = Date.now();
  await page.getByRole("region", { name: "AbsoLab Mage Crown Star Force" }).getByRole("button", { name: "29→30★" }).click();
  await page.waitForFunction(() => document.body.innerText.includes("17★ → 30★"), null, { timeout: 20000 });
  await sfGraph.getByRole("button", { name: "Booms on the way" }).click();
  check("Star Force", "planning to 30★ is quick, and its booms come in ranges", Date.now() - sfStart < 8000 && (await sfGraph.getByRole("img", { name: "Booms on the way" }).count()) === 1, `${Date.now() - sfStart} ms`);
  await sfGraph.getByRole("button", { name: "Cost per star" }).click();
  check("Star Force", "the cost per star graph, up to the target", (await sfGraph.getByRole("heading").innerText()) === "Each next star, up to 30★");
  await shot("15-star-force");
  await page.getByRole("button", { name: "Targets", exact: true }).click();
  const sfTargets = page.getByRole("region", { name: "Targets" });
  await sfTargets.waitFor();
  check("Star Force", "Targets: a stop star for every listed item", (await sfTargets.locator("tbody tr").count()) === sfNames.length);
  await shot("16-star-force-targets");
  await api("PUT", "/settings", { mvp: "none" });
  for (const [what, method, where, body, status] of [
    ["star force: an event it doesn't know", "GET", `/gear/${miku.id}/starforce?events=halfOff&budget=1`, undefined, 400],
    ["star force: the fixed-star weapon", "GET", `/gear/${miku.id}/starforce/weapon?target=23`, undefined, 404],
    ["details: boxes it doesn't know", "PUT", `/gear/${miku.id}/hat/details`, { stars: 17, flames: {}, potential: null, hammers: 0, safety: "4441" }, 400],
    ["settings: an MVP tier it doesn't know", "PUT", "/settings", { mvp: "red" }, 400],
  ]) {
    const r = await api(method, where, body);
    check("API", `${what}: ${status}`, r.status === status, `${r.status} ${JSON.stringify(r.json)}`);
  }

  // ---------- the Potential page (v2.3.0) ----------
  await go("/gear");
  await page.locator(".rail-group").getByRole("link", { name: "Potential" }).click();
  await page.getByRole("group", { name: /Items, cheapest/ }).waitFor();
  const potBoard = async (events = "") => (await api("GET", `/gear/${miku.id}/potential?events=${events}&budget=10000000000`)).json;
  let pb = await potBoard();
  const potNames = await page.getByRole("group", { name: /Items, cheapest/ }).getByRole("button").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label")));
  const potCosts = pb.items.map((i) => (i.cheaper ? i.cubes[i.cheaper].mesoPerFd : Infinity));
  check("Potential", "the Gear group's fourth page: the items that can have potential, cheapest per 1% final damage first", (await text("h1")) === "Potential" && (await page.locator(".rail-page.active").innerText()) === "Potential" && potNames.join("|") === pb.items.map((i) => i.name).join("|") && potNames.includes("AbsoLab Mage Crown") && potCosts.every((c, i) => i === 0 || potCosts[i - 1] <= c), potNames.join(", "));
  await page.getByRole("group", { name: /Items, cheapest/ }).getByRole("button", { name: "AbsoLab Mage Crown" }).click();
  const crownPot = () => page.getByRole("region", { name: "AbsoLab Mage Crown potential" });
  // by hand (a Kanna, INT main): the line saved on the Equipment page, INT +13% × 12.97 = 168.61
  check("Potential", "the crown's saved line (from the Equipment page) scored by hand: INT +13% × 12.97 = 168.6", /Score 168\.6 /.test(await crownPot().locator(".page-head").innerText()), await crownPot().locator(".page-head").innerText());
  const chanceTile = async () => (await crownPot().locator(".flame-tile", { hasText: "Chance per cube of better" }).innerText()).replace(/\n/g, " ");
  const cheaperCube = pb.items.find((i) => i.slot === "hat").cheaper;
  const better = pb.items.find((i) => i.slot === "hat").cubes[cheaperCube].better;
  check("Potential", "the chance per cube as 1 in X cubes, from the cheaper cube", (await chanceTile()).includes(`1 in ${Math.round(1 / better).toLocaleString("en-US")}`), await chanceTile());
  await crownPot().getByRole("combobox", { name: "Potential line 2" }).selectOption("INT +10%");
  check("Potential", "a line picked is unsaved: 168.61 + INT +10% × 12.97 = 298.3", (await crownPot().getByText(/Unsaved: 298\.3 score/).count()) === 1 && /Score 168\.6 /.test(await crownPot().locator(".page-head").innerText()));
  const gearBefore = (await api("GET", "/gear?world=45")).json.characters.find((c) => c.id === miku.id).details.hat;
  await crownPot().getByRole("button", { name: "Save", exact: true }).click();
  await settle(800);
  await page.getByRole("group", { name: /Items, cheapest/ }).getByRole("button", { name: "AbsoLab Mage Crown" }).click();
  const gearAfter = (await api("GET", "/gear?world=45")).json.characters.find((c) => c.id === miku.id).details.hat;
  check("Potential", "saved: 298.3 here, and the same lines on the Equipment page (one saved set, the stars and flames kept)", /Score 298\.3 /.test(await crownPot().locator(".page-head").innerText()) && JSON.stringify(gearAfter.potential) === JSON.stringify({ rank: "legendary", lines: ["INT +13%", "INT +10%", null] }) && gearAfter.stars === gearBefore.stars && JSON.stringify(gearAfter.flames) === JSON.stringify(gearBefore.flames), JSON.stringify(gearAfter));
  const otherCube = cheaperCube === "glowing" ? "Bright" : "Glowing";
  await crownPot().getByRole("group", { name: "Cube" }).getByRole("button", { name: otherCube, exact: true }).click();
  pb = await potBoard();
  const otherKey = otherCube.toLowerCase();
  const mesoTile = async () => (await crownPot().locator(".flame-tile", { hasText: "Meso / 1% FD" }).innerText()).replace(/\n/g, " ");
  check("Potential", "switching cubes shows the other cube's figures", (await crownPot().getByRole("group", { name: "Cube" }).getByRole("button", { name: otherCube, exact: true }).getAttribute("aria-pressed")) === "true" && (await mesoTile()).length > 0 && (await page.getByRole("region", { name: "One cube's result" }).getByRole("heading").innerText()).includes(otherCube), `${otherKey}: ${await mesoTile()}`);
  await page.getByRole("checkbox", { name: "Cube sale (25% off)" }).check();
  await settle(600);
  check("Potential", "a cube sale: Glowing 9m and Bright 16.5m a cube", /Glowing 9m · Bright 16\.5m a cube/.test(await page.locator("section.block").first().innerText()) || /Glowing 9m · Bright 16\.5m a cube/.test(await page.locator("main").innerText()), (await potBoard("sale")).prices && JSON.stringify((await potBoard("sale")).prices));
  await page.getByRole("checkbox", { name: "Cube sale (25% off)" }).uncheck();
  const unsaved = pb.items.find((i) => i.rank === null);
  if (unsaved) {
    await page.getByRole("checkbox", { name: "Double Miracle Time" }).check();
    await settle(600);
    await page.getByRole("group", { name: /Items, cheapest/ }).getByRole("button", { name: unsaved.name, exact: true }).click();
    const tile = (await page.getByRole("region", { name: `${unsaved.name} potential` }).locator(".flame-tile", { hasText: "Chance per cube of better" }).innerText()).replace(/\n/g, " ");
    check("Potential", "an item with no potential counts as Rare; Double Miracle Time doubles its rank-up chance (14% → 28% with Glowing)", /rank-up (28|34)% a cube/.test(tile) && /No potential saved/.test(await page.getByRole("region", { name: `${unsaved.name} potential` }).innerText()), tile);
    await page.getByRole("checkbox", { name: "Double Miracle Time" }).uncheck();
    await page.getByRole("group", { name: /Items, cheapest/ }).getByRole("button", { name: "AbsoLab Mage Crown" }).click();
  } else check("Potential", "an item with no potential to show the rank-up on", false, "every item has potential saved");
  const potGraph = page.getByRole("region", { name: "One cube's result" });
  await potGraph.getByRole("img", { name: "Distribution" }).waitFor();
  // (the graph is below the window: scroll to it, or the mouse lands outside the page)
  await potGraph.locator("svg rect[fill='transparent']").scrollIntoViewIfNeeded();
  const plot = await potGraph.locator("svg rect[fill='transparent']").boundingBox();
  await page.mouse.move(plot.x + plot.width * 0.9, plot.y + plot.height * 0.6);
  await page.mouse.click(plot.x + plot.width * 0.9, plot.y + plot.height * 0.6);
  const targetTile = crownPot().getByLabel("Target");
  const targetShown = await targetTile.waitFor({ timeout: 5000 }).then(() => true, () => false);
  check("Potential", "clicking the distribution, even between its points, shows what reaching that score costs with each cube", targetShown && /Glowing[\s\S]*Bright/.test(await targetTile.innerText().catch(() => "")), (await targetTile.innerText().catch(() => "")).replace(/\n/g, " "));
  await shot("17-potential");
  await targetTile.getByRole("button", { name: "Clear" }).click().catch(() => {});
  await page.getByRole("button", { name: "Targets", exact: true }).click();
  const potTargets = page.getByRole("region", { name: "Targets" });
  await potTargets.waitFor();
  check("Potential", "Targets: a stop score for every item", (await potTargets.locator("tbody tr").count()) === pb.items.length);
  await shot("18-potential-targets");
  const values2 = page.getByRole("group", { name: "Stat values" });
  await values2.getByRole("spinbutton", { name: "1% INT =" }).fill("10");
  await values2.getByRole("spinbutton", { name: "1% INT =" }).press("Enter");
  await settle(800);
  pb = await potBoard();
  check("Stat values", "only the boxes a Kanna needs, in its own stats: INT and LUK, Magic ATT", (await values2.getByRole("spinbutton", { name: "1% LUK =" }).count()) === 1 && (await values2.getByRole("spinbutton", { name: "1% STR =" }).count()) === 0 && (await values2.getByRole("spinbutton", { name: "1% Magic ATT =" }).count()) === 1 && (await values2.getByRole("spinbutton", { name: "1% ATT =" }).count()) === 0);
  // INT +13% and +10% at 10 a percent = 230
  check("Potential", "the stat values change the scores: 1% main stat = 10 makes the crown 230", pb.items.find((i) => i.slot === "hat").score === 230, String(pb.items.find((i) => i.slot === "hat").score));
  await values2.getByRole("spinbutton", { name: "1% INT =" }).fill("12.97");
  await values2.getByRole("spinbutton", { name: "1% INT =" }).press("Enter");
  await settle(600);
  // skill cooldown as a table and a hat's minimum (v2.4.1)
  const cdBox = (n) => values2.getByRole("spinbutton", { name: `${n} s skill cooldown =` });
  check("Stat values", "skill cooldown: a box for each total from 2 to 6 s (none for 1 s), all empty to start", (await Promise.all([2, 3, 4, 5, 6].map((n) => cdBox(n).inputValue()))).every((v) => v === "") && (await values2.getByRole("spinbutton", { name: "1 s skill cooldown =" }).count()) === 0);
  for (const [n, v] of [[2, "1.37"], [4, "3.34"]]) {
    await cdBox(n).fill(v);
    await cdBox(n).press("Enter");
    await settle(500);
  }
  check("Stat values", "an empty cooldown box shows what it counts as: 3 s takes 2 s's 1.37, 6 s takes 4 s's 3.34", (await cdBox(3).getAttribute("placeholder")) === "1.37" && (await cdBox(6).getAttribute("placeholder")) === "3.34", `${await cdBox(3).getAttribute("placeholder")} / ${await cdBox(6).getAttribute("placeholder")}`);
  const hatMin = values2.getByRole("group", { name: "Hat's minimum cooldown" });
  await hatMin.getByRole("button", { name: "4 s", exact: true }).click();
  await settle(800);
  pb = await potBoard();
  const crownCd = pb.items.find((i) => i.slot === "hat");
  // the crown has no cooldown line: any roll keeping 4 s beats it; Legendary hats roll at least 4 s 0.062523% of the time with Bright, 0.026487% with Glowing (brendonmay's engine agrees)
  check("Potential", "a hat must keep 4 s: the crown (0 s) takes any roll that keeps it, at brendonmay's odds", crownCd.cooldown?.sec === 0 && crownCd.cooldown?.min === 4 && Math.abs(crownCd.cubes.bright.better - 0.00062523) < 1e-8 && Math.abs(crownCd.cubes.glowing.better - 0.00026487) < 1e-8, JSON.stringify([crownCd.cooldown?.sec, crownCd.cooldown?.min, crownCd.cubes.bright.better, crownCd.cubes.glowing.better]));
  check("Potential", "Targets: the crown under its 4 s minimum hasn't reached its stop score", (await page.getByRole("region", { name: "Targets" }).getByRole("row", { name: /AbsoLab Mage Crown/ }).innerText()).includes("reached") === false, await page.getByRole("region", { name: "Targets" }).getByRole("row", { name: /AbsoLab Mage Crown/ }).innerText());
  await page.getByRole("button", { name: "Upgrade", exact: true }).click();
  await page.getByRole("group", { name: /Items, cheapest/ }).getByRole("button", { name: "AbsoLab Mage Crown" }).click();
  await settle(400);
  check("Potential", "the crown says it's under the 4 s it must keep", (await crownPot().getByText(/under the 4 s it must keep/).count()) === 1);
  const ubCd = (await api("GET", `/gear/${miku.id}/upgrades?sf=&cubes=`)).json;
  const crownStep = ubCd.steps.find((x) => x.system === "potential" && x.slot === "hat");
  check("Upgrades", "the crown's cube there too, with its cooldown and the minimum", crownStep && crownStep.chance === crownCd.cubes[crownCd.cheaper].better && crownStep.now.cooldown?.min === 4, JSON.stringify(crownStep?.now));
  await shot("18b-potential-cooldown");
  // back to none and empty boxes, for the checks after
  await hatMin.getByRole("button", { name: "none", exact: true }).click();
  await settle(400);
  for (const n of [2, 4]) {
    await cdBox(n).fill("");
    await cdBox(n).press("Enter");
    await settle(400);
  }
  pb = await potBoard();
  check("Stat values", "back to no minimum and empty cooldown boxes: the crown as before", pb.items.find((i) => i.slot === "hat").cooldown?.min === 0 && (await cdBox(4).inputValue()) === "");
  for (const [what, method, where, body, status] of [
    ["stat values: a hat minimum the game can't have (7 s)", "PUT", `/gear/${miku.id}/stat-values`, { att: 4, allStat: 14.65, secRatio: 0.125, bossDmg: 12, fdPer100: 0.785, strPct: null, dexPct: null, intPct: null, lukPct: null, hpPct: null, attPct: 53.82, mainFlat: 0.29, critDmg: 42.38, ied300: 15.6, ied380: 20.52, bossDef: 380, cd2: null, cd3: null, cd4: null, cd5: null, cd6: null, cdMin: 7 }, 400],
    ["potential: no budget", "GET", `/gear/${miku.id}/potential`, undefined, 400],
    ["potential: an event it doesn't know", "GET", `/gear/${miku.id}/potential?events=free&budget=1`, undefined, 400],
    ["potential: a slot without an item that can have potential", "GET", `/gear/${miku.id}/potential/android`, undefined, 404],
    ["potential: a negative target", "GET", `/gear/${miku.id}/potential/hat?target=-1`, undefined, 400],
    ["stat values: a bosses' defense it doesn't know", "PUT", `/gear/${miku.id}/stat-values`, { att: 4, allStat: 14.65, secRatio: 0.125, bossDmg: 12, fdPer100: 0.785, strPct: null, dexPct: null, intPct: null, lukPct: null, hpPct: null, attPct: 53.82, mainFlat: 0.29, critDmg: 42.38, ied300: 15.6, ied380: 20.52, bossDef: 350, cd2: null, cd3: null, cd4: null, cd5: null, cd6: null, cdMin: 0 }, 400],
  ]) {
    const r = await api(method, where, body);
    check("API", `${what}: ${status}`, r.status === status, `${r.status} ${JSON.stringify(r.json)}`);
  }

  // ---------- the Upgrades page (v2.4.0) ----------
  await go("/gear");
  await page.locator(".rail-group").getByRole("link", { name: "Upgrades" }).click();
  const allSteps = page.getByRole("region", { name: "All steps" });
  await allSteps.waitFor();
  const ub = (await api("GET", `/gear/${miku.id}/upgrades?sf=&cubes=`)).json;
  const stepRows = allSteps.locator("tbody tr");
  const perFds = ub.steps.map((x) => x.perFd);
  check("Upgrades", "the Gear group's fifth page: every step from Flames, Star Force and Potential, cheapest per 1% final damage first", (await text("h1")) === "Upgrades" && (await stepRows.count()) === ub.steps.length && ub.steps.length > 0 && perFds.every((v, i) => i === 0 || perFds[i - 1] <= v) && new Set(ub.steps.map((x) => x.system)).size === 3, `${ub.steps.length} steps, systems ${[...new Set(ub.steps.map((x) => x.system))].join(", ")}`);
  const flameStep = ub.steps.find((x) => x.system === "flames");
  check("Upgrades", "a flame step costs the whole step (price ÷ the chance of better), not one 3m flame", flameStep.cost > 3_000_000 && Math.abs(flameStep.cost - 3_000_000 / flameStep.chance) < 1, `${flameStep.name}: ${flameStep.cost} at ${flameStep.chance}`);
  const potGb = (await api("GET", `/gear/${miku.id}/potential?events=&budget=0`)).json.items.find((x) => x.slot === "hat");
  const potStep = ub.steps.find((x) => x.system === "potential" && x.slot === "hat");
  check("Upgrades", "a potential step is the Potential page's own figure (the cheaper cube to any better roll)", potStep && potStep.perFd === potGb.cubes[potGb.cheaper].mesoPerFd && potStep.cost === potGb.cubes[potGb.cheaper].mesoToBetter, JSON.stringify(potStep));
  await shot("20-upgrades");
  const firstFlames = ub.steps.findIndex((x) => x.system === "flames");
  await stepRows.nth(firstFlames).click();
  await page.getByRole("region", { name: `${ub.steps[firstFlames].name} flames` }).waitFor({ timeout: 5000 }).catch(() => {});
  check("Upgrades", "a row opens that system's page with the item picked", (await text("h1")) === "Flames" && (await page.getByRole("region", { name: `${ub.steps[firstFlames].name} flames` }).count()) === 1, page.url());
  // picking another item there moves the address with it (a reload keeps it)
  const otherFlame = fb.items.find((i) => i.slot !== ub.steps[firstFlames].slot);
  await page.getByRole("group", { name: /Items, cheapest/ }).getByRole("button", { name: otherFlame.name }).click();
  await settle(300);
  check("Upgrades", "the address follows the item picked on the page a row opened", new URL(page.url()).searchParams.get("item") === otherFlame.slot, page.url());
  await page.reload();
  await page.getByRole("region", { name: `${otherFlame.name} flames` }).waitFor({ timeout: 5000 }).catch(() => {});
  check("Upgrades", "reloading keeps that item", (await page.getByRole("region", { name: `${otherFlame.name} flames` }).count()) === 1);
  await go("/gear/upgrades");
  await allSteps.waitFor();
  await page.getByRole("button", { name: "Chart", exact: true }).click();
  const chartBox = page.getByRole("region", { name: "Cost against gain" });
  await chartBox.waitFor();
  check("Upgrades", "Chart: a dot per step, the cheapest picked to start", (await chartBox.locator("svg circle").count()) === ub.steps.length && (await chartBox.getByText(/#1 on the list/).count()) === 1);
  await chartBox.locator("svg circle").nth(ub.steps.length - 1).click();
  check("Upgrades", "clicking a dot picks that step", (await chartBox.getByText(new RegExp(`#${ub.steps.length} on the list`)).count()) === 1);
  await shot("21-upgrades-chart");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await page.getByRole("checkbox", { name: "Cube sale (25% off)" }).check();
  await settle(800);
  const sale = (await api("GET", `/gear/${miku.id}/upgrades?sf=&cubes=sale`)).json;
  check("Upgrades", "a cube sale: the potential steps cost 25% less", sale.steps.filter((x) => x.system === "potential").every((x) => Math.abs(x.cost - ub.steps.find((y) => y.system === "potential" && y.slot === x.slot).cost * 0.75) < 1));
  for (const [what, method, where, body, status] of [
    ["upgrades: an event it doesn't know", "GET", `/gear/${miku.id}/upgrades?sf=halfOff`, undefined, 400],
    ["upgrades: an unknown character", "GET", "/gear/99999/upgrades", undefined, 404],
  ]) {
    const r = await api(method, where, body);
    check("API", `${what}: ${status}`, r.status === status, `${r.status} ${JSON.stringify(r.json)}`);
  }

  // ---------- HEXA (v3.0.0) ----------
  // a Ren, added for these checks and removed after (the checks after count Kronos's characters)
  const plum = await api("POST", "/characters", { world: 45, name: "PlumBlade" });
  check("HEXA", "a Ren to check with (added through the API)", plum.status === 201, `${plum.status} ${JSON.stringify(plum.json)}`);
  const plumId = plum.json?.id;
  await go("/hexa");
  check("HEXA", "in the rail, after Symbols; the page's tabs are the world's characters", (await page.locator(".rail .tab", { hasText: "HEXA" }).count()) >= 1 && (await page.getByRole("tab", { name: /PlumBlade/ }).count()) === 1);
  await page.getByRole("tab", { name: /MikuBeam/ }).click();
  await page.getByRole("region", { name: "Current progress" }).waitFor({ timeout: 10000 });
  const kanna = (await page.getByRole("region", { name: "Current progress" }).innerText()).replace(/\s+/g, " ");
  check("HEXA", "every job works (v3.1.0): a Kanna gets its own nodes (the wiki's names: Summon Oni, Twilight Bloom)", /Summon Oni/.test(kanna) && /Twilight Bloom/.test(kanna), kanna.slice(0, 200));
  const kannaPrio = page.getByRole("region", { name: "Upgrade priority" });
  const kannaNote = (await kannaPrio.innerText()).replace(/\s+/g, " ");
  const kannaBoard = (await api("GET", `/hexa/${(await api("GET", "/hexa?world=45")).json.characters.find((c) => c.name === "MikuBeam").id}`)).json;
  const attRow = (await kannaPrio.locator("tbody tr", { hasText: kannaBoard.attNode }).first().innerText()).replace(/\s+/g, " ");
  check("HEXA", "a Kanna's 3rd Common node also gives flat ATT (v3.2.0): named under the priority, its rows' damage ≈", kannaBoard.attNode !== null && kannaNote.includes(`${kannaBoard.attNode}'s flat ATT counted from your 1 ATT value`) && /≈ \+\d/.test(attRow), `${kannaBoard.attNode} | ${attRow}`);
  await page.getByRole("tab", { name: /PlumBlade/ }).click();
  const hexaSum = page.getByRole("region", { name: "HEXA summary" });
  await hexaSum.waitFor({ timeout: 10000 });
  // (Sol Erda and the fragments are pictures, or their names when not downloaded: read as just the numbers)
  const bare = (t) => t.replace(/Sol Erda|Fragments/g, "").replace(/\s+/g, " ");
  const sumText = async () => bare(await hexaSum.innerText());
  // a new Ren: nothing invested; left, by hand (Sol Janus not counted): the nodes, Origin 4,400 + Ascent 4,500 + 4 × 2,252 +
  // 4 × 3,383 + Sol Hecate 6,268 + Lotus 4,035 = 41,743 (1,464 Sol Erda), and the HEXA Stat nodes: unlocks 560 (30 Sol Erda) and
  // 3 × 323.1 rank-ups on average (checked by simulation in the tests) = 43,272
  check("HEXA", "a new Ren: 0 invested; ≈ 1,494 Sol Erda and ≈ 43,272 fragments left (by hand), 0% complete", /Invested 0 0/i.test(await sumText()) && /Left to complete ≈ 1,494 ≈ 43,272/i.test(await sumText()) && /Complete 0%/i.test(await sumText()), await sumText());
  const hexaIcons = await page.locator(".hexa-page img[src^='/item-icons/hexa/']").count();
  check("HEXA", "the skills' pictures and Sol Erda's and the fragments' show when downloaded (the QA copy has the data folder's), else names", hexaIcons === 0 || (await page.locator(".hexa-page img[src='/item-icons/hexa/Len_8.png']").first().evaluate((i) => i.naturalWidth > 0)), `${hexaIcons} pictures`);
  const prio = page.getByRole("region", { name: "Upgrade priority" });
  const nextText = async () => bare(await prio.getByRole("group", { name: "Next upgrade" }).innerText());
  check("HEXA", "the next upgrade is MapleScouter's first step: Wish Unending 0 → 1, 3 Sol Erda, 50 fragments, +5.33%", /Wish Unending → 1 \+5\.33% Lv\. 0 → 1 · ready — 3 50/.test(await nextText()), await nextText());
  const wish = page.getByRole("spinbutton", { name: "Wish Unending level now" });
  await wish.fill("1");
  await wish.press("Enter");
  await settle(800);
  check("HEXA", "typing Wish Unending 1: 3 / 50 invested, and its first step leaves the priority", /Invested 3 50 /i.test(await sumText()) && !/Wish Unending → 1 /.test(await nextText()), `${await sumText()} | ${await nextText()}`);
  // (a tick shows once the save has updated the page: click, then wait)
  await hexaSum.getByRole("checkbox", { name: /Sol Janus/ }).click();
  await settle(800);
  check("HEXA", "counting Sol Janus adds its 208 Sol Erda and 6,268 fragments to what's left", /Left to complete ≈ 1,699 ≈ 49,490/i.test(await sumText()), await sumText());
  await hexaSum.getByRole("checkbox", { name: /Sol Janus/ }).click();
  await settle(800);
  const hexaCalc = page.getByRole("region", { name: "Fragment calculator" });
  await hexaCalc.getByRole("spinbutton", { name: "Fragments a day from farming" }).fill("10");
  await hexaCalc.getByRole("spinbutton", { name: "Fragments a day from farming" }).press("Enter");
  await hexaCalc.getByRole("checkbox", { name: "Erda's Request" }).click();
  await settle(500);
  await hexaCalc.getByRole("combobox", { name: "Epic Dungeon" }).selectOption("nightmareParadise");
  await settle(800);
  const hexaCalcText = (await hexaCalc.innerText()).replace(/\s+/g, " ");
  check("HEXA", "fragments coming in: 10 a day × 7 + Erda's Request 90 + Nightmare Paradise 70 = 230 a week, and a time to everything wanted", /Coming in 230 a week/.test(hexaCalcText) && /Everything wanted: [\d,]+ days \(/.test(hexaCalcText), hexaCalcText);
  const firstReady = (await prio.locator("tbody tr").first().locator("td").last().innerText()).trim();
  check("HEXA", "the priority's rows say when they're ready, as a date", /^[A-Z][a-z]{2} \d{1,2}(, \d{4})?$/.test(firstReady), firstReady);
  const stat2 = page.getByRole("group", { name: "HEXA Stat II", exact: true });
  await stat2.getByRole("combobox", { name: "HEXA Stat II Main line stat" }).selectOption("bossDmg");
  await settle(500);
  await stat2.getByRole("spinbutton", { name: "HEXA Stat II Main line level" }).fill("2");
  await stat2.getByRole("spinbutton", { name: "HEXA Stat II Main line level" }).press("Enter");
  await settle(800);
  const stat1Main = await page.getByRole("combobox", { name: "HEXA Stat I Main line stat" }).locator("option").allInnerTexts();
  check("HEXA", "HEXA Stat: a line's stat and level saved, the node unlocked with its rank; Boss DMG not offered for another node's main line", /Rank 2 \/ 20/.test(await stat2.innerText()) && (await stat2.getByRole("checkbox").isChecked()) && !stat1Main.includes("Boss DMG"), `${await stat2.innerText()} | ${stat1Main}`);
  const hb = (await api("GET", `/hexa/${plumId}`)).json;
  check("HEXA", "the input was saved (the API agrees)", hb.input.current.mastery3 === 1 && hb.input.perDay === 10 && hb.input.erdaRequest === true && hb.input.dungeon === "nightmareParadise" && hb.input.janus === false && hb.input.stats[1].lines[0].stat === "bossDmg" && hb.input.stats[1].lines[0].level === 2, JSON.stringify(hb.input));
  // HEXA Stat II at main line 2: its unlock (10 / 200) and two rank-ups at 10 each, exactly: invested 3 + 10 = 13 Sol Erda, 50 + 220 = 270
  check("HEXA", "HEXA Stat II's spending counts: 13 Sol Erda and 270 fragments invested, exact", /Invested 13 270 /i.test(await sumText()), await sumText());
  const stat2Text = (await stat2.innerText()).replace(/\s+/g, " ");
  check("HEXA", "HEXA Stat's damage (v3.1.0): what rank 20 adds on average, its other lines' best stats assumed", /≈ \+\d+\.\d+% to rank 20/.test(stat2Text) && /best stats assumed/.test(stat2Text), stat2Text);
  const statRow = (await prio.locator("tbody tr", { hasText: "HEXA Stat" }).first().innerText()).replace(/\s+/g, " ");
  check("HEXA", "a HEXA Stat row in the priority has its final damage (≈)", /≈ \+\d+\.\d+%/.test(statRow), statRow);
  await shot("23-hexa");
  await page.getByRole("button", { name: "Full order" }).click();
  const fullOrder = page.getByRole("region", { name: "Full upgrade order" });
  await fullOrder.waitFor({ timeout: 5000 });
  const steps = fullOrder.getByRole("listitem");
  // the built order (the same skill several in a row joined, the three HEXA Stat nodes in it): as many steps as the API's;
  // Wish Unending 0 → 1 done, Plum Blossom next
  const orderLength = (await api("GET", `/hexa/${plumId}`)).json.order.length;
  check("HEXA", "the full order: every step, the first done, the second next", (await steps.count()) === orderLength && orderLength > 150 && /done/.test(await steps.nth(0).getAttribute("class")) && /next/.test(await steps.nth(1).getAttribute("class")), `${await steps.count()} of ${orderLength}`);
  await steps.nth(1).hover();
  const tip = bare(await steps.nth(1).getByRole("tooltip").innerText());
  check("HEXA", "hovering a step shows its levels, cost and gain", (await steps.nth(1).getByRole("tooltip").isVisible()) && /2\. Plum Blossom Sword: Storm Lv\. 0 → 1 3 50 \+2\.06%/.test(tip), tip);
  await steps.nth(1).click();
  await settle(400);
  check("HEXA", "clicking a step changes nothing", (await api("GET", `/hexa/${plumId}`)).json.input.current.mastery1 === 0);
  await fullOrder.getByRole("checkbox", { name: /Hide done/ }).check();
  check("HEXA", "hiding what's done leaves one fewer", (await steps.count()) === orderLength - 1);
  await shot("23b-hexa-order");
  await page.getByRole("button", { name: "Tracker" }).click();
  await page.setViewportSize({ width: 900, height: 900 });
  await settle(400);
  check("Layout", "the HEXA page at 900 px wide: no sideways scrolling", (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  await page.setViewportSize({ width: 1400, height: 900 });
  for (const [what, method, where, body, status] of [
    ["hexa: Origin below 1", "PUT", `/hexa/${plumId}`, { ...hb.input, current: { ...hb.input.current, origin: 0 } }, 400],
    ["hexa: a character that doesn't exist", "GET", "/hexa/999999", undefined, 404],
    ["hexa: a world it doesn't know", "GET", "/hexa?world=1", undefined, 400],
  ]) {
    const r = await api(method, where, body);
    check("API", `${what}: ${status}`, r.status === status, `${r.status} ${JSON.stringify(r.json)}`);
  }
  check("HEXA", "the Ren removed again", (await api("DELETE", `/characters/${plumId}`)).status === 204);

  // ---------- Familiars (v3.2.0) ----------
  await go("/familiars");
  const famBox = page.getByRole("region", { name: "Familiars" });
  await famBox.waitFor({ timeout: 10000 });
  check("Familiars", "in the rail after HEXA; the world's characters as tabs, MikuBeam first; three Common familiars, no lines, no totals", (await page.getByRole("tab", { name: /MikuBeam/ }).getAttribute("aria-selected")) === "true" && (await famBox.getByRole("group").count()) === 3 && /Nothing entered yet/.test(await page.getByRole("region", { name: "Totals" }).innerText()));
  const famPick = async (label, value) => {
    await famBox.getByRole("combobox", { name: label, exact: true }).selectOption(value);
    await settle(250);
  };
  const line2Groups = async (n) => famBox.getByRole("combobox", { name: `Familiar ${n} line 2`, exact: true }).locator("optgroup").evaluateAll((gs) => gs.map((g) => g.label));
  await famPick("Familiar 1 rank", "unique");
  check("Familiars", "a Unique's 2nd line: Epic (usual) or Unique (rare); its Boss DMG line is 40% only", JSON.stringify(await line2Groups(1)) === JSON.stringify(["Epic (usual)", "Unique (rare)"]) && (await famBox.getByRole("combobox", { name: "Familiar 1 line 1", exact: true }).locator("option", { hasText: "Boss DMG" }).allInnerTexts()).join() === "Boss DMG +40%");
  await famPick("Familiar 1 rank", "legendary");
  await famPick("Familiar 1 line 1", "bossDmg:50");
  await famPick("Familiar 1 line 2", "attPct:6");
  await famPick("Familiar 2 rank", "unique");
  await famPick("Familiar 2 line 1", "bossDmg:40");
  await famPick("Familiar 2 line 2", "ied:30");
  await famPick("Familiar 3 rank", "unique");
  await famPick("Familiar 3 line 1", "bossDmg:40");
  await famPick("Familiar 3 line 2", "critRate:4");
  const badgeBox = page.getByRole("region", { name: "Badges" });
  check("Familiars", "the wiki's 48 badges, each with what it gives", (await badgeBox.getByRole("checkbox", { name: /Badge|^[A-Z]/ }).count()) >= 48 && /Critical Damage: \+1%/.test(await badgeBox.locator("label.fam-badge", { hasText: "Crucible" }).innerText()));
  for (const name of ["Labyrinth", "Ocean", "Holy", "Crucible", "Swamp", "Apocalypse", "Showa", "Cloud"]) {
    // (a click: the box shows its tick once the change is made, a moment after, which check() doesn't wait for)
    await badgeBox.locator("label.fam-badge", { hasText: name }).first().getByRole("checkbox").click();
    await settle(150);
  }
  await settle(500);
  check("Familiars", "8 badges equipped: the rest can't be ticked", /8 \/ 8/.test(await badgeBox.innerText()) && (await badgeBox.locator("label.fam-badge", { hasText: "Rebel" }).getByRole("checkbox").isDisabled()));
  const totRows = async () => (await page.getByRole("region", { name: "Totals" }).locator("tbody tr").allInnerTexts()).map((r) => r.replace(/\s+/g, " ").trim());
  const tr = await totRows();
  // by hand: Boss 50 + 40 + 40 = 130, 120 counts; ATT 6 + badges (Apocalypse 1, Holy 1) = 8; IED: familiars 30, badges Crucible 3 and Cloud 3:
  // 1 − 0.97² = 5.91%, all of them 1 − 0.7 × 0.97² = 34.14%; Crit DMG: Crucible 1; Damage: Labyrinth, Ocean, Showa 3; Crit Rate 4 + Ocean, Holy 2 = 6
  check("Familiars", "the totals, by hand: Boss 130% → 120%, ATT 8%, IED 34.14% (combined), Crit DMG 1%, Damage 3%, Crit Rate 6%", tr[0] === "Boss DMG % 130% – 120% 130% → 120%" && tr[1] === "ATT % 6% 2% 8%" && tr[2] === "IED % 30% 5.91% 34.14%" && tr[3] === "Crit DMG % – 1% 1%" && tr[4] === "Damage % – 3% 3%" && tr[5] === "Crit Rate % 4% 2% 6%", tr.join(" | "));
  const mikuId = (await api("GET", "/characters?world=45")).json.characters.find((c) => c.name === "MikuBeam").id;
  const famSaved = (await api("GET", `/familiars/${mikuId}`)).json;
  check("Familiars", "what's typed was saved (the API agrees)", famSaved.input.familiars[0].rank === "legendary" && famSaved.input.familiars[0].lines[0].value === 50 && famSaved.input.familiars[2].lines[1].stat === "critRate" && famSaved.input.badges.length === 8, JSON.stringify(famSaved.input));
  await shot("23c-familiars");
  await badgeBox.getByRole("checkbox", { name: "Damage badges only" }).click();
  check("Familiars", "damage badges only hides the ones that give none (Starter)", (await badgeBox.locator("label.fam-badge", { hasText: "Starter" }).count()) === 0);
  await badgeBox.getByRole("checkbox", { name: "Damage badges only" }).click();
  await famPick("Familiar 2 rank", "epic");
  check("Familiars", "a lower rank clears the line it can't have (Boss 40) and keeps the one it can (IED 30)", (await famBox.getByRole("combobox", { name: "Familiar 2 line 1", exact: true }).inputValue()) === "" && (await famBox.getByRole("combobox", { name: "Familiar 2 line 2", exact: true }).inputValue()) === "ied:30");
  await badgeBox.getByRole("button", { name: "Untick all" }).click();
  await settle(500);
  check("Familiars", "untick all: no badges", /0 \/ 8/.test(await badgeBox.innerText()) && (await api("GET", `/familiars/${mikuId}`)).json.input.badges.length === 0);
  await page.setViewportSize({ width: 900, height: 900 });
  await settle(400);
  check("Layout", "the Familiars page at 900 px wide: no sideways scrolling", (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  await page.setViewportSize({ width: 1400, height: 900 });
  const famLine = (stat, value) => ({ stat, value });
  for (const [what, body, status] of [
    ["familiars: a Unique with Boss 35% (not since v.264)", { familiars: [{ rank: "unique", lines: [famLine("bossDmg", 35), null] }, ...famSaved.input.familiars.slice(1)], badges: [] }, 400],
    ["familiars: a badge that doesn't exist", { ...famSaved.input, badges: ["nope"] }, 400],
    ["familiars: 9 badges", { ...famSaved.input, badges: famSaved.input.badges.concat(["rebel"]) }, 400],
  ]) {
    const r = await api("PUT", `/familiars/${mikuId}`, body);
    check("API", `${what}: ${status}`, r.status === status, `${r.status} ${JSON.stringify(r.json)}`);
  }
  check("API", "familiars: a character that doesn't exist: 404", (await api("GET", "/familiars/999999")).status === 404);
  // (back to nothing, for the checks after)
  check("Familiars", "cleared again", (await api("PUT", `/familiars/${mikuId}`, { familiars: [0, 1, 2].map(() => ({ rank: "common", lines: [null, null] })), badges: [] })).status === 204);

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
  // (narrow windows, not phones: the app is for desktop browsers, PLAN.md "Not for phones for now"; the
  // phone-width checks added from v2.1.0 were dropped in v2.4.1, the owner's call)
  await go("/gear/flames");
  await page.getByRole("group", { name: /Items, cheapest/ }).waitFor();
  check("Layout", "the Flames page at 900 px wide: no sideways scrolling", (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  await go("/gear/starforce");
  await page.getByRole("group", { name: /Items, cheapest/ }).waitFor();
  check("Layout", "the Star Force page at 900 px wide: no sideways scrolling", (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  await go("/gear/potential");
  await page.getByRole("group", { name: /Items, cheapest/ }).waitFor();
  check("Layout", "the Potential page at 900 px wide: no sideways scrolling", (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
  await go("/gear/upgrades");
  await page.getByRole("region", { name: "All steps" }).waitFor();
  check("Layout", "the Upgrades page at 900 px wide: no sideways scrolling", (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
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
