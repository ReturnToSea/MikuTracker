// node scripts/gear-data.mjs: rebuilds the gear tab's item list (server/src/gameFigures/gear-items.json)
// from the MapleStory Wiki (the GMS wiki), by hand, after a GMS patch. Never part of the app or its
// tests: the app only reads the file this writes. Polite: one request at a time, with a pause, and
// pages fetched 50 at a time.
//
// What it lists (decided with the owner, 2026-10-23; DESIGN.md "Gear"):
//   - armor and weapons of the Root Abyss (with Fafnir weapons), AbsoLab, Arcane Umbra and Eternal
//     sets, per branch, Genesis and Destiny weapons included (they're on the Eternal pages)
//   - the Boss, Pitched, Dawn and Brilliant boss accessory sets, Reinforced and Superior Gollux
//   - single items picked by the owner (rings, hearts, medals, totems, emblem, Meister, Princess No)
//   - each job's four secondaries: the Lv. 100 one Neville sells (580,000 meso), the Frozen one,
//     the Princess No one, and the Astra one
//   - each job's branches and weapon types (the wiki's job pages), keyed by the job name Nexon's
//     rankings use
// The GMS check: an item is kept only if the wiki has the item's own page (its infobox, matched by
// id or name). Set pages also list Korean-only items, which have no page of their own (e.g. a
// "Sanguinary Spirit"), and set pages' ids can be wrong, so the id, picture, level and job always
// come from the item's own page. Whatever fails is left out and reported. (maplestory.io can't be
// the check: its newest real GMS data is v.211.) Icons are fetched separately (scripts/gear-icons.mjs).
import { writeFileSync } from "node:fs";
import path from "node:path";

const OUT = path.resolve(import.meta.dirname, "../server/src/gameFigures/gear-items.json");
const UA = { "User-Agent": "MikuTracker gear list (personal, by hand)" };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const BRANCHES = ["Warrior", "Magician", "Bowman", "Thief", "Pirate"];

async function wiki(params) {
  await pause(300);
  const url = `https://maplestorywiki.net/api.php?${new URLSearchParams({ ...params, format: "json", formatversion: "2" })}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

// Pages' wikitext by the title asked for (following redirects), 50 at a time; missing pages are null.
const pageCache = new Map();
async function pages(titles) {
  const want = [...new Set(titles)].filter((t) => !pageCache.has(t));
  for (let i = 0; i < want.length; i += 50) {
    const batch = want.slice(i, i + 50);
    const d = await wiki({ action: "query", prop: "revisions", rvprop: "content", rvslots: "main", redirects: "1", titles: batch.join("|") });
    const to = new Map(batch.map((t) => [t, t]));
    for (const n of d.query.normalized ?? []) for (const [k, v] of to) if (v === n.from) to.set(k, n.to);
    for (const r of d.query.redirects ?? []) for (const [k, v] of to) if (v === r.from) to.set(k, r.to);
    const text = new Map(d.query.pages.filter((p) => !p.missing).map((p) => [p.title, p.revisions?.[0]?.slots?.main?.content ?? ""]));
    for (const t of batch) pageCache.set(t, text.get(to.get(t)) ?? null);
  }
  return (t) => pageCache.get(t) ?? null;
}
const page = async (t) => (await pages([t]))(t);

const unlink = (s) => s.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1").replace(/'''/g, "").trim();

// A page's item infoboxes ({{Equipment<!--id--> … }}).
function infoboxes(text) {
  return text.split(/\{\{Equipment(?=\s*<!--|\s*\n)/).slice(1).map((chunk) => {
    const f = (k) => new RegExp(`\\|${k}=([^\\n]*)`).exec(chunk)?.[1]?.trim() ?? "";
    return {
      id: Number(/^\s*<!--\s*(\d{7})/.exec(chunk)?.[1]) || null,
      name: unlink(f("name")),
      file: /\[\[File:([^\]|]+)/.exec(f("image"))?.[1]?.trim() ?? null,
      level: Number(f("reqLevel")) || null,
      job: unlink(f("reqJob")) || null,
      type: unlink(f("equipmentType")) || null,
      // v2.0.0: the item's own stats, star limit and tags (its notes' {{Equipment Properties|…}})
      stats: Object.fromEntries(Object.entries(STAT_FIELDS).map(([key, field]) => [key, f(field)]).filter(([, v]) => v !== "")),
      starForce: f("starForceEnhancements"),
      tags: [...chunk.matchAll(/\{\{Equipment Properties\|([^|}]+)/g)].map((m) => m[1].trim()),
    };
  });
}

// The infobox fields of an item's own stats.
const STAT_FIELDS = { str: "incSTR", dex: "incDEX", int: "incINT", luk: "incLUK", hp: "incMaxHP", mp: "incMaxMP", att: "incWAttack", matt: "incMAttack", def: "incDefense", speed: "incSpeed", jump: "incJump", boss: "incBossDamage", ied: "incIgnoredDefense", damage: "incDamage" };
// "10", "1,000", "10%": whole numbers, and percentages as "<stat>Pct" (Oath of Death's "Max HP +5%").
function readStats(raw) {
  const out = {};
  for (const [key, text] of Object.entries(raw)) {
    const m = /^\+?(-?[\d,]+)(%?)$/.exec(text.replace(/\s/g, ""));
    if (!m) continue;
    const n = Number(m[1].replace(/,/g, ""));
    if (n) out[m[2] && !["boss", "ied", "damage"].includes(key) ? `${key}Pct` : key] = n;
  }
  return out;
}

// Star Force limits by item level (the wiki's Star Force Enhancement page), to check each item's own.
const levelStarLimit = (level) => (level <= 94 ? 5 : level <= 107 ? 8 : level <= 117 ? 10 : level <= 127 ? 15 : level <= 137 ? 20 : 30);
// Slots whose items can have flames (the wiki's Bonus Stats page: not secondaries, emblems, badges,
// medals except Immortal Legacy, rings, hearts, shoulders, totems).
const FLAME_SLOTS = new Set(["hat", "top", "bottom", "shoes", "gloves", "cape", "belt", "face", "eye", "earrings", "pendant", "pocket", "weapon"]);
// Slots whose items can have potential (the wiki's Potential page: not medals, badges, pocket items,
// totems or special skill rings), with Nexon Korea's potential category for each.
const POTENTIAL_PART = { weapon: "weapon", emblem: "emblem", hat: "hat", bottom: "bottom", shoes: "shoes", gloves: "gloves", cape: "cape", belt: "belt", shoulder: "shoulder", face: "face", eye: "eye", earrings: "earrings", ring: "ring", pendant: "pendant", heart: "heart" };
// Secondaries by type: shields and Demon Aegis / soul shields have their own potential lists.
const secondaryPart = (type) => (/Demon Aegis|Soul Shield|Soul Ring|Force Shield/i.test(type ?? "") ? "force shield" : /^Shield$/i.test(type ?? "") ? "shield" : "secondary");
// Exceptional Hammers (the wiki's Exceptional Hammer and Exceptional Enhancement pages): Pitched Boss
// pieces once, Brilliant Boss pieces three times; the bonus per hammer by item.
const HAMMERS = {
  Berserked: { count: 1, per: { allStat: 15, hp: 750, mp: 750, att: 10, matt: 10 } },
  "Magic Eyepatch": { count: 1, per: { allStat: 15, hp: 750, mp: 750, att: 10, matt: 10 } },
  "Commanding Force Earring": { count: 1, per: { allStat: 20, hp: 1000, mp: 1000, att: 15, matt: 15 } },
  "Dreamy Belt": { count: 1, per: { allStat: 20, hp: 1000, mp: 1000, att: 15, matt: 15 } },
  "Original Sin of Pride": { count: 3, per: { allStat: 15, hp: 750, mp: 750, att: 10, matt: 10 } },
  "Immortal Legacy": { count: 3, per: { allStat: 20, hp: 1000, mp: 1000, att: 15, matt: 15 } },
};
// Boss flames the wiki doesn't tag: Ayame's Treasure (owner, 2026-10-24), and the Fafnir and Arcane
// Umbra chakrams (every other weapon of those sets is tagged; taken as a wiki slip).
const BOSS_FLAMES_TOO = new Set(["Ayame's Treasure", "Fafnir Chakram", "Arcane Umbra Chakram"]);

// A set page's item rows: id, name ("Genesis Guards#Unsealed"), type, job. Rows have typos (an id
// "1254p26", a fan typed "Chain"), so only the name is relied on; the rest comes from the item's own page.
function setRows(text) {
  const re = /\|-\s*<!--\s*([^>]*?)\s*-->\s*\n\|\[\[File:[^\]|]+[^\n]*?'''\[\[([^\]|]+)(?:\|[^\]]*)?\]\]'''[^\n]*\n\|([^\n]*)\n\|([^\n]*)/g;
  return [...text.matchAll(re)].map((m) => ({ id: /^\d{7}$/.test(m[1]) ? Number(m[1]) : undefined, name: m[2].trim(), type: unlink(m[3]), job: unlink(/Job:\s*(.*)/.exec(m[4])?.[1] ?? "") || null }));
}

// Nexon's rankings job names (from Nexon's own site code, 2026-10-24), plus the jobs added since
// (Ren confirmed from a tracked character), and the wiki page for each where it's named differently.
// Not Beast Tamer: still in Nexon's list, but Beast Tamers were converted into Lynn.
const JOBS = ["Adele", "Angelic Buster", "Aran", "Arch Mage Fire/Poison", "Arch Mage Ice/Lightning", "Ark", "Battle Mage", "Bishop", "Blaster", "Blaze Wizard", "Bow Master", "Buccaneer", "Cadena", "Cannoneer", "Corsair", "Dark Knight", "Dawn Warrior", "Demon Avenger", "Demon Slayer", "Dual Blade", "Evan", "Hayato", "Hero", "Hoyoung", "Illium", "Kain", "Kaiser", "Kanna", "Khali", "Kinesis", "Lara", "Luminous", "Marksman", "Mechanic", "Mercedes", "Mihile", "Night Lord", "Night Walker", "Paladin", "Pathfinder", "Phantom", "Shade", "Shadower", "Thunder Breaker", "Wild Hunter", "Wind Archer", "Xenon", "Zero", "Ren", "Lynn", "Mo Xuan", "Sia Astelle", "Erel Light"];
const WIKI_JOB = { "Arch Mage Fire/Poison": "Arch Mage (Fire, Poison)", "Arch Mage Ice/Lightning": "Arch Mage (Ice, Lightning)", "Bow Master": "Bowmaster" };
const FROM_WIKI = { ...Object.fromEntries(Object.entries(WIKI_JOB).map(([n, w]) => [w, n])), Bowmaster: "Bow Master" };
const GROUPS = { "Cygnus Knights": ["Dawn Warrior", "Blaze Wizard", "Wind Archer", "Night Walker", "Thunder Breaker"] };
const jobs = {};

// A wiki job text as Nexon jobs and branches: "Thief", "Ren", "Cygnus Knights",
// "Dawn Warrior, Blaze Wizard, and Night Walker", "Any Pirate (other than Angelic Buster, Ark, or Mo Xuan)".
function jobsOf(text) {
  if (!text) return null;
  const any = /^Any (\w+) \(other than (.*)\)$/.exec(text);
  if (any) {
    const not = jobsOf(any[2]) ?? [];
    return JOBS.filter((j) => jobs[j]?.branches.includes(any[1]) && !not.includes(j));
  }
  const whole = FROM_WIKI[text] ?? text;
  if (GROUPS[whole]) return GROUPS[whole];
  if (JOBS.includes(whole) || BRANCHES.includes(whole)) return [whole];
  const out = new Set();
  // Split on commas and "and"/"or", but not inside "Arch Mage (Fire, Poison)".
  const parts = text.replace(/\(([^)]*)\)/g, (m) => m.replace(/,/g, "§")).split(/,\s*(?:and\s+|or\s+)?|\s+and\s+|\s+or\s+/);
  if (parts.length < 2) return null;
  for (const p of parts) for (const j of jobsOf(p.replace(/§/g, ",").trim()) ?? []) out.add(j);
  return out.size ? [...out] : null;
}

// Wiki equipment types → the window's slots; weapons are any other type. Zero's Heavy Sword goes in
// the secondary slot.
const SLOT = { Hat: "hat", Top: "top", Overall: "top", Bottom: "bottom", Shoes: "shoes", Gloves: "gloves", Cape: "cape", Shoulder: "shoulder", "Shoulder Accessory": "shoulder", "Face Accessory": "face", "Eye Accessory": "eye", Earrings: "earrings", Pendant: "pendant", Ring: "ring", Belt: "belt", "Pocket Item": "pocket", Badge: "badge", Medal: "medal", Emblem: "emblem", "Android Heart": "heart", "Mechanical Heart": "heart", Totem: "totem", "Heavy Sword": "secondary" };
const WEAPON_TYPE = { "One-handed Mace": "One-handed Blunt Weapon" }; // a wiki typo
const slotOf = (type) => SLOT[type] ?? "weapon";

const report = [];
const wanted = []; // { page, name, id?, show?, slot?, set, group, jobs?, more?, secondaryKind?, maybe?, oz? }

console.log("Jobs…");
const jobPage = await pages(JOBS.map((j) => WIKI_JOB[j] ?? j));
for (const j of JOBS) {
  const t = jobPage(WIKI_JOB[j] ?? j);
  if (!t) {
    report.push(`job page missing: ${j}`);
    continue;
  }
  const field = (k) => unlink(new RegExp(`\\|\\s*${k}\\s*=\\s*([^\\n]*)`).exec(t)?.[1] ?? "");
  const weapons = field("primaryWeapon").replace(/<br\s*\/?>/g, ",").replace(/Alpha:|Beta:/g, ",").split(/,\s*|\s+or\s+|\s*\/\s*/).map((w) => w.replace(/^or\s+/, "").trim()).filter(Boolean);
  jobs[j] = { branches: BRANCHES.filter((b) => field("class").includes(b)), weapons: weapons.map((w) => WEAPON_TYPE[w] ?? w).filter((w) => slotOf(w) === "weapon") };
}

console.log("Sets…");
const SETS = [
  ...["Root Abyss", "AbsoLab", "Arcane Umbra", "Eternal"].flatMap((s) => BRANCHES.map((b) => [`${s} Set (${b})`, s])),
  ["Boss Accessory Set", "Boss Accessory"], ["Pitched Boss Set", "Pitched Boss"], ["Dawn Boss Set", "Dawn Boss"], ["Brilliant Boss Set", "Brilliant Boss"],
  ["Reinforced Gollux Set", "Gollux"], ["Superior Gollux Set", "Gollux"],
];
const setPage = await pages(SETS.map(([t]) => t));
for (const [title, set] of SETS) {
  const t = setPage(title);
  if (!t) {
    report.push(`set page missing: ${title}`);
    continue;
  }
  for (const r of setRows(t)) {
    const [base, variant = ""] = r.name.split("#");
    const genesis = base.startsWith("Genesis ");
    const destiny = base.startsWith("Destiny ");
    if (genesis && /Sealed/i.test(variant) && !/Unsealed/i.test(variant)) continue; // only the unsealed one
    const type = WEAPON_TYPE[r.type] ?? r.type;
    const slot = slotOf(type);
    const stage = destiny ? /Stage (\d)/.exec(variant)?.[1] : null;
    wanted.push({
      page: base,
      name: base,
      id: r.id,
      show: destiny && stage ? `${base} (Stage ${stage})` : base,
      slot,
      // Genesis and Destiny weapons (on the Eternal pages) are lucky items: they count for every armor
      // set with 3+ pieces (the page does that), not as Eternal pieces as well. Weapons only: the
      // Genesis Badge is a Pitched Boss piece.
      set,
      group: set,
      luckyName: genesis || destiny,
      jobs: type === "Long Sword" || type === "Heavy Sword" ? ["Zero"] : jobsOf(r.job),
    });
  }
}

const singles = [
  ["Meister Earring", "Meister"], ["Meister Ring", "Meister"], ["Meister Shoulder", "Meister"],
  ["Ayame's Treasure", "Princess No", undefined, 1132275], ["Kanna's Treasure", "Princess No", undefined, 1113155],
  ["Treasure Hunter John's Ring", "Other rings"],
  ["Heroic Tenebris Expedition Ring (Complete)", "Event rings", "Tenebris Expedition Ring"], ["Heroic Awake Ring (Lv. 4)", "Event rings", "Awake Ring"], ["Glory Guard Ring: Justicar", "Event rings", "Glory Guard Ring"],
  ["Gold Maple Leaf Emblem", "Emblems"],
  ["Total Control", "Hearts"], ["Black Heart", "Hearts"], ["Plasma Heart", "Hearts"], ["Fairy Heart", "Hearts"], ["Titanium Heart", "Hearts"], ["Liquid-Metal Heart", "Hearts"], ["Outlaw Heart", "Hearts"],
  ["Seven Day Monster Parker", "Medals"],
  ["Guild Castle Blue Brooch", "Guild totems"], ["Guild Castle Red Brooch", "Guild totems"], ["Guild Castle Green Brooch", "Guild totems"],
];
for (const [name, group, onPage, id] of singles) wanted.push({ page: onPage ?? name, name, id, set: group === "Meister" ? "Meister" : null, group, jobs: null });

console.log("Secondaries…");
const frozen = (await page("Frozen Secondary Weapon Box")) ?? "";
for (const m of frozen.matchAll(/^\*\[\[File:[^\]]+\]\]\s*\[\[([^\]|]+)\]\]\s*\((.*) only\)\s*$/gm)) {
  wanted.push({ page: m[1], name: m[1], slot: "secondary", set: null, group: "Secondary weapons", jobs: jobsOf(unlink(m[2])), secondaryKind: "Frozen" });
}
const astra = (await page("Astra Secondary Weapon")) ?? "";
// A link's section names the job's version where one page has several ("Astra Force Shield#Demon Avenger").
const linked = (target) => {
  const [pageName, section] = target.split("#");
  return { page: pageName.trim(), name: pageName.trim(), forJob: section ? (FROM_WIKI[section.trim()] ?? section.trim()) : undefined };
};
for (const m of astra.matchAll(/^\*\s*((?:\[\[[^\]]+\]\][,\s]*(?:and\s+|or\s+)?)+):\s*(?:\[\[File:[^\]]*\]\]\s*)?\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/gm)) {
  wanted.push({ ...linked(m[2]), slot: "secondary", set: null, group: "Secondary weapons", jobs: jobsOf(unlink(m[1])), secondaryKind: "Astra" });
}
const nev = (await page("Neville")) ?? "";
for (const m of nev.matchAll(/\[\[File:[^\]]+\]\]\s*\[\[([^\]|]+)(?:\|([^\]]*))?\]\]\s*\(580,000 Mesos\)/g)) {
  wanted.push({ ...linked(m[1]), slot: "secondary", set: null, group: "Secondary weapons", secondaryKind: "Shop" });
}
const princess = (await wiki({ action: "query", list: "allpages", apprefix: "Princess No's", aplimit: "200" })).query.allpages.map((p) => p.title);
for (const t of princess) wanted.push({ page: t, name: t, slot: "secondary", set: null, group: "Secondary weapons", secondaryKind: "Princess No", maybe: true });

// Oz (special skill) rings: one entry per level the owner uses; active rings open the passive slot at Lv. 4+.
const OZ = [["Ring of Restraint", "active", [3, 4, 5, 6]], ["Continuous Ring", "active", [3, 4, 5, 6]], ["Weapon Jump S Ring", "passive", [3, 4]], ["Weapon Jump D Ring", "passive", [3, 4]], ["Weapon Jump I Ring", "passive", [3, 4]], ["Weapon Jump L Ring", "passive", [3, 4]]];
for (const [name, kind, levels] of OZ) wanted.push({ page: name, name, slot: "ring", set: null, group: "Oz rings", jobs: null, oz: { kind, levels } });

console.log(`Reading ${new Set(wanted.map((w) => w.page)).size} item pages…`);
let itemPage = await pages(wanted.map((w) => w.page));
// Where the name is also a skill's page ("Frozen Orb"), the item is on "<name> (Equipment)".
const alt = wanted.filter((w) => itemPage(w.page) !== null && infoboxes(itemPage(w.page)).length === 0);
const altPage = await pages(alt.flatMap((w) => [`${w.page} (Equipment)`, `${w.page} (Equip)`]));
for (const w of alt) w.page = [`${w.page} (Equipment)`, `${w.page} (Equip)`].find((t) => altPage(t) && infoboxes(altPage(t)).length) ?? w.page;
itemPage = await pages(wanted.map((w) => w.page));

// The secondary weapon types: those of the Frozen box's and the Astra items (all secondaries).
const secondaryTypes = new Set(["Heavy Sword"]);
for (const w of wanted.filter((w) => w.secondaryKind === "Frozen" || w.secondaryKind === "Astra")) {
  for (const b of infoboxes(itemPage(w.page) ?? "")) if (b.type) secondaryTypes.add(b.type);
}

// An item's id when two of the wiki's pages give the same one (copy-paste slips: Liquid-Metal Heart's
// page has Fairy Heart's id): the set page's, if no other item has it, or else the id the old GMS
// data on maplestory.io (v.211) has for that exact name.
async function freeId(w, box, used) {
  if (w.id && !used.has(w.id)) return w.id;
  await pause(300);
  const found = await (await fetch(`https://maplestory.io/api/GMS/211.1.0/item?${new URLSearchParams({ searchFor: box.name, count: "20" })}`, { headers: UA }).catch(() => null))?.json().catch(() => null);
  const id = (Array.isArray(found) ? found : []).find((x) => x.name === box.name && !used.has(x.id))?.id;
  return id ?? null;
}

const items = [];
for (const w of wanted) {
  const text = itemPage(w.page);
  if (!text) {
    if (!w.maybe) report.push(`left out (no page of its own on the GMS wiki): ${w.name}`);
    continue;
  }
  const boxes = infoboxes(text);
  // Several entries of one name: different jobs' versions (each is listed, or only the one the
  // link names); an Astra secondary's stages (the final one, as for the event rings); or an item's
  // untradable and tradable versions (the first, the original).
  const byJob = new Map();
  for (const b of boxes.filter((b) => b.name === w.name)) byJob.set(b.job ?? "", [...(byJob.get(b.job ?? "") ?? []), b]);
  const named = [...byJob.values()].map((g) => (w.secondaryKind === "Astra" ? g.at(-1) : g[0])).filter((b) => !w.forJob || b.job === w.forJob);
  const exact = boxes.find((b) => w.id && b.id === w.id);
  const picks = exact ? [exact] : named.length ? named : boxes.length === 1 && !w.maybe ? boxes : [];
  if (!picks.length || picks.some((b) => !b.id)) {
    if (!w.maybe) report.push(`left out (no matching item on its page): ${w.name}`);
    continue;
  }
  for (const box of picks) {
    if (w.maybe && !secondaryTypes.has(box.type)) continue; // a Princess No's page that isn't a secondary
    if (w.secondaryKind === "Shop" && !secondaryTypes.has(box.type)) {
      report.push(`left out (not a secondary): ${w.name} (${box.type})`);
      continue;
    }
    if (w.id && box.id !== w.id) report.push(`id corrected from its own page: ${w.name} ${w.id} → ${box.id}`);
    const slot = w.slot === "secondary" || w.slot === "ring" ? w.slot : slotOf(WEAPON_TYPE[box.type] ?? box.type ?? "");
    const show = w.show ?? box.name ?? w.name;
    const jobsFor = w.jobs === undefined || picks.length > 1 ? jobsOf(box.job) : w.jobs;
    // One entry per item: Xenon's weapons are on both the Thief and the Pirate pages.
    if (items.some((i) => i.name === show && i.slot === slot && JSON.stringify(i.jobs) === JSON.stringify(jobsFor))) continue;
    let id = box.id;
    const clash = items.find((i) => i.id === id);
    if (clash) {
      id = await freeId(w, box, new Set(items.map((i) => i.id)));
      report.push(id ? `id clash with ${clash.name}: ${show} ${box.id} → ${id}` : `left out (id clash with ${clash.name}, no other id found): ${show}`);
      if (!id) continue;
    }
    const type = WEAPON_TYPE[box.type] ?? box.type;
    const lucky = w.luckyName && slot === "weapon";
    // v2.0.0 details: stars, flames, potential and hammers this item can take.
    const genesisOrDestiny = /^(Genesis|Destiny) /.test(show) && (slot === "weapon" || type === "Heavy Sword");
    const ownStars = /^Genesis /.test(show) && genesisOrDestiny ? 22 : box.starForce === "" ? 0 : Number(box.starForce) || 0;
    if (/^(Genesis|Destiny) /.test(show) && slot !== "badge" && ownStars === 0) report.push(`a Genesis or Destiny item without stars (check its type): ${show} (${box.type})`);
    const oz = Boolean(w.oz);
    if (ownStars && box.level && ownStars !== levelStarLimit(box.level) && !/^(Genesis|Destiny|Astra) /.test(show)) report.push(`star limit differs from the level rule: ${show} (Lv. ${box.level}) ${ownStars}★, the rule says ${levelStarLimit(box.level)}★`);
    const canFlame = FLAME_SLOTS.has(slot) || box.name === "Immortal Legacy";
    const potential = oz || box.tags.includes("NoPotential") ? null : slot === "top" ? (type === "Overall" ? "overall" : "top") : slot === "secondary" ? secondaryPart(box.type) : (POTENTIAL_PART[slot] ?? null);
    const details = {
      stats: readStats(box.stats),
      starMax: ownStars,
      // Genesis and Destiny weapons (Zero's Lapis too, a secondary) come with 22★ and can't go below it;
      // Genesis can't be enhanced at all (its limit is 22; the wiki gives Genesis Lapis none); Destiny's
      // second stage goes to 25.
      starMin: genesisOrDestiny ? 22 : undefined,
      flames: canFlame ? (box.tags.includes("BossReward") || BOSS_FLAMES_TOO.has(box.name) ? "boss" : "normal") : undefined,
      potential: potential ?? undefined,
      hammers: HAMMERS[box.name],
      // "exclusive equipment": only one of it can be worn (Guardian Angel Ring, Dawn Guardian Angel Ring)
      exclusive: box.tags.includes("ExclusiveEquipment") || undefined,
    };
    const base = { id, name: show, slot, jobs: jobsFor, level: box.level, set: lucky ? null : w.set, group: lucky ? "Lucky weapons" : w.group, file: box.file, weaponType: slot === "weapon" ? type : undefined, overall: type === "Overall" || undefined, lucky: lucky || undefined, type: box.type ?? undefined, ...details };
    if (w.oz) {
      for (const level of w.oz.levels) items.push({ ...base, key: `${id}-${level}`, name: `${show} Lv. ${level}`, oz: { kind: w.oz.kind, level } });
    } else {
      items.push(Object.fromEntries(Object.entries(base).filter(([, v]) => v !== undefined)));
    }
  }
}

writeFileSync(OUT, `${JSON.stringify({ generated: new Date().toISOString().slice(0, 10), sources: "MapleStory Wiki (the GMS wiki): set, item and job pages; an item is kept only if it has its own page there", jobs, items }, null, 1)}\n`);
const bySlot = {};
for (const i of items) bySlot[i.slot] = (bySlot[i.slot] ?? 0) + 1;
console.log(`${items.length} items written to ${OUT}`, bySlot);
for (const j of JOBS) {
  const fitsJob = (i) => !i.jobs || i.jobs.includes(j) || jobs[j]?.branches.some((b) => i.jobs.includes(b));
  const sec = items.filter((i) => i.slot === "secondary" && fitsJob(i)).length;
  const wep = items.filter((i) => i.slot === "weapon" && fitsJob(i) && jobs[j]?.weapons.includes(i.weaponType)).length;
  if (sec !== 4 || wep < 6) report.push(`${j}: ${sec} secondaries, ${wep} weapons`);
}
console.log(report.length ? `Report:\n- ${report.join("\n- ")}` : "Nothing to report.");
