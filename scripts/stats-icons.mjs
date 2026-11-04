// node scripts/stats-icons.mjs: downloads the Stats page's pictures (Nexon's art) into the data folder's
// item-icons/stats/, by hand: each buff's, guild skill's and link skill's icon, from the MapleStory Wiki's
// files (named after the item or skill: "Use Sayram's Elixir.png", "Skill Boss Slayers.png"; a few names
// tried each). Never in git, and the app itself never contacts the wiki: it only serves what's in the
// folder. Pictures already there are skipped. MIKU_DATA_DIR picks another data folder. (Read 2026-11-03: the
// wiki has no picture for the Sparkling Red and Blue Star Potions, Power of the Adversary, The Enlightened
// One, Tree Ornament, Witch's Special Stew or Peerless Marble: the page shows their first letter.)
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const UA = { "User-Agent": "MikuTracker Stats icons (personal, by hand)" };
const data = process.env.MIKU_DATA_DIR || path.join(os.homedir(), "Library", "Application Support", "MikuTracker");
const dir = path.join(data, "item-icons", "stats");
mkdirSync(dir, { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Each picture's name in the folder (the app's id) and the wiki file names to try, in order.
const use = (...names) => names.map((n) => `File:Use ${n}.png`);
const skill = (...names) => names.map((n) => `File:Skill ${n}.png`);
const WANTED = {
  candiedApple: use("Candied Apple"),
  sayramElixir: use("Sayram's Elixir"),
  collectorElixir: use("Collector's Elixir"),
  honorableElixir: use("Honorable Elixir"),
  extremePotion: use("Extreme Red Potion", "Extreme Potion"),
  sparklingRedStar: use("Sparkling Red Star Potion"),
  brightMoonlight: use("Bright Moonlight Potion"),
  heroEcho: skill("Hero's Echo", "Echo of Hero"),
  legionMight: use("Legion's Might"),
  masarayuGift: [...use("Masarayu's Gift Atmospheric Effect", "Masarayu's Gift"), "File:Cash Masarayu's Gift Atmospheric Effect.png"],
  caretakerSupport: skill("Caretaker's Support"),
  vipBuff: use("VIP Buff (Stats)", "VIP Buff"),
  mvpSuperpower: use("MVP Superpower Buff"),
  genepass: skill("Power of the Adversary"),
  enlightenedOne: ["File:Setup The Enlightened One.png", "File:The Enlightened One.png"],
  sparklingBlueStar: use("Sparkling Blue Star Potion"),
  greatHeroBoost: use("Advanced Great Hero Boost Potion"),
  legendaryHero: use("Legendary Hero Potion"),
  advWeaponTempering: skill("Advanced Weapon Tempering"),
  tengusJudgement: use("Tengu's Judgement", "Tengu's Judgment"),
  attackPotionV: use("Advanced Attack Potion V"),
  magicPotionV: use("Advanced Magic Potion V"),
  onyxApple: use("Onyx Apple"),
  energizerDrink: use("The Energizer Drink", "Energizer Drink"),
  fishBuff: use("Tree Ornament"),
  witchStew: use("Witch's Special Stew"),
  ssiwsCheese: use("Ssiws Cheese"),
  believeInYourself: use("Believe in Yourself"),
  gourmandPower: use("Gourmand Power"),
  peerlessMarble: use("Peerless Marble"),
  statPotionSTR: use("Advanced Strength Potion X"),
  statPotionDEX: use("Advanced Dexterity Potion X"),
  statPotionINT: use("Advanced Intelligence Potion X"),
  statPotionLUK: use("Advanced Luck Potion X"),
  bossSlayers: skill("Boss Slayers"),
  forTheGuild: skill("For the Guild!", "For the Guild"),
  hardHitter: skill("Hard Hitter"),
  undeterred: skill("Undeterred"),
  renown: skill("Champion's Renown", "Champion Insignia - All Stats", "Champion Insignia: All Stats"),
  thief: skill("Thief's Cunning"),
  magician: skill("Empirical Knowledge"),
  kadena: skill("Unfair Advantage"),
  illium: skill("Tide of Battle"),
  ark: skill("Solus"),
  kain: skill("Time to Prepare"),
  angel: skill("Terms and Conditions"),
  kanna: skill("Elementalism"),
  mukhyun: skill("Qi Cultivation"),
  hoyoung: skill("Bravado"),
};

// Every candidate's address, 40 a request.
const titles = [...new Set(Object.values(WANTED).flat())];
const urls = new Map();
for (let i = 0; i < titles.length; i += 40) {
  await pause(400);
  const q = new URLSearchParams({ action: "query", titles: titles.slice(i, i + 40).join("|"), prop: "imageinfo", iiprop: "url", format: "json", formatversion: "2" });
  const res = await fetch(`https://maplestorywiki.net/api.php?${q}`, { headers: UA });
  if (!res.ok) {
    console.log(`The wiki didn't answer (${res.status}). Nothing downloaded.`);
    process.exit(1);
  }
  const body = await res.json();
  const from = new Map((body.query.normalized ?? []).map((n) => [n.to, n.from]));
  for (const p of body.query.pages) if (p.imageinfo) urls.set(from.get(p.title) ?? p.title, p.imageinfo[0].url);
}
let got = 0;
const missing = [];
for (const [id, names] of Object.entries(WANTED)) {
  const file = path.join(dir, `${id}.png`);
  if (existsSync(file)) continue;
  const url = names.map((n) => urls.get(n)).find(Boolean);
  await pause(150);
  const res = url ? await fetch(url, { headers: UA }).catch(() => null) : null;
  const bytes = res?.ok ? Buffer.from(await res.arrayBuffer()) : null;
  // Only real PNG pictures (they start with the PNG signature).
  if (!bytes || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    missing.push(`${id} (tried ${names.join(", ")})`);
    continue;
  }
  writeFileSync(file, bytes);
  got += 1;
}
console.log(`${got} pictures downloaded into ${dir}; ${Object.keys(WANTED).length - missing.length} of ${Object.keys(WANTED).length} present.`);
if (missing.length) console.log(`Not found:\n- ${missing.join("\n- ")}`);
