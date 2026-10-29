import type { UpgradeStep, UpgradeSystem } from "../api/types";
import { formatMeso, formatScore } from "./flames";
import { oneIn } from "./potential";
import { formatRate } from "./starForce";

// The Upgrades page's display rules (v2.4.0), as plain functions.

// Which step a row is (an item has at most one step per system).
export const stepKey = (s: Pick<UpgradeStep, "system" | "slot">): string => `${s.system}|${s.slot}`;

export const SYSTEM_NAME: Record<UpgradeSystem, string> = { flames: "Flames", starforce: "Star Force", potential: "Potential" };
// A Gear page's address after its path: the item picked and the events ticked (each left out when there's
// none), so a link opens on what it showed and a reload keeps it.
export function pageQuery(slot: string | null, events: string): string {
  const q = new URLSearchParams();
  if (slot !== null) q.set("item", slot);
  if (events) q.set("events", events);
  const text = q.toString();
  return text ? `?${text}` : "";
}
// The events in a page's address, keeping only the ones the page has (in its own order).
export function eventsFrom<K extends string>(text: string | null, known: readonly K[]): Set<K> {
  const asked = new Set(text?.split(","));
  return new Set(known.filter((k) => asked.has(k)));
}
// Each system's own page, opened with the item picked and that page's events from here (Star Force's for
// Star Force, the cubes' for Potential; Flames has none), so it shows the figures the row did.
export const pageFor = (s: Pick<UpgradeStep, "system" | "slot">, sf = "", cubes = ""): string => `/gear/${s.system}${pageQuery(s.slot, s.system === "starforce" ? sf : s.system === "potential" ? cubes : "")}`;

// What the item is now, under its name: its flame score of its best, its stars and boom price, its rank and
// the other cube's cost.
export function nowText(s: UpgradeStep): string {
  const n = s.now;
  if ("score" in n) return `score ${formatScore(n.score)} / ${formatScore(n.best)}`;
  if ("star" in n) return `${n.star}★ · ${n.boomCost > 0 ? `booms at ${formatMeso(n.boomCost)}` : "booms not priced"}`;
  const rank = n.rank === null ? "no potential" : n.rank[0]!.toUpperCase() + n.rank.slice(1);
  const other = n.cube === "glowing" ? "Bright" : "Glowing";
  // (a hat with a minimum cooldown: its seconds and the minimum)
  const cd = n.cooldown && n.cooldown.min > 0 ? ` · cooldown ${n.cooldown.sec} s, ${n.cooldown.min} s needed` : "";
  return `${rank} · ${other} ${n.otherPerFd === null ? "can't beat it" : `${formatMeso(n.otherPerFd)} per 1%`}${cd}`;
}

// The next try's chance, as a player says it: 1 in X flames or cubes better; the next tap's success and boom.
export function chanceText(s: UpgradeStep): string {
  if (s.system === "starforce") return `next tap ${formatRate(s.chance)}${s.boom ? `, boom ${formatRate(s.boom)}` : ""}`;
  return `${oneIn(s.chance)} ${s.system === "flames" ? "flames" : "cubes"} better`;
}

// What the cost covers.
export const costNote = (s: UpgradeStep): string => (s.system === "starforce" ? "average, booms included" : "average, to any better roll");

// The chart's scales: whole powers of ten around the values (each a tick), and where a value sits on one
// from 0 to 1.
export function decades(values: number[]): [number, number] {
  const shown = values.filter((v) => v > 0);
  if (shown.length === 0) return [0, 1];
  const lo = Math.floor(Math.log10(Math.min(...shown)));
  const hi = Math.ceil(Math.log10(Math.max(...shown)));
  return [lo, Math.max(hi, lo + 1)];
}
export const along = ([lo, hi]: [number, number], v: number): number => (Math.log10(v) - lo) / (hi - lo);

// The dashed lines of the same meso per 1% final damage: 100m, 1B, 10B and 100B per 1%, as cost → final damage.
export const SAME_PER_FD = [1e8, 1e9, 1e10, 1e11] as const;

// The final damage a step adds: two decimals, or two significant figures when it's small (+0.0074%), never
// in "e" notation (+0.0000003%); less than nothing (a hat's cube needed for its minimum cooldown) −0.42%.
export function formatFd(fd: number): string {
  const n = Math.abs(fd);
  // Stryker disable next-line EqualityOperator: at exactly 0.1 both read "0.10"
  return `${fd < 0 ? "−" : "+"}${n >= 0.1 ? n.toFixed(2) : n.toLocaleString("en-US", { maximumSignificantDigits: 2 })}%`;
}
// A step's meso per 1% final damage, or "needed" for a hat's cube its minimum cooldown needs that adds nothing.
export const perFdText = (s: Pick<UpgradeStep, "perFd">): string => (s.perFd === null ? "needed" : formatMeso(s.perFd));
// A chart tick of final damage: 10,000%, 10%, 1%, 0.01%.
export const formatTick = (v: number): string => `${v.toLocaleString("en-US", { maximumSignificantDigits: 2 })}%`;
