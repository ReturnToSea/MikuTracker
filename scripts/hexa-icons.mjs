// node scripts/hexa-icons.mjs: downloads the HEXA page's pictures (Nexon's art) into the data folder's
// item-icons/hexa/, by hand. The HEXA skills' icons come from hexa-matrix-tracker.pages.dev's own copies
// of MapleScouter's (every job's, named as MapleScouter names them, e.g. Len_1.png; MapleScouter itself
// blocks scripts), Sol Erda's and the fragments' from the same site, HEXA Stat's from Nexon. Never in
// git, and the app itself never contacts either: it only serves what's in the folder. Pictures already
// there are skipped. MIKU_DATA_DIR picks another data folder.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const UA = { "User-Agent": "MikuTracker HEXA icons (personal, by hand)" };
const SITE = "https://hexa-matrix-tracker.pages.dev";
const data = process.env.MIKU_DATA_DIR || path.join(os.homedir(), "Library", "Application Support", "MikuTracker");
const dir = path.join(data, "item-icons", "hexa");
mkdirSync(dir, { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// The site's list of its copies: "Len_1.png": "Len_1-016ef6c2da7b.png" (General/General_2.png for the common nodes).
const list = await (await fetch(`${SITE}/skill-icons.js`, { headers: UA })).text();
const wanted = new Map([...list.matchAll(/"([\w/]+\.png)": "([\w-]+\.png)"/g)].map(([, source, file]) => [path.basename(source, ".png"), `${SITE}/assets/skill-icons/${file}`]));
wanted.set("sol-erda", `${SITE}/assets/sol-erda.png`);
wanted.set("sol-erda-fragment", `${SITE}/assets/sol-erda-fragment.png`);
wanted.set("hexa-stat", "https://open.api.nexon.com/static/maplestory/skill/icon/KAPCLAPBMA");

let got = 0;
const missing = [];
for (const [name, url] of wanted) {
  if (existsSync(path.join(dir, `${name}.png`))) continue;
  await pause(150);
  const res = await fetch(url, { headers: UA }).catch(() => null);
  const bytes = res?.ok ? Buffer.from(await res.arrayBuffer()) : null;
  // Only real PNG pictures (they start with the PNG signature).
  if (!bytes || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    missing.push(`${name} ${url}`);
    continue;
  }
  writeFileSync(path.join(dir, `${name}.png`), bytes);
  got += 1;
}
console.log(`${got} pictures downloaded into ${dir}; ${wanted.size - missing.length} of ${wanted.size} present.`);
if (missing.length) console.log(`Not found:\n- ${missing.join("\n- ")}`);
