// node scripts/boss-clear-data.mjs <a MapleScouter capture (.har)>: rebuilds the boss clears' figures
// (server/src/gameFigures/boss-clear.json), by hand, after a GMS patch or a MapleScouter update. Never part
// of the app or its tests: the app only reads the file this writes.
//
// What it takes (decided with the owner, 2026-11-04; research in tempdata/v41/):
//   - chablades/mapledoro's copy of MapleScouter's boss cuts (src/features/characters/scouter/
//     bosscut-data.generated.ts, read as data): each boss difficulty's level, defense, Arcane and Sacred
//     Force, party size, cut and difficulty rate, in MapleScouter's order. (mapledoro's own estimated older
//     bosses are left out: the owner, too easy for any character.)
//   - the phase HP: MapleScouter's boss page script, from a capture the owner saves of its Boss Info page
//     (the browser's Network tab, "Save all as HAR"; we never send MapleScouter anything ourselves). KMS
//     figures, in units of 100 million; a phase with several HP bars or monsters lists each.
// Whatever doesn't parse is reported, and the file isn't written.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve(import.meta.dirname, "../server/src/gameFigures/boss-clear.json");
const SOURCE = "https://raw.githubusercontent.com/chablades/mapledoro/main/src/features/characters/scouter/bosscut-data.generated.ts";
const har = process.argv[2];
if (!har) {
  console.log("Usage: node scripts/boss-clear-data.mjs <capture.har>");
  process.exit(1);
}

// The bosses' English names and the level each one lets you in at (the MapleStory Wiki's boss list, as
// mapledoro has it), by MapleScouter's id.
const BOSSES = {
  jupiter: ["Jupiter", 295], bardrix: ["Baldrix", 290], limbo: ["Limbo", 285], maleficStar: ["Malefic Star", 280], kaling: ["Kaling", 275],
  adversary: ["First Adversary", 270], kalos: ["Kalos", 265], seren: ["Seren", 260], blackMage: ["Black Mage", 255], darknell: ["Darknell", 255],
  verusHilla: ["Verus Hilla", 250], gloom: ["Gloom", 245], will: ["Will", 235], lucid: ["Lucid", 220], slime: ["Guardian Angel Slime", 210],
  lotus: ["Lotus", 190], damien: ["Damien", 190],
};
// A phase's name: MapleScouter's Korean, in English.
const phaseName = (k) =>
  k.replace(/^(\d)페/, "Phase $1").replace("(혼돈/궁기/도올)", " (Beasts)").replace("-파랑", " (Blue)").replace("-보라", " (Purple)");

const problems = [];
const res = await fetch(SOURCE, { headers: { "User-Agent": "MikuTracker boss figures (personal, by hand)" } });
if (!res.ok) {
  console.log(`${SOURCE} answered ${res.status}. Nothing written.`);
  process.exit(1);
}
const code = await res.text();
const block = code.slice(code.indexOf("export const BOSSCUT_DATA"), code.indexOf("];", code.indexOf("export const BOSSCUT_DATA")));
const field = (line, k) => {
  const m = line.match(new RegExp(`\\b${k}: (null|-?[\\d.]+|"[^"]*")`));
  if (!m) return undefined;
  return m[1] === "null" ? null : m[1].startsWith('"') ? m[1].slice(1, -1) : Number(m[1]);
};
const bosses = [];
for (const line of block.split("\n").filter((l) => l.trim().startsWith("{ boss:"))) {
  const name = field(line, "name");
  const b = { name, difficulty: field(line, "difficulty"), level: field(line, "level"), guard: field(line, "guard"), arcane: field(line, "arcaneForce"), sacred: field(line, "authenticForce"), partyLimit: field(line, "partyLimit"), cut: field(line, "bossCut"), partyCut: field(line, "partyBossCut"), easyRate: field(line, "easyRate") ?? 1 };
  if (!Object.hasOwn(BOSSES, name)) problems.push(`no English name for "${name}"`);
  if (![300, 380].includes(b.guard) || !(b.level > 0) || !(b.partyLimit > 0) || (b.cut === null && b.partyCut === null) || !(b.easyRate > 0)) problems.push(`${name} ${b.difficulty}: ${line.trim()}`);
  bosses.push({ ...b, label: BOSSES[name]?.[0], entryLevel: BOSSES[name]?.[1] });
}
if (bosses.length < 50) problems.push(`only ${bosses.length} bosses found`);

// The phase HP: the module of MapleScouter's script whose object maps "<id>_<difficulty>" to its phases.
const entries = JSON.parse(readFileSync(har, "utf8")).log.entries;
const scripts = entries.map((e) => e.response?.content).filter((c) => c?.text).map((c) => (c.encoding === "base64" ? Buffer.from(c.text, "base64").toString("utf8") : c.text));
const src = scripts.find((t) => /jupiter_hard:\{"1페":/.test(t));
const hp = {};
if (!src) problems.push("no phase HP in the capture (open MapleScouter's Boss Info page while it records)");
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
if (problems.length) {
  console.log(`Not written:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
const generated = new Date().toISOString().slice(0, 10);
writeFileSync(OUT, `${JSON.stringify({ generated, sources: { cuts: SOURCE, hp: "MapleScouter's Boss Info page (the owner's capture)" }, bosses, hp })}\n`);
console.log(`${bosses.length} bosses and ${Object.keys(hp).length} difficulties' phase HP written to ${OUT}.`);
