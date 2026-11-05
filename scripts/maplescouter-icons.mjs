// node scripts/maplescouter-icons.mjs <capture.har> [more.har…]: copies MapleScouter's own pictures out of the
// owner's captures of its pages into the data folder (decided with the owner, 2026-11-04: the Stats page and
// the boss clears use MapleScouter's pictures), by hand. Never part of the app or its tests; never in git
// (MapleScouter's and Nexon's art). We never send MapleScouter anything: a capture is what the owner's own
// browser loaded (the Network tab, "Save all as HAR"; the boss pictures load as its result page scrolls).
//   - the buffs', guild skills', links' and Oz rings' into item-icons/stats/, by the Stats page's ids,
//     replacing the wiki's (run it after scripts/stats-icons.mjs);
//   - the bosses' into item-icons/bosses/<difficulty>_<id>.png, as MapleScouter names them.
// A picture no capture has stays as it was (the wiki's, or a letter); the script lists them.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const DATA = process.env.MIKU_DATA_DIR ?? path.join(os.homedir(), "Library", "Application Support", "MikuTracker");
const ICONS = path.join(DATA, "item-icons");
const files = process.argv.slice(2);
if (files.length === 0) {
  console.log("Usage: node scripts/maplescouter-icons.mjs <capture.har> [more.har…]");
  process.exit(1);
}
// MapleScouter's picture → the Stats page's id (several ids can share one: the stat potion's).
const STATS = {
  "doping_v2/sayram": ["sayramElixir"], "doping_v2/collector": ["collectorElixir"], "doping_v2/buff300": ["honorableElixir"], "doping_v2/hero": ["heroEcho"],
  "doping_v2/union": ["legionMight"], "doping_v2/urus": ["masarayuGift"], "doping_v2/extreme": ["extremePotion"], "doping_v2/superpower": ["mvpSuperpower"],
  "doping_v2/moonshine": ["brightMoonlight"], "doping_v2/vipbuff": ["vipBuff"], "doping_v2/candy": ["candiedApple"], "doping_v2/house": ["caretakerSupport"],
  "doping_v2/shiningred": ["sparklingRedStar"], "doping_v2/bighero": ["greatHeroBoost"], "doping_v2/legendhero": ["legendaryHero"], "doping_v2/jangbi": ["advWeaponTempering"],
  "doping_v2/shiningblue": ["sparklingBlueStar"], "doping_v2/fish": ["fishBuff"], "doping_v2/whiteBear": ["arcticFriends"], "doping_v2/dragonsmeal": ["babyDragonFood"],
  "doping_v2/apple": ["onyxApple"], "doping_v2/tengu": ["tengusJudgement"], "doping_v2/champion": ["renown"],
  "doping_v2/statpotion": ["statPotionSTR", "statPotionDEX", "statPotionINT", "statPotionLUK", "statPotionHP"],
  "doping_v2/noblessboss": ["bossSlayers"], "doping_v2/noblessignore": ["undeterred"], "doping_v2/noblessdam": ["forTheGuild"], "doping_v2/noblesscridam": ["hardHitter"],
  "linkskill/kadena": ["kadena"], "linkskill/illium": ["illium"], "linkskill/ark": ["ark"], "linkskill/kain": ["kain"], "linkskill/magician": ["magician"],
  "linkskill/thief": ["thief"], "linkskill/angel": ["angel"], "linkskill/kanna": ["kanna"], "linkskill/mukhyun": ["mukhyun"], "linkskill/hoyoung": ["hoyoung"],
  "seedring/restraint": ["ringRestraint"], "seedring/continuos": ["ringContinuous"], "seedring/weapon": ["ringWeapon"],
};
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const found = new Map();
for (const file of files) {
  for (const e of JSON.parse(readFileSync(file, "utf8")).log.entries) {
    const m = e.request.url.match(/^https:\/\/maplescouter\.com\/((?:doping_v2|linkskill|seedring|bossIcon)\/[\w-]+)\.png/);
    const c = e.response?.content;
    if (!m || !c?.text) continue;
    const body = c.encoding === "base64" ? Buffer.from(c.text, "base64") : Buffer.from(c.text, "latin1");
    if (body.subarray(0, 4).equals(PNG)) found.set(m[1], body);
  }
}
mkdirSync(path.join(ICONS, "stats"), { recursive: true });
mkdirSync(path.join(ICONS, "bosses"), { recursive: true });
let written = 0;
for (const [pic, ids] of Object.entries(STATS)) {
  if (!found.has(pic)) continue;
  for (const id of ids) writeFileSync(path.join(ICONS, "stats", `${id}.png`), found.get(pic));
  written += ids.length;
}
const bosses = [...found.keys()].filter((k) => k.startsWith("bossIcon/"));
for (const k of bosses) writeFileSync(path.join(ICONS, "bosses", `${k.slice("bossIcon/".length)}.png`), found.get(k));
const missing = Object.keys(STATS).filter((k) => !found.has(k));
console.log(`${written} Stats pictures and ${bosses.length} boss pictures written to ${ICONS}.`);
if (missing.length) console.log(`Not in the captures (left as they were): ${missing.join(", ")}`);
