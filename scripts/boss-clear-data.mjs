// npx tsx scripts/boss-clear-data.mjs --patch v.272 <MapleScouter captures (.har)…>: rebuilds the boss clears' figures
// (server/src/gameFigures/boss-clear.json), by hand, after a GMS patch or a MapleScouter update. Never part
// of the app or its tests: the app only reads the file this writes.
//
// What it takes (decided with the owner, 2026-11-04; research in tempdata/v41/):
//   - chablades/mapledoro's copy of MapleScouter's boss cuts (src/features/characters/scouter/
//     bosscut-data.generated.ts, read as data): each boss difficulty's level, defense, Arcane and Sacred
//     Force, party size, cut and difficulty rate, in MapleScouter's order. Since MapleScouter moved its cuts
//     to its server (Nov 2026) mapledoro updates it by hand. (mapledoro's own estimated older bosses are left
//     out: the owner, too easy for any character; so is Normal Kai.)
//   - the phase HP: MapleScouter's boss script, from a capture the owner saves of a MapleScouter page that
//     loads it (its Boss Info page, or its results page since v.272; the browser's Network tab, "Save all as
//     HAR"; we never send MapleScouter anything ourselves). KMS figures, in units of 100 million; a phase
//     with several HP bars or monsters lists each.
//   - MapleScouter's own clear rates (v4.4.0, the owner: mapledoro's hand-kept table had fallen behind them):
//     its answers to the calculations in the captures, for sheets with no Ascent core, no Sacred symbol bonus
//     and no Genesis Pass buff. Each boss's difficulty rate is corrected so that our calculation, given
//     MapleScouter's own damage figures, gives MapleScouter's rate (calc/bossClear.ts scouterCorrection),
//     averaged over the sheets: for every boss, rates from at least two classes, which must agree within 3%.
//     (Not Challenger mode's: it raises MapleScouter's rates ~1.2%.)
//   - the GMS patch the figures are for (--patch), shown on the page with the day they were rebuilt.
//     (Run with tsx: it uses the app's own calculation.) mapledoro's table is the start: re-check it when
//     they update, and compare.
// Whatever doesn't parse is reported, and the file isn't written.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { scouterCorrection } from "../server/src/calc/bossClear.ts";
import { statsJob } from "../server/src/gameFigures/stats.ts";
import jobFigures from "../server/src/gameFigures/stats-jobs.json" with { type: "json" };

const OUT = path.resolve(import.meta.dirname, "../server/src/gameFigures/boss-clear.json");
const SOURCE = "https://raw.githubusercontent.com/chablades/mapledoro/main/src/features/characters/scouter/bosscut-data.generated.ts";
const ENGINE = "https://raw.githubusercontent.com/chablades/mapledoro/main/public/data/scouter-engine.json";
const args = process.argv.slice(2);
const patch = args.includes("--patch") ? args[args.indexOf("--patch") + 1] : undefined;
const hars = args.filter((a, i) => a !== "--patch" && args[i - 1] !== "--patch");
if (hars.length === 0 || !/^v\.\d+$/.test(patch ?? "")) {
  console.log("Usage: npx tsx scripts/boss-clear-data.mjs --patch v.272 <capture.har> [more.har…]");
  process.exit(1);
}
// (most within this of each other: the sheets' corrections for one boss)
const AGREE = 0.03;

// The bosses' English names and the level each one lets you in at (the MapleStory Wiki's boss list, as
// mapledoro has it), by MapleScouter's id.
const BOSSES = {
  jupiter: ["Jupiter", 295], bardrix: ["Baldrix", 290], limbo: ["Limbo", 285], maleficStar: ["Malefic Star", 280], kaling: ["Kaling", 275],
  adversary: ["First Adversary", 270], kalos: ["Kalos", 265], seren: ["Seren", 260], blackMage: ["Black Mage", 255], darknell: ["Darknell", 255],
  verusHilla: ["Verus Hilla", 250], gloom: ["Gloom", 245], will: ["Will", 235], lucid: ["Lucid", 220], slime: ["Guardian Angel Slime", 210],
  lotus: ["Lotus", 190], damien: ["Damien", 190], maerin: ["Mayrin", 270],
};
// A boss whose difficulties let you in at different levels (mapledoro's ENTRY_LEVEL_BY_DIFFICULTY).
const ENTRY_BY_DIFFICULTY = { maerin: { Hard: 280 } };
// Left out (the owner: Normal Kai, too easy to be worth showing).
const LEFT_OUT = new Set(["kai Normal"]);
// A phase's name: MapleScouter's Korean, in English.
const phaseName = (k) =>
  k.replace(/^(\d)페/, "Phase $1").replace("(혼돈/궁기/도올)", " (Beasts)").replace("-파랑", " (Blue)").replace("-보라", " (Purple)");

const problems = [];
const get = async (url) => {
  const res = await fetch(url, { headers: { "User-Agent": "MikuTracker boss figures (personal, by hand)" } });
  if (!res.ok) {
    console.log(`${url} answered ${res.status}. Nothing written.`);
    process.exit(1);
  }
  return res.text();
};
const code = await get(SOURCE);
const block = code.slice(code.indexOf("export const BOSSCUT_DATA"), code.indexOf("];", code.indexOf("export const BOSSCUT_DATA")));
const field = (line, k) => {
  const m = line.match(new RegExp(`\\b${k}: (null|-?[\\d.]+|"[^"]*")`));
  if (!m) return undefined;
  return m[1] === "null" ? null : m[1].startsWith('"') ? m[1].slice(1, -1) : Number(m[1]);
};
const bosses = [];
const korean = {}; // (MapleScouter's Korean name, by id: how its answers name a boss)
for (const line of block.split("\n").filter((l) => l.trim().startsWith("{ boss:"))) {
  const name = field(line, "name");
  if (LEFT_OUT.has(`${name} ${field(line, "difficulty")}`)) continue;
  korean[field(line, "boss")] = name;
  const b = { name, difficulty: field(line, "difficulty"), level: field(line, "level"), guard: field(line, "guard"), arcane: field(line, "arcaneForce"), sacred: field(line, "authenticForce"), partyLimit: field(line, "partyLimit"), cut: field(line, "bossCut"), partyCut: field(line, "partyBossCut"), easyRate: field(line, "easyRate") ?? 1 };
  if (!Object.hasOwn(BOSSES, name)) problems.push(`no English name for "${name}"`);
  if (![300, 380].includes(b.guard) || !(b.level > 0) || !(b.partyLimit > 0) || (b.cut === null && b.partyCut === null) || !(b.easyRate > 0)) problems.push(`${name} ${b.difficulty}: ${line.trim()}`);
  bosses.push({ ...b, label: BOSSES[name]?.[0], entryLevel: ENTRY_BY_DIFFICULTY[name]?.[b.difficulty] ?? BOSSES[name]?.[1] });
}
if (bosses.length < 50) problems.push(`only ${bosses.length} bosses found`);

// The phase HP: the module of MapleScouter's script whose object maps "<id>_<difficulty>" to its phases.
const entries = hars.flatMap((file) => JSON.parse(readFileSync(file, "utf8")).log.entries.map((e) => ({ file, e })));
// (a browser may save a body base64-encoded)
const textOf = (c) => (c.encoding === "base64" ? Buffer.from(c.text, "base64").toString("utf8") : c.text);
const scripts = entries.map(({ e }) => e.response?.content).filter((c) => c?.text).map(textOf);
const src = scripts.find((t) => /jupiter_hard:\{"1페":/.test(t));
const hp = {};
if (!src) problems.push("no phase HP in the capture (open MapleScouter's Boss Info or results page while it records)");
else {
  const start = src.indexOf("jupiter_hard:{");
  // (a number: decimal, with an exponent, or hex, maybe times a factor)
  const num = String.raw`(?:0x[0-9a-f]+|[\d.]+(?:e\d+)?)(?:\*(?:[\d.]+))?`;
  const value = (t) => t.split("*").map((x) => (x.startsWith("0x") ? parseInt(x, 16) : Number(x))).reduce((a, x) => a * x, 1);
  for (const m of src.slice(start, src.indexOf("}}", start) + 1).matchAll(/(\w+):\{([^}]*)\}/g)) {
    const phases = [];
    for (const p of m[2].matchAll(new RegExp(String.raw`"([^"]+)":(\[(?:${num},?)+\]|${num})`, "g"))) {
      const parts = p[2].startsWith("[") ? p[2].slice(1, -1).split(",") : [p[2]];
      phases.push({ name: phaseName(p[1]), hp: parts.map((x) => Math.floor(value(x)) * 1e8) });
    }
    if (phases.length === 0 || phases.some((p) => p.hp.some((x) => !(x > 0)) || !p.name.startsWith("Phase"))) problems.push(`phase HP of ${m[1]}: ${m[2]}`);
    hp[m[1]] = phases;
  }
  for (const b of bosses) if (b.difficulty !== "Champion" && !hp[`${b.name}_${b.difficulty.toLowerCase()}`]) problems.push(`no phase HP for ${b.name} ${b.difficulty}`);
}
// MapleScouter's answers: each calculation's sheet (by its class's job) with its damage figures and rates
const engine = JSON.parse(await get(ENGINE)).classes;
const jobOf = (korean) => {
  const id = Object.keys(engine).find((k) => engine[k].koreanName === korean);
  return Object.keys(jobFigures.jobs).find((j) => jobFigures.jobs[j].class === id);
};
const sheets = [];
for (const { file, e } of entries) {
  if (e.request.method !== "POST" || !e.request.url.includes("/api/calc/dmg") || !e.response.content?.text) continue;
  const u = JSON.parse(e.request.postData.text).userStat;
  const d = JSON.parse(textOf(e.response.content)).calculatedData;
  // (Ascent, Genesis Pass, Sacred symbol bonus, Challenger mode)
  if (Number(u.hexa.skillCore2) !== 0 || u.doping.genePass || u.doping.authenticDmg || u.special.challenge || d.bossCutsOpts?.isChallengers) continue;
  const job = jobOf(u.stat.myClass);
  if (!job) {
    problems.push(`${file}: a sheet for "${u.stat.myClass}", which isn't one of our jobs`);
    continue;
  }
  const rates = Object.fromEntries(d.bossCuts.filter((c) => korean[c.boss]).map((c) => [`${korean[c.boss]} ${c.difficulty}`, c.clearRate]));
  // (the same calculation recorded twice counts once)
  if (sheets.some((x) => x.job === job && x.d380 === d.calculatedHexaDamage_380 && x.level === Number(u.stat.level))) continue;
  sheets.push({ job, level: Number(u.stat.level), arcane: Number(u.stat.arcaneForce), sacred: Number(u.stat.authenticForce), d380: d.calculatedHexaDamage_380, d300: d.calculatedHexaDamage_300, kaling: d.calculatedHexaDamage_kaling, normal380: d.calculatedDamage_380, rates });
}
const corrections = {};
for (const b of bosses) {
  const rated = sheets.filter((s) => s.rates[`${b.name} ${b.difficulty}`] > 0);
  if (new Set(rated.map((s) => s.job)).size < 2) {
    problems.push(`${b.name} ${b.difficulty}: MapleScouter's rate from ${new Set(rated.map((s) => s.job)).size} class(es); capture its results for at least two (with no Ascent core, Genesis Pass, Sacred symbol bonus or Challenger mode)`);
    continue;
  }
  const each = rated.map((s) => scouterCorrection(b, s, statsJob(s.job).spline300, statsJob(s.job).spline380));
  if (!each.every((c) => c > 0 && Number.isFinite(c))) {
    problems.push(`${b.name} ${b.difficulty}: a correction that isn't a positive number (${each.join(", ")})`);
    continue;
  }
  if (Math.max(...each) / Math.min(...each) - 1 > AGREE) problems.push(`${b.name} ${b.difficulty}: the sheets disagree (${each.map((c) => c.toFixed(4)).join(", ")})`);
  const k = each.reduce((a, c) => a * c, 1) ** (1 / each.length); // (their geometric mean)
  corrections[`${b.name} ${b.difficulty}`] = Number(k.toFixed(6));
  b.easyRate = Number((b.easyRate * k).toPrecision(9));
}
if (problems.length) {
  console.log(`Not written:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
const generated = new Date().toISOString().slice(0, 10);
const captured = [...new Set(entries.filter(({ e }) => e.request.url.includes("/api/calc/dmg")).map(({ e }) => e.startedDateTime.slice(0, 10)))].sort().at(-1);
writeFileSync(
  OUT,
  `${JSON.stringify({ generated, patch, sources: { cuts: SOURCE, hp: "MapleScouter's boss script (the owner's capture)", rates: `MapleScouter's clear rates for ${sheets.length} sheets of ${new Set(sheets.map((s) => s.job)).size} classes (the owner's captures, ${captured}): each boss's difficulty rate × its correction` }, corrections, bosses, hp })}\n`,
);
console.log(`${bosses.length} bosses and ${Object.keys(hp).length} difficulties' phase HP written to ${OUT}, corrected from ${sheets.length} of MapleScouter's answers:`);
for (const [key, k] of Object.entries(corrections)) console.log(`  ${key.padEnd(24)} ×${k.toFixed(4)}`);
