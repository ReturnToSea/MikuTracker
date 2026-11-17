// node scripts/hexa-data.mjs: rebuilds every job's HEXA figures (server/src/gameFigures/hexa-jobs.json),
// by hand, after a GMS patch or a class rework. Never part of the app or its tests: the app only reads the
// file this writes. Polite: one request at a time, with a pause.
//
// What it takes (decided with the owner, 2026-11-01; research in tempdata/hexa/RESEARCH.md):
//   - each job's damage per HEXA core level: chablades/mapledoro's public/data/scouter-engine.json, its copy
//     of MapleScouter's figures for every class (collected before MapleScouter blocked scripts). Only each
//     class's `cores` and the shared `curves` are kept: what the HEXA maths needs (calc/hexaDamage.ts).
//   - each job's node names: the MapleStory Wiki's "<job>/Skills" page, "HEXA Skills" ("6th Job Skills") sections: Origin and
//     Ascent, Mastery 1–4, Boost 1–4 (the 5th job skill each boosts) and the 3rd Common node. A job whose
//     nodes are "SHINE …" is a SHINE class (Erda Link, no HEXA Matrix).
//   - the flat ATT a core also gives (v3.2.0: the 3rd Common node of about 20 jobs, a buff, and Zero's 4th
//     Mastery node), by core level, which MapleScouter measured apart from the core figures: mapledoro's
//     CORE_ATT table (src/features/characters/scouter/engine/scouterEngine.ts), uptime-weighted ATT at a
//     few levels, straight lines between them, nothing at level 0.
//   - the jobs: the gear list's (gear-items.json), keyed by the name Nexon's rankings use.
//   - MapleScouter's own order for a class whose levels mapledoro didn't measure (v4.3.0: Lethe, measured at 0
//     only): its HEXA page's `/api/calc/hexa-order` answer, in the owner's captures of that page (we never send
//     MapleScouter anything), kept in hexa-scouter-orders.json so a rebuild without the capture keeps it. Each
//     step: a core from level A to B and the damage after it, as a share of every core at 30. Our maths adds
//     what each core loses below 30, so a step's gain is its core's loss at A less its loss at B: walking back
//     from 30 (no loss) gives the core's figure at every level the order stops at ("masteryCore1=9"). They
//     replace mapledoro's for that class (its figures for a class it couldn't measure are its own estimates).
//     The share before the first step isn't in the order: a capture must also have MapleScouter's calculation
//     (`/api/calc/dmg`) for that class at the order's starting levels; its score there, read off the order's
//     own score-per-share table (`bossStatByMult`, its lowest two shares, nearly a straight line there), gives
//     it. A level the order jumps over (Origin 23 → 30) gains nothing until the jump's end, as MapleScouter's
//     choice to take them together says. Only for a class whose cores just add up (no pairs of cores and no
//     cores multiplying the rest in mapledoro's figures, as Lethe's): for the others, reading the order needs
//     those too, so the script refuses.
// Usage: node scripts/hexa-data.mjs [captures of MapleScouter's HEXA page and its calculation (.har) …]
// Whatever doesn't parse is reported, and the file isn't written.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve(import.meta.dirname, "../server/src/gameFigures/hexa-jobs.json");
const ORDERS = path.resolve(import.meta.dirname, "../server/src/gameFigures/hexa-scouter-orders.json");
const GEAR = path.resolve(import.meta.dirname, "../server/src/gameFigures/gear-items.json");
const ENGINE = "https://raw.githubusercontent.com/chablades/mapledoro/main/public/data/scouter-engine.json";
const ENGINE_CODE = "https://raw.githubusercontent.com/chablades/mapledoro/main/src/features/characters/scouter/engine/scouterEngine.ts";
const UA = { "User-Agent": "MikuTracker HEXA figures (personal, by hand)" };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
// The cores a node can be (server/src/calc/hexaDamage.ts CORE_KEYS, but Sol Janus's: none)
const CORES = ["skillCore1", "skillCore2", "masteryCore1", "masteryCore2", "masteryCore3", "masteryCore4", "reinCore1", "reinCore2", "reinCore3", "reinCore4", "generalCore2", "generalCore3"];

// The wiki's page names where they differ from Nexon's job names; mapledoro's class ids where they don't
// follow from the name; MapleScouter's icon names (hexa-matrix-tracker's class registry).
const WIKI = { "Arch Mage Fire/Poison": "Arch Mage (Fire, Poison)", "Arch Mage Ice/Lightning": "Arch Mage (Ice, Lightning)" };
const CLASS = { "Dual Blade": "blade_master", "Arch Mage Fire/Poison": "arch_mage_f_p", "Arch Mage Ice/Lightning": "arch_mage_i_l" };
const ICONS = {
  Adele: "Adele", "Angelic Buster": "AngelicBuster", Aran: "Aran", "Arch Mage Fire/Poison": "ArchMageFP", "Arch Mage Ice/Lightning": "ArchMageTC", Ark: "Ark",
  "Battle Mage": "BattleMage", Bishop: "Bishop", Blaster: "Blaster", "Blaze Wizard": "FlameWizard", "Bow Master": "Bowmaster", Buccaneer: "Viper", Cadena: "Cadena",
  Cannoneer: "CannonMaster", Corsair: "Captain", "Dark Knight": "DarkKnight", "Dawn Warrior": "SoulMaster", "Demon Avenger": "DemonAvenger", "Demon Slayer": "DemonSlayer",
  "Dual Blade": "DualBlader", Evan: "Evan", Hayato: "Hayato", Hero: "Hero", Hoyoung: "Hoyeong", Illium: "Illium", Kain: "Kain", Kaiser: "Kaiser", Kanna: "Kanna",
  Khali: "Khali", Kinesis: "Kinesis", Lara: "Lara", Lethe: "Lethe", Luminous: "Luminous", Lynn: "Lynn", Marksman: "Marksman", Mechanic: "Mechanic", Mercedes: "Mercedes",
  Mihile: "Mikhail", "Night Lord": "NightLord", "Night Walker": "NightWalker", Paladin: "Palladin", Pathfinder: "PathFinder", Phantom: "Phantom", Ren: "Len",
  Shade: "Eunwol", Shadower: "Shadower", "Thunder Breaker": "Striker", "Wild Hunter": "WildHunter", "Wind Archer": "WindBreaker", Xenon: "Xenon", Zero: "Zero",
};

async function wiki(params) {
  await pause(400);
  const res = await fetch(`https://maplestorywiki.net/api.php?${new URLSearchParams({ ...params, format: "json", formatversion: "2" })}`, { headers: UA });
  const body = res.ok ? await res.json() : null;
  // (the wiki refusing or erroring: say where, not a puzzling crash)
  if (!body?.parse) {
    console.log(`The wiki didn't answer for ${params.page}${params.section ? ` (section ${params.section})` : ""}: ${res.status} ${body?.error?.info ?? ""}. Nothing written.`);
    process.exit(1);
  }
  return body.parse;
}
// A wiki link's target and label ([[target#part|label]]; labels can hold [brackets]); pictures skipped.
const LINK = /\[\[((?:[^[\]]|\[[^[\]]*\])+)\]\]/g;
function links(text) {
  return [...text.matchAll(LINK)]
    .map((m) => m[1])
    .filter((t) => !t.startsWith("File:"))
    .map((t) => {
      const [target, label] = t.split("|");
      return { target: target.split("#")[0].trim(), label: (label ?? target).trim() };
    });
}
// The cells of a section's first table's data row (the row after "Node/Core 1 … n").
function cells(text) {
  const start = text.indexOf("|-", text.indexOf("Node/Core 1")) + 2;
  const body = text.slice(start, text.indexOf("|}", start));
  return `\n${body}`.split(/\n\|(?![-}])/).slice(1);
}
const first = (cell) => links(cell)[0]?.label ?? cell.trim();
const strip = (name) => name.replace(/^(HEXA|SHINE) /, "");

const jobs = Object.keys(JSON.parse(readFileSync(GEAR, "utf8")).jobs).sort();
const engine = await (await fetch(ENGINE, { headers: UA })).json();
// CORE_ATT: `class: ["core", { level: ATT, … }]` entries, read from its block
const code = await (await fetch(ENGINE_CODE, { headers: UA })).text();
const block = code.slice(code.indexOf("export const CORE_ATT"), code.indexOf("};", code.indexOf("export const CORE_ATT")));
const coreAtt = Object.fromEntries(
  [...block.matchAll(/["']?(\w+)["']?: \["(\w+)", \{([^}]*)\}\]/g)].map(([, id, core, pts]) => [id, { core, points: pts.split(",").map((p) => p.split(":").map(Number)) }]),
);
if (Object.keys(coreAtt).length < 10) {
  console.log(`mapledoro's CORE_ATT wasn't found (${Object.keys(coreAtt).length} entries). Nothing written.`);
  process.exit(1);
}
const out = {};
const problems = [];
for (const job of jobs) {
  const page = `${WIKI[job] ?? job}/Skills`;
  const sections = (await wiki({ action: "parse", page, prop: "sections" }))?.sections ?? [];
  // (a section by any of its titles: the wiki renamed "… HEXA …" to "… 6th Job …" in November 2026)
  const section = async (...titles) => {
    const s = sections.find((x) => titles.includes(x.line));
    return s ? (await wiki({ action: "parse", page, prop: "wikitext", section: s.index })).wikitext : "";
  };
  const skill = cells(await section("Class-Specific HEXA Skills", "Class-Specific 6th Job Skills")).map(first);
  const mastery = cells(await section("Mastery Skills")).map(first);
  const boost = [...(await section("HEXA Enhancements", "6th Job Enhancements")).matchAll(/\|skillName=(.*)/g)].map((m) => links(m[1])[0]?.target ?? "");
  const common = cells(await section("Common HEXA Skills", "Common 6th Job Skills")).map(first);
  const shine = [...mastery, ...common].some((n) => n.startsWith("SHINE"));
  const id = CLASS[job] ?? job.toLowerCase().replace(/[^a-z]+/g, "_");
  const figures = engine.classes[id];
  const entry = { class: id, shine, icons: ICONS[job] ?? null, names: { origin: skill[0], ascent: skill[1], mastery: mastery.map(strip), boost, common3: common[2] ? strip(common[2]) : null }, cores: figures?.cores ?? null, coreAtt: coreAtt[id] ?? null };
  const names = [entry.names.origin, entry.names.ascent, ...entry.names.mastery, ...entry.names.boost, entry.names.common3];
  if (!figures) problems.push(`${job}: no mapledoro class "${id}"`);
  // (what the app relies on: a core it knows, points from level 1 to 30 in order, no negative ATT)
  const pts = entry.coreAtt?.points ?? [];
  if (entry.coreAtt && (!CORES.includes(entry.coreAtt.core) || pts[0]?.[0] !== 1 || pts.at(-1)?.[0] !== 30 || pts.some(([L, att], i) => !(att >= 0) || (i > 0 && !(L > pts[i - 1][0]))))) problems.push(`${job}: odd CORE_ATT ${JSON.stringify(entry.coreAtt)}`);
  if (!shine && (entry.names.mastery.length !== 4 || entry.names.boost.length !== 4 || names.some((n) => !n || n === "TBA" || n.includes("[[")))) problems.push(`${job}: names ${JSON.stringify(entry.names)}`);
  // (a core the figures put above its level 30 at level 0: the app counts it as worth nothing; worth a look)
  for (const [key, value] of Object.entries(entry.cores ?? {})) if (/=0$/.test(key) && value > 1) console.log(`  note: ${job}'s ${key} is ${value} (above 1)`);
  out[job] = entry;
  console.log(job, shine ? "(SHINE)" : "", entry.names.origin, "/", entry.names.common3);
}
// MapleScouter's orders: the ones kept, and any in the captures given (a newer capture replaces its class's)
const orders = existsSync(ORDERS) ? JSON.parse(readFileSync(ORDERS, "utf8")).classes : {};
const entries = process.argv.slice(2).flatMap((file) => JSON.parse(readFileSync(file, "utf8")).log.entries.map((e) => ({ file, e })));
const posted = (e, part) => e.request.method === "POST" && e.request.url.includes(part) && e.response.content?.text;
// (a browser may save an answer base64-encoded)
const answerOf = (e) => JSON.parse(e.response.content.encoding === "base64" ? Buffer.from(e.response.content.text, "base64").toString("utf8") : e.response.content.text);
const coreLevels = (hexa) => JSON.stringify(CORES.map((c) => Number(hexa[c])));
// MapleScouter's score at some HEXA levels, by class and levels (its calculation's answers)
const scores = new Map(
  entries
    .filter(({ e }) => posted(e, "/api/calc/dmg"))
    .map(({ e }) => {
      const user = JSON.parse(e.request.postData.text).userStat;
      return [`${user.stat.myClass} ${coreLevels(user.hexa)}`, answerOf(e).calculatedData.boss380_hexaStat];
    }),
);
for (const { file, e } of entries) {
  if (!posted(e, "/api/calc/hexa-order")) continue;
  const korean = new URL(e.request.url).searchParams.get("class");
  const id = Object.keys(engine.classes).find((k) => engine.classes[k].koreanName === korean);
  if (!id) {
    problems.push(`${file}: an order for "${korean}", which isn't one of mapledoro's classes`);
    continue;
  }
  const answer = answerOf(e);
  // each step: [core, from, to, share after it]; HEXA Stat's steps kept (their gain isn't a core's)
  const steps = answer.class_hexa.map((st) => {
    const [from, to] = String(st[10]).split(" ").pop().split("→").map(Number); // ("0→1"; "헥사스탯3 0→20")
    return [st[9], from, to, st[8]];
  });
  // the share before the first step, from the score at the starting levels
  const score = scores.get(`${korean} ${coreLevels(JSON.parse(e.request.postData.text).myHexa)}`);
  if (score === undefined) {
    problems.push(`${file}: MapleScouter's order for "${korean}" without its calculation at the same starting levels (capture its result page too)`);
    continue;
  }
  const table = Object.entries(answer.bossStatByMult).map(([k, v]) => [Number(k), v]).sort((x, y) => x[0] - y[0]);
  const [[x0, y0], [x1, y1]] = table;
  orders[id] = { captured: e.startedDateTime.slice(0, 10), start: x0 - ((y0 - score) * (x1 - x0)) / (y1 - y0), steps };
}
for (const [id, { start, steps }] of Object.entries(orders)) {
  const job = Object.keys(out).find((j) => out[j].class === id);
  if (!job) {
    problems.push(`MapleScouter's order for "${id}": no such job`);
    continue;
  }
  if (Object.keys(out[job].cores).some((k) => k.includes(",") || k.startsWith("only "))) {
    problems.push(`${job}: its figures pair or multiply cores, so MapleScouter's order can't be read as cores that add up`);
    continue;
  }
  const loss = {};
  for (let i = steps.length - 1; i >= 0; i--) {
    const [core, from, to, share] = steps[i];
    if (core.startsWith("hexaStat")) continue;
    const known = (loss[core] ??= { 30: 0 });
    // (a core's steps go up one after another, the last to 30; each a gain, never a loss)
    if (!CORES.includes(core) || known[to] === undefined || !(from < to)) problems.push(`${job}: MapleScouter's step ${i} (${core} ${from} → ${to}) doesn't follow on`);
    else known[from] = known[to] + (share - (i === 0 ? start : steps[i - 1][3]));
    if (known[from] < known[to]) problems.push(`${job}: MapleScouter's step ${i} (${core} ${from} → ${to}) loses damage`);
  }
  // each level the order stops at; one it jumps over (Origin 23 → 30) gains nothing until the jump's end:
  // MapleScouter took the levels together, so by its figures no part of the jump was worth more on its own
  // (our maths would otherwise fill them in Ren's shape, and take them one at a time)
  for (const [core, levels] of Object.entries(loss)) {
    const stops = Object.keys(levels).map(Number).sort((x, y) => x - y);
    for (let L = stops[0]; L < 30; L++) out[job].cores[`${core}=${L}`] = 1 - levels[stops.findLast((k) => k <= L)];
  }
  console.log(`${job}: levels from MapleScouter's order (${steps.length} steps, starting at ${start.toFixed(4)})`);
}
if (problems.length) {
  console.log(`Not written:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
const generated = new Date().toISOString().slice(0, 10);
const orderSource = "MapleScouter's HEXA order (its /api/calc/hexa-order answer, from the owner's captures of its HEXA page)";
writeFileSync(ORDERS, `${JSON.stringify({ source: orderSource, classes: orders })}\n`);
writeFileSync(OUT, `${JSON.stringify({ generated, sources: { figures: ENGINE, coreAtt: ENGINE_CODE, names: "https://maplestorywiki.net/w/<job>/Skills (6th Job Skills, formerly HEXA Skills)", orders: `${orderSource}: ${Object.keys(orders).join(", ") || "none"}` }, curves: engine.curves, jobs: out })}\n`);
console.log(`${jobs.length} jobs written to ${OUT}.`);
