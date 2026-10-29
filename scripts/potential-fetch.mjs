// node scripts/potential-fetch.mjs [black|red]: downloads Nexon Korea's official potential tables (every
// line each item type can roll, with its value and chance, per rank and level range) for one cube into
// tempdata/nexon-potential/ (black) or tempdata/nexon-potential-red/, by hand, for
// scripts/potential-data.mjs to read. Never part of the app or its tests. The black cube's lines are
// GMS's Bright Cube's, the red cube's GMS's Glowing Cube's (PLAN/DESIGN: the cubes).
// Nexon's page: https://maplestory.nexon.com/Guide/OtherProbability/cube/black (or /red; the form posts to
// GetSearchProbList; the same request brendonmay's cubing calculator's scraper sends). One request at a
// time with a pause; answers already saved are skipped, so it can be stopped and rerun.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const CUBES = { black: { id: 5062010, folder: "nexon-potential" }, red: { id: 5062009, folder: "nexon-potential-red" } };
const cube = process.argv[2] ?? "black";
if (!Object.hasOwn(CUBES, cube)) throw new Error(`Unknown cube "${cube}": black or red`);
const OUT = path.resolve(import.meta.dirname, "../tempdata", CUBES[cube].folder);
mkdirSync(OUT, { recursive: true });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Nexon's ids. Both cubes reach every rank, so their tables list every line of every rank.
export const PARTS = { weapon: 1, emblem: 2, secondary: 3, "force shield": 4, shield: 5, hat: 6, top: 7, overall: 8, bottom: 9, shoes: 10, gloves: 11, cape: 12, belt: 13, shoulder: 14, face: 15, eye: 16, earrings: 17, ring: 18, pendant: 19, heart: 20 };
export const RANKS = { rare: 1, epic: 2, unique: 3, legendary: 4 };
// One level from each of Nexon's level ranges (every 10 levels up to 119, each tenth level on its own,
// then 120–200). Korea's 201–250 range isn't GMS's (GMS's Lv. 151+ items: server/src/gameFigures/potential.ts).
export const LEVELS = [0, 10, 11, ...[20, 30, 40, 50, 60, 70, 80, 90, 100, 110].flatMap((l) => [l, l + 1]), 120];

const jobs = [];
for (const [part, partId] of Object.entries(PARTS)) for (const [rank, grade] of Object.entries(RANKS)) for (const level of LEVELS) jobs.push({ part, partId, rank, grade, level });
let done = 0;
for (const j of jobs) {
  const file = path.join(OUT, `${j.part.replace(" ", "-")}_${j.rank}_${j.level}.html`);
  if (existsSync(file)) continue;
  await pause(2000);
  const res = await fetch("https://maplestory.nexon.com/Guide/OtherProbability/cube/GetSearchProbList", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest", Origin: "https://maplestory.nexon.com", Referer: `https://maplestory.nexon.com/Guide/OtherProbability/cube/${cube}`, "User-Agent": "Mozilla/5.0 (Macintosh) MikuTracker potential tables (personal, by hand)" },
    body: new URLSearchParams({ nCubeItemID: String(CUBES[cube].id), nReqLev: String(j.level), nPartsType: String(j.partId), nGrade: String(j.grade) }),
  }).catch(() => null);
  const text = res?.ok ? await res.text() : "";
  if (!text.includes("cube_data")) {
    console.log(`no table: ${j.part} ${j.rank} Lv. ${j.level} (${res?.status ?? "no answer"})`);
    continue;
  }
  writeFileSync(file, text);
  done += 1;
  if (done % 50 === 0) console.log(`${done} saved…`);
}
console.log(`Finished: ${done} new answers in ${OUT}`);
