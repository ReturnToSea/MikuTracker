// Research only, not part of the app: finds out when Nexon's rankings update, so the app's
// daily refresh can run soon after the previous UTC day's EXP is in.
//
// Every 30 minutes it looks up a few active characters and logs their level and EXP to
// tempdata/nexon-watch/log.jsonl (not in git). With no names, it watches the top 5 of this
// week's EXP ranking (they gain EXP all the time).
//
//   node scripts/nexon-watch.mjs                    watch the top 5 of the weekly ranking
//   node scripts/nexon-watch.mjs NameOne NameTwo    watch these characters
//   node scripts/nexon-watch.mjs --once             one round, then stop
//   node scripts/nexon-watch.mjs --summary          when did the numbers change? (UTC)
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const RANKINGS = "https://www.nexon.com/api/maplestory/no-auth/ranking/v2/na";
const EVERY_MINUTES = 30;
const PAUSE_MS = 2000; // between requests, to go easy on Nexon
const TIMEOUT_MS = 15000;
const folder = path.resolve(import.meta.dirname, "../tempdata/nexon-watch");
const logFile = path.join(folder, "log.jsonl");

const args = process.argv.slice(2);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function rankings(params) {
  const url = `${RANKINGS}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Nexon answered ${res.status}`);
  const body = await res.json();
  if (!Array.isArray(body?.ranks)) throw new Error("Unexpected response shape (no ranks list)");
  return body.ranks;
}

async function topOfWeek(count) {
  const ranks = await rankings({ type: "overall", id: "weekly", reboot_index: "0", page_index: "1" });
  return ranks.slice(0, count).map((r) => String(r.characterName));
}

async function lookUp(name) {
  const ranks = await rankings({ type: "overall", id: "legendary", reboot_index: "0", page_index: "1", character_name: name });
  const r = ranks.find((x) => String(x.characterName).toLowerCase() === name.toLowerCase());
  if (!r) return null;
  return { level: Number(r.level), exp: String(r.exp), worldID: Number(r.worldID) };
}

// The last logged level and EXP for each name, so a change can be spotted.
function lastSeen() {
  const seen = new Map();
  if (!existsSync(logFile)) return seen;
  for (const line of readFileSync(logFile, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const e = JSON.parse(line);
    if (e.level !== undefined) seen.set(e.name, `${e.level}/${e.exp}`);
  }
  return seen;
}

async function round(names, seen) {
  const checkedAt = new Date().toISOString();
  for (const name of names) {
    let entry;
    try {
      const found = await lookUp(name);
      if (!found) entry = { checkedAt, name, error: "not found" };
      else {
        const key = `${found.level}/${found.exp}`;
        entry = { checkedAt, name, ...found, first: !seen.has(name), changed: seen.has(name) && seen.get(name) !== key };
        seen.set(name, key);
      }
    } catch (error) {
      entry = { checkedAt, name, error: error instanceof Error ? error.message : String(error) };
    }
    appendFileSync(logFile, JSON.stringify(entry) + "\n");
    const note = entry.error ? `error: ${entry.error}` : entry.first ? "first" : entry.changed ? "CHANGED" : "same";
    console.log(`${checkedAt}  ${name.padEnd(14)} ${entry.level ?? ""} ${entry.exp ?? ""}  ${note}`);
    await sleep(PAUSE_MS);
  }
}

function summary() {
  if (!existsSync(logFile)) return console.log("No log yet.");
  const entries = readFileSync(logFile, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const changes = entries.filter((e) => e.changed);
  const checks = entries.filter((e) => e.level !== undefined);
  console.log(`${checks.length} lookups from ${entries[0]?.checkedAt} to ${entries.at(-1)?.checkedAt}; ${changes.length} changes.`);
  console.log("\nChanges by UTC hour (when a change was first seen):");
  const byHour = new Map();
  for (const e of changes) {
    const hour = e.checkedAt.slice(11, 13);
    byHour.set(hour, (byHour.get(hour) ?? 0) + 1);
  }
  for (let h = 0; h < 24; h++) {
    const hour = String(h).padStart(2, "0");
    const n = byHour.get(hour) ?? 0;
    console.log(`  ${hour}:00  ${"#".repeat(n)} ${n || ""}`);
  }
  console.log("\nEvery change:");
  for (const e of changes) console.log(`  ${e.checkedAt}  ${e.name}  level ${e.level}`);
  const errors = entries.filter((e) => e.error);
  if (errors.length) console.log(`\n${errors.length} failed lookups (latest: ${errors.at(-1).checkedAt} ${errors.at(-1).error})`);
}

if (args.includes("--summary")) {
  summary();
} else {
  mkdirSync(folder, { recursive: true });
  const given = args.filter((a) => !a.startsWith("--"));
  const names = given.length ? given : await topOfWeek(5);
  console.log(`Watching: ${names.join(", ")} (every ${EVERY_MINUTES} minutes; log: ${logFile})`);
  const seen = lastSeen();
  do {
    await round(names, seen);
    if (args.includes("--once")) break;
    await sleep(EVERY_MINUTES * 60 * 1000);
  } while (true);
}
