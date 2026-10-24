// node scripts/gear-icons.mjs: downloads the gear tab's item icons (Nexon's art) into the data
// folder's item-icons/ (<item id>.png), by hand, after scripts/gear-data.mjs. Never in git, and the
// app itself never contacts the wiki: it only serves what's in the folder. Icons already there are
// skipped. MIKU_DATA_DIR picks another data folder.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const UA = { "User-Agent": "MikuTracker gear icons (personal, by hand)" };
const data = process.env.MIKU_DATA_DIR || path.join(os.homedir(), "Library", "Application Support", "MikuTracker");
const dir = path.join(data, "item-icons");
mkdirSync(dir, { recursive: true });
const { items } = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "../server/src/gameFigures/gear-items.json"), "utf8"));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const wanted = new Map(items.filter((i) => i.file).map((i) => [i.id, i.file]));
const todo = [...wanted].filter(([id]) => !existsSync(path.join(dir, `${id}.png`)));
// The pictures' addresses, 50 at a time.
const urls = new Map();
const files = [...new Set(todo.map(([, f]) => `File:${f}`))];
for (let i = 0; i < files.length; i += 50) {
  await pause(300);
  const info = await (await fetch(`https://maplestorywiki.net/api.php?${new URLSearchParams({ action: "query", titles: files.slice(i, i + 50).join("|"), prop: "imageinfo", iiprop: "url", format: "json", formatversion: "2" })}`, { headers: UA })).json();
  const named = new Map((info.query.normalized ?? []).map((n) => [n.to, n.from]));
  for (const p of info.query.pages) if (p.imageinfo?.[0]?.url) urls.set(named.get(p.title) ?? p.title, p.imageinfo[0].url);
}
let got = 0;
const missing = [];
for (const [id, file] of todo) {
  const url = urls.get(`File:${file}`) ?? urls.get(`File:${file.replace(/_/g, " ")}`);
  await pause(150);
  const res = url ? await fetch(url, { headers: UA }).catch(() => null) : null;
  const bytes = res?.ok ? Buffer.from(await res.arrayBuffer()) : null;
  // Only real PNG pictures (they start with the PNG signature).
  if (!bytes || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    missing.push(`${id} ${file}`);
    continue;
  }
  writeFileSync(path.join(dir, `${id}.png`), bytes);
  got += 1;
}
console.log(`${got} icons downloaded into ${dir}; ${wanted.size - missing.length} of ${wanted.size} present.`);
if (missing.length) console.log(`Not found:\n- ${missing.join("\n- ")}`);
