// node scripts/hexa-data.mjs: rebuilds every job's HEXA figures (server/src/gameFigures/hexa-jobs.json),
// by hand, after a GMS patch or a class rework. Never part of the app or its tests: the app only reads the
// file this writes. Polite: one request at a time, with a pause.
//
// What it takes (decided with the owner, 2026-11-01; research in tempdata/hexa/RESEARCH.md):
//   - each job's damage per HEXA core level: chablades/mapledoro's public/data/scouter-engine.json, its copy
//     of MapleScouter's figures for every class (collected before MapleScouter blocked scripts). Only each
//     class's `cores` and the shared `curves` are kept: what the HEXA maths needs (calc/hexaDamage.ts).
//   - each job's node names: the MapleStory Wiki's "<job>/Skills" page, "HEXA Skills" sections: Origin and
//     Ascent, Mastery 1–4, Boost 1–4 (the 5th job skill each boosts) and the 3rd Common node. A job whose
//     nodes are "SHINE …" is a SHINE class (Erda Link, no HEXA Matrix).
//   - the flat ATT a core also gives (v3.2.0: the 3rd Common node of about 20 jobs, a buff, and Zero's 4th
//     Mastery node), by core level, which MapleScouter measured apart from the core figures: mapledoro's
//     CORE_ATT table (src/features/characters/scouter/engine/scouterEngine.ts), uptime-weighted ATT at a
//     few levels, straight lines between them, nothing at level 0.
//   - the jobs: the gear list's (gear-items.json), keyed by the name Nexon's rankings use.
// Whatever doesn't parse is reported, and the file isn't written.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve(import.meta.dirname, "../server/src/gameFigures/hexa-jobs.json");
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
  Khali: "Khali", Kinesis: "Kinesis", Lara: "Lara", Luminous: "Luminous", Lynn: "Lynn", Marksman: "Marksman", Mechanic: "Mechanic", Mercedes: "Mercedes",
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
  const section = async (line) => {
    const s = sections.find((x) => x.line === line);
    return s ? (await wiki({ action: "parse", page, prop: "wikitext", section: s.index })).wikitext : "";
  };
  const skill = cells(await section("Class-Specific HEXA Skills")).map(first);
  const mastery = cells(await section("Mastery Skills")).map(first);
  const boost = [...(await section("HEXA Enhancements")).matchAll(/\|skillName=(.*)/g)].map((m) => links(m[1])[0]?.target ?? "");
  const common = cells(await section("Common HEXA Skills")).map(first);
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
if (problems.length) {
  console.log(`Not written:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
const generated = new Date().toISOString().slice(0, 10);
writeFileSync(OUT, `${JSON.stringify({ generated, sources: { figures: ENGINE, coreAtt: ENGINE_CODE, names: "https://maplestorywiki.net/w/<job>/Skills (HEXA Skills)" }, curves: engine.curves, jobs: out })}\n`);
console.log(`${jobs.length} jobs written to ${OUT}.`);
