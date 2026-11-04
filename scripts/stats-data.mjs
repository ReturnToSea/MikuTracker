// node scripts/stats-data.mjs: rebuilds every job's Stats figures (server/src/gameFigures/stats-jobs.json), by
// hand, after a GMS patch, a class rework, or a refresh of mapledoro's data. Never part of the app or its
// tests: the app only reads the file this writes.
//
// What it takes (decided with the owner, 2026-11-03; research in tempdata/stats/): chablades/mapledoro's
// copies of MapleScouter's figures and of the game's own, read as data (its code has no license: the app's
// maths is our own, calc/stats.ts):
//   - public/data/scouter-engine.json: each class's constants for MapleScouter's damage formula (its hidden
//     stats, ATT, damage, crit, defense, toggles, the curve turning damage into the score, the cooldown
//     scale), each link skill's damage by level, and the cooldown reference tables. The HEXA cores are left
//     out (hexa-jobs.json has them).
//   - src/features/characters/setup/data/finalDamageData.generated.ts: each class's always-on Final Damage
//     (the game's v.271 skill data), without, with Decent, and with a Paladin's Combat Orders.
//   - src/features/characters/setup/data/damageRangeData.generated.ts: each class's weapon multiplier for
//     the damage range (the MapleStory Wiki's Damage Formula; one- and two-handed for Hero, Paladin, Dawn
//     Warrior), and which classes use Magic ATT.
//   - the jobs: hexa-jobs.json's, each with mapledoro's class id.
// Whatever doesn't parse, and any job without figures, is reported, and the file isn't written.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve(import.meta.dirname, "../server/src/gameFigures/stats-jobs.json");
const HEXA = path.resolve(import.meta.dirname, "../server/src/gameFigures/hexa-jobs.json");
const REPO = "https://raw.githubusercontent.com/chablades/mapledoro/main";
const SOURCES = {
  engine: `${REPO}/public/data/scouter-engine.json`,
  finalDamage: `${REPO}/src/features/characters/setup/data/finalDamageData.generated.ts`,
  range: `${REPO}/src/features/characters/setup/data/damageRangeData.generated.ts`,
};
const UA = { "User-Agent": "MikuTracker Stats figures (personal, by hand)" };
const get = async (url) => {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) {
    console.log(`${url} answered ${res.status}. Nothing written.`);
    process.exit(1);
  }
  return res.text();
};
// One exported object literal's entries from a generated TypeScript file: `name: value,` lines.
function block(code, name) {
  const start = code.indexOf(`export const ${name}`);
  const body = code.slice(code.indexOf("{", start) + 1, code.indexOf("\n};", start));
  return body;
}

const engine = JSON.parse(await get(SOURCES.engine));
const fdCode = await get(SOURCES.finalDamage);
const rangeCode = await get(SOURCES.range);
const finalDamage = Object.fromEntries([...block(fdCode, "BASE_FINAL_DAMAGE_PERCENT").matchAll(/(\w+): \[([^\]]+)\]/g)].map(([, id, xs]) => [id, xs.split(",").map(Number)]));
const multiplier = Object.fromEntries([...block(rangeCode, "WEAPON_MULTIPLIER").matchAll(/(\w+): ([\d.]+),/g)].map(([, id, x]) => [id, Number(x)]));
const byHand = Object.fromEntries([...block(rangeCode, "WEAPON_MULTIPLIER_BY_HAND").matchAll(/(\w+): \{ "1h": ([\d.]+), "2h": ([\d.]+) \}/g)].map(([, id, a, b]) => [id, { oneHanded: Number(a), twoHanded: Number(b) }]));
const magicStart = rangeCode.indexOf("export const MAGIC_ATT_CLASSES");
const magic = [...rangeCode.slice(magicStart, rangeCode.indexOf("];", magicStart)).matchAll(/"(\w+)"/g)].map((m) => m[1]);

const hexa = JSON.parse(readFileSync(HEXA, "utf8")).jobs;
const KEEP = ["stat", "flatAtk", "atkPct", "restraint", "dmg", "dmgPerBuffDuration", "crit", "defenseK", "toggles", "perCooldownPercent", "perResetChance", "perSummonDuration", "spline300", "spline380", "splineScale", "scale", "cooldownScale"];
const problems = [];
const jobs = {};
for (const [job, h] of Object.entries(hexa)) {
  const id = h.class;
  const c = engine.classes[id];
  const fd = finalDamage[id];
  const mult = byHand[id] ?? multiplier[id];
  if (!c) problems.push(`${job}: no class "${id}" in scouter-engine.json`);
  if (!fd || fd.length !== 3 || fd.some((x) => !(x >= 0))) problems.push(`${job}: Final Damage ${JSON.stringify(fd)}`);
  if (mult === undefined) problems.push(`${job}: no weapon multiplier`);
  if (!c || !fd || mult === undefined) continue;
  jobs[job] = { class: id, ...Object.fromEntries(KEEP.filter((k) => c[k] !== undefined).map((k) => [k, c[k]])), finalDamage: fd, weapon: mult, magic: magic.includes(id) };
}
if (Object.keys(magic).length < 10) problems.push(`only ${magic.length} Magic ATT classes found`);
if (problems.length) {
  console.log(`Not written:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
const generated = new Date().toISOString().slice(0, 10);
writeFileSync(OUT, `${JSON.stringify({ generated, sources: SOURCES, links: engine.links, cooldownRefs: engine.cooldownRefs, jobs })}\n`);
console.log(`${Object.keys(jobs).length} jobs written to ${OUT}.`);
