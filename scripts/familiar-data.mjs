// node scripts/familiar-data.mjs: rebuilds the familiar badges list (server/src/gameFigures/familiar-badges.json)
// and downloads the badges' pictures into the data folder's item-icons/familiars/, by hand, after a GMS
// patch. Never part of the app or its tests: the app only reads the file and serves the pictures. Polite:
// one request at a time, with a pause. Pictures already there are skipped; MIKU_DATA_DIR picks another
// data folder.
//
// What it takes (decided with the owner, 2026-11-01; research in tempdata/familiars/RESEARCH.md): the
// MapleStory Wiki's "Familiars/Badges" page, each badge's name and effects ({{FamiliarBadge|name=…|effect=
// a;b}}), and its picture (File:FamiliarBadge_<name>.png). Each effect that's a damage stat is also read
// into the stats the Familiars page adds up (the rest, Max HP, DEF, Jump, skill levels…, are shown only).
// Whatever doesn't parse is reported, and the file isn't written.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const OUT = path.resolve(import.meta.dirname, "../server/src/gameFigures/familiar-badges.json");
const PAGE = "Familiars/Badges";
const UA = { "User-Agent": "MikuTracker familiar badges (personal, by hand)" };
const data = process.env.MIKU_DATA_DIR || path.join(os.homedir(), "Library", "Application Support", "MikuTracker");
const dir = path.join(data, "item-icons", "familiars");
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function wiki(params) {
  await pause(400);
  const res = await fetch(`https://maplestorywiki.net/api.php?${new URLSearchParams({ ...params, format: "json", formatversion: "2" })}`, { headers: UA });
  const body = res.ok ? await res.json() : null;
  if (!body || body.error) {
    console.log(`The wiki didn't answer (${res.status} ${body?.error?.info ?? ""}). Nothing written.`);
    process.exit(1);
  }
  return body;
}

// An effect's damage stat (the Familiars page's keys, shared FAMILIAR_STATS), or null: shown only.
const STATS = [
  [/^Attack Power: ?\+(\d+)%$/, "attPct"],
  [/^Attack Power: ?\+(\d+)$/, "att"],
  [/^Magic Attack: ?\+(\d+)%$/, "mattPct"],
  [/^Magic Attack: ?\+(\d+)$/, "matt"],
  [/^Damage: ?\+(\d+)%$/, "dmg"],
  [/^Critical Rate: ?\+(\d+)%$/, "critRate"],
  [/^Critical Damage: ?\+(\d+)%$/, "critDmg"],
  [/^Ignored Enemy Defense: ?\+(\d+)%$/, "ied"],
  [/^Boss Damage: ?\+(\d+)%$/, "bossDmg"],
  [/^All Stats: ?\+(\d+)%$/, "allStatPct"],
  [/^All Stats: ?\+(\d+)$/, "allStat"],
  [/^STR: ?\+(\d+)%$/, "strPct"],
  [/^DEX: ?\+(\d+)%$/, "dexPct"],
  [/^INT: ?\+(\d+)%$/, "intPct"],
  [/^LUK: ?\+(\d+)%$/, "lukPct"],
  [/^STR: ?\+(\d+)$/, "str"],
  [/^DEX: ?\+(\d+)$/, "dex"],
  [/^INT: ?\+(\d+)$/, "int"],
  [/^LUK: ?\+(\d+)$/, "luk"],
];
// Effects known not to be damage stats (anything else unread is a problem: a new wording).
const SHOWN_ONLY = /^(Max HP|Max MP|Defense|Jump|Speed|All Skill Levels|\d+% chance to recover)/;

const text = (await wiki({ action: "parse", page: PAGE, prop: "wikitext" })).parse.wikitext;
const problems = [];
const badges = [];
for (const block of text.split("{{FamiliarBadge\n").slice(1)) {
  const name = block.match(/^\|name=(.*)$/m)?.[1]?.trim();
  const effect = block.match(/^\|effect=(.*)$/m)?.[1]?.trim();
  if (!name || !effect) {
    problems.push(`a badge without a name or effect: ${block.slice(0, 80)}`);
    continue;
  }
  const effects = effect.split(";").map((e) => e.trim()).filter(Boolean);
  const stats = {};
  for (const e of effects) {
    const hit = STATS.map(([rx, key]) => [e.match(rx), key]).find(([m]) => m);
    if (hit) stats[hit[1]] = (stats[hit[1]] ?? 0) + Number(hit[0][1]);
    else if (!SHOWN_ONLY.test(e)) problems.push(`${name}: "${e}" isn't read`);
  }
  // (the id: the name without "Badge", lower case, for the saved input and the picture's file name)
  const id = name.replace(/ Badge$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  badges.push({ id, name, effects, stats });
}
if (new Set(badges.map((b) => b.id)).size !== badges.length) problems.push("two badges with the same id");
// (the saved input takes ids of 40 characters at most: shared familiarInput)
for (const b of badges) if (b.id.length > 40) problems.push(`${b.name}: its id "${b.id}" is over 40 characters`);
if (badges.length < 40) problems.push(`only ${badges.length} badges found`);
if (problems.length) {
  console.log(`Not written:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
const generated = new Date().toISOString().slice(0, 10);
writeFileSync(OUT, `${JSON.stringify({ generated, source: `https://maplestorywiki.net/w/${PAGE}`, badges }, null, 1)}\n`);
console.log(`${badges.length} badges written to ${OUT}.`);

// The pictures, 40 names a request.
mkdirSync(dir, { recursive: true });
const urls = new Map();
for (let i = 0; i < badges.length; i += 40) {
  const part = badges.slice(i, i + 40);
  const titles = part.map((b) => `File:FamiliarBadge_${b.name}.png`);
  const body = await wiki({ action: "query", titles: titles.join("|"), prop: "imageinfo", iiprop: "url" });
  const from = new Map((body.query.normalized ?? []).map((n) => [n.to, n.from]));
  for (const p of body.query.pages) if (p.imageinfo) urls.set(from.get(p.title) ?? p.title, p.imageinfo[0].url);
}
let got = 0;
const missing = [];
for (const b of badges) {
  const file = path.join(dir, `${b.id}.png`);
  if (existsSync(file)) continue;
  const url = urls.get(`File:FamiliarBadge_${b.name}.png`);
  await pause(150);
  const res = url ? await fetch(url, { headers: UA }).catch(() => null) : null;
  const bytes = res?.ok ? Buffer.from(await res.arrayBuffer()) : null;
  // Only real PNG pictures (they start with the PNG signature).
  if (!bytes || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    missing.push(`${b.name} ${url ?? "(no picture on the wiki)"}`);
    continue;
  }
  writeFileSync(file, bytes);
  got += 1;
}
console.log(`${got} pictures downloaded into ${dir}.`);
if (missing.length) console.log(`Not found:\n- ${missing.join("\n- ")}`);
