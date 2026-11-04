import { existsSync } from "node:fs";
import path from "node:path";
import { type HexaNode, STAT_BUFFS_MAGIC, STAT_BUFFS_PHYSICAL, STATS_DEFAULTS, type StatsInput, statsInput } from "@miku/shared";
import { getConfig } from "../config";
import { coreAttAt } from "../calc/hexa";
import { type CoreKey, hexaDamage } from "../calc/hexaDamage";
import { finalDamage, generalRange, type StatShape, statsScore, statTotal } from "../calc/stats";
import { db } from "../db";
import { gearFile } from "../gameFigures/gear";
import { CORE_OF, HEXA_FIGURES, hexaJob, isShine } from "../gameFigures/hexa";
import { jobStats } from "../gameFigures/jobStats";
import { SYMBOLS } from "../gameFigures/symbols";
import { cooldownRefs, HEROIC_WORLDS, STATS_FIGURES, statLinks, statsJob } from "../gameFigures/stats";
import { ownCharacter } from "./characters";
import { savedInput as hexaInputOf } from "./hexa";
import { iconFiles } from "./icons";
import { overlay, parseSaved, readJson } from "./saved";

// The Stats page (v4.0.0): one character's Stats window and the rest, as typed (the way MapleScouter's
// Enter Directly page takes them), with what's worked out: MapleScouter's score at 380% and 300% boss
// defense, the game's Final Damage, damage range and ATT total. The level, job, world and HEXA levels come
// from elsewhere. (Its character tabs: the character list's.)

export interface StatsBoard {
  // false: a job the page doesn't work out (a SHINE class, whose HEXA the app doesn't track; one the
  // figures don't have)
  known: boolean;
  shine: boolean;
  input: StatsInput;
  // what the job's three stat rows and ATT row are (null: the job has no such row), and its options
  labels: { main: string; sub: string; third: string | null; atk: "Attack" | "Magic ATT" };
  options: { ruinShield: boolean; oneHanded: boolean; magic: boolean };
  level: number;
  heroic: boolean;
  sacred: boolean; // the sacred symbol buff on (every Sacred symbol maxed)
  hexa: { node: HexaNode; name: string; level: number; icon: string | null }[]; // the HEXA page's levels now (Sol Janus left out: no damage)
  rings: { restraint: string | null; continuous: string | null; weapon: string | null }; // the Oz rings' pictures
  icons: Record<string, string>; // the buffs', guild skills' and links' pictures downloaded (scripts/stats-icons.mjs), by id
  out: { finalDamage: number; generalRange: number; atkTotal: number; score380: number | null; score300: number | null };
  source: string;
}

// The Oz rings' pictures: the gear list's (Ring of Restraint, Continuous Ring, Weapon Jump Ring).
const RING_ITEMS = { restraint: 1113098, continuous: 1113329, weapon: 1113113 } as const;

// The saved input: what of it still fits (a field added or removed since it was saved falls back on its own,
// the rest kept), or the defaults (none saved, not JSON, or not passing the rules even so).
async function savedInput(characterId: number): Promise<StatsInput> {
  const row = await db().statSheet.findUnique({ where: { characterId } });
  return parseSaved(JSON.stringify(overlay(STATS_DEFAULTS, readJson(row?.data))), statsInput) ?? structuredClone(STATS_DEFAULTS);
}

export async function saveStats(ownerId: string, characterId: number, input: StatsInput): Promise<void> {
  await ownCharacter(ownerId, characterId);
  const data = JSON.stringify(input);
  await db().statSheet.upsert({ where: { characterId }, create: { characterId, data }, update: { data } });
}

// A job's stat rows: its main stat (Demon Avenger: HP; Xenon: STR, DEX and LUK as its three), its secondary,
// and the LUK thieves' second secondary; and the shape of its damage range's stat value.
function rowsOf(job: string): { labels: StatsBoard["labels"]; shape: StatShape } | null {
  const { jobs } = gearFile();
  const s = jobStats(job, Object.hasOwn(jobs, job) ? jobs[job]!.branches : undefined);
  if (!s) return null;
  const atk = s.magic ? "Magic ATT" : "Attack";
  if (s.hpMain) return { labels: { main: "HP", sub: "STR", third: null, atk }, shape: "hp" };
  if (s.main.length === 3) return { labels: { main: s.main[0]!, sub: s.main[1]!, third: s.main[2]!, atk }, shape: "xenon" };
  // (the LUK thieves: DEX, then STR)
  if (s.secondary.length === 2) return { labels: { main: s.main[0]!, sub: s.secondary[1]!, third: s.secondary[0]!, atk }, shape: "luk3" };
  // Stryker disable next-line StringLiteral: any shape but the three above is worked out as two stats
  return { labels: { main: s.main[0]!, sub: s.secondary[0]!, third: null, atk }, shape: "two" };
}

export async function statsBoard(ownerId: string, characterId: number): Promise<StatsBoard> {
  const c = await ownCharacter(ownerId, characterId);
  const [input, hexaInput, symbols] = await Promise.all([savedInput(characterId), hexaInputOf(characterId), db().symbolState.findMany({ where: { characterId } })]);
  const job = statsJob(c.job);
  const hexa = hexaJob(c.job);
  const rows = rowsOf(c.job);
  const heroic = HEROIC_WORLDS.includes(c.worldId);
  const dir = getConfig().itemIconDir;
  const rings = Object.fromEntries(Object.entries(RING_ITEMS).map(([k, id]) => [k, existsSync(path.join(dir, `${id}.png`)) ? `/item-icons/${id}.png` : null])) as StatsBoard["rings"];
  const base = { input, level: c.level, heroic, rings, source: `MapleScouter's formula and figures (mapledoro's copy, read ${STATS_FIGURES.generated}); the HEXA cores' (read ${HEXA_FIGURES.generated})` };
  if (!job || !hexa || !rows) {
    return { ...base, icons: {}, known: false, shine: isShine(c.job), labels: { main: "Main stat", sub: "Secondary stat", third: null, atk: "Attack" }, sacred: false, options: { ruinShield: false, oneHanded: false, magic: false }, hexa: [], out: { finalDamage: 0, generalRange: 0, atkTotal: 0, score380: null, score300: null } };
  }
  const icons = Object.fromEntries([...iconFiles("stats")].filter((f) => f.endsWith(".png")).map((f) => [f.slice(0, -4), `/item-icons/stats/${f}`]));
  const hexaFiles = iconFiles("hexa");
  const levels = hexaInput.current;
  const cores = Object.fromEntries(Object.entries(CORE_OF).map(([node, core]) => [core, levels[node as HexaNode]])) as Record<CoreKey, number>;
  // (the sacred symbol buff: every Sacred symbol, Grand ones too, maxed on the Symbols page)
  const sacred = SYMBOLS.filter((y) => y.kind === "sacred").every((y) => (symbols.find((r) => r.symbol === y.id)?.level ?? 0) >= y.maxLevel);
  const ctx = { level: c.level, heroic, cores: hexaDamage(hexa.model, cores), coreAtt: hexa.att ? coreAttAt(hexa.att.points, levels[hexa.att.node]) : 0, sacred };
  // (what the job can't have doesn't count, whatever's saved: the Ruin Force Shield but on the Demon jobs, a
  // one-handed weapon but on Hero, Paladin and Dawn Warrior, a food for the other kind of ATT)
  const options = { ruinShield: job.class === "demon_slayer" || job.class === "demon_avenger", oneHanded: job.toggles.oneHandSword !== undefined, magic: job.magic };
  const kind = (k: string | null) => (STAT_BUFFS_MAGIC.includes(String(k)) ? options.magic : STAT_BUFFS_PHYSICAL.includes(String(k)) ? !options.magic : true);
  const buffB = kind(input.buffB) ? input.buffB : null;
  const counted = { ...input, ruinShield: input.ruinShield && options.ruinShield, oneHanded: input.oneHanded && options.oneHanded, buffB };
  const score = statsScore(job, counted, ctx, statLinks(), cooldownRefs());
  return {
    ...base,
    known: true,
    shine: false,
    labels: rows.labels,
    options,
    icons,
    hexa: hexa.nodes.filter((n) => n.key !== "janus").map((n) => ({ node: n.key, name: n.name, level: levels[n.key], icon: n.icon !== null && hexaFiles.has(`${n.icon}.png`) ? `/item-icons/hexa/${n.icon}.png` : null })),
    sacred,
    out: { finalDamage: finalDamage(job, counted, ctx), generalRange: generalRange(job, counted, rows.shape, ctx), atkTotal: statTotal(input.stats.atk), score380: score.score380, score300: score.score300 },
  };
}
