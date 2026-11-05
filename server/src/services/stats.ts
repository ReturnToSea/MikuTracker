import { existsSync } from "node:fs";
import path from "node:path";
import { HEXA_LEVEL_MAX, HEXA_NODES, type HexaNode, STAT_BUFFS_MAGIC, STAT_BUFFS_PHYSICAL, STATS_DEFAULTS, type StatsInput, statsInput, type StatsTryInput, type StatValuesWorked } from "@miku/shared";
import { getConfig } from "../config";
import { type BossClear, bossClear, clearInputs, scoreNeeded } from "../calc/bossClear";
import { coreAttAt } from "../calc/hexa";
import { linesCooldown } from "../calc/potential";
import { type CoreKey, hexaDamage } from "../calc/hexaDamage";
import { type Efficiency, statEfficiency } from "../calc/statEfficiency";
import { finalDamage, generalRange, type StatsContext, type StatShape, statsScore, statTotal } from "../calc/stats";
import { db } from "../db";
import { BOSS_FIGURES, BOSS_SYMBOL, bossFigures, type Phase, phasesOf } from "../gameFigures/bossClear";
import { gearFile } from "../gameFigures/gear";
import { CORE_OF, HEXA_FIGURES, type HexaJob, hexaJob, isShine } from "../gameFigures/hexa";
import { jobStats } from "../gameFigures/jobStats";
import { SYMBOLS } from "../gameFigures/symbols";
import { cooldownRefs, HEROIC_WORLDS, STATS_FIGURES, statLinks, statsJob } from "../gameFigures/stats";
import { ownCharacter } from "./characters";
import { savedInput as hexaInputOf } from "./hexa";
import { equippedItems } from "./gear";
import { iconFiles } from "./icons";
import { overlay, parseSaved, readJson } from "./saved";

// The Stats page (v4.0.0): one character's Stats window and the rest, as typed (the way MapleScouter's
// Enter Directly page takes them), with what's worked out: MapleScouter's score at 380% and 300% boss
// defense, the game's Final Damage, damage range and ATT total. The level, job, world and HEXA levels come
// from elsewhere. (Its character tabs: the character list's.) From v4.1.0 also: the score with every HEXA
// core at 30, stat efficiency (which the gear pages' stat values start from), and the boss clears; and test
// mode, the same for a sheet, level and HEXA levels that aren't saved.

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
  // the HEXA page's levels now (Sol Janus left out: no damage), in MapleScouter's order
  hexa: { node: HexaNode; name: string; level: number; icon: string | null }[];
  rings: { restraint: string | null; continuous: string | null; weapon: string | null }; // the Oz rings' pictures
  icons: Record<string, string>; // the buffs', guild skills' and links' pictures downloaded (scripts/stats-icons.mjs, scripts/maplescouter-icons.mjs), by id
  // (normal: with every HEXA core at 30, as MapleScouter's "Normal")
  out: { finalDamage: number; generalRange: number; atkTotal: number; score380: number | null; score300: number | null; normal380: number | null; normal300: number | null };
  efficiency: Efficiency | null;
  bosses: BossRow[];
  source: string;
}
export interface BossRow extends BossClear {
  key: string; // <difficulty>_<id>, its picture's name
  boss: string; // MapleScouter's id
  name: string;
  difficulty: string;
  partyLimit: number;
  need: number; // the score that clears it exactly
  icon: string | null;
  phases: Phase[] | null;
}

// MapleScouter's order for the HEXA nodes (its Enter Directly page).
const HEXA_ORDER: readonly HexaNode[] = ["mastery1", "mastery2", "mastery3", "mastery4", "origin", "ascent", "boost1", "boost2", "boost3", "boost4", "hecate", "common3"];

// The Oz rings' pictures: MapleScouter's if downloaded, else the gear list's (Ring of Restraint, Continuous
// Ring, Weapon Jump Ring).
const RING_ITEMS = { restraint: 1113098, continuous: 1113329, weapon: 1113113 } as const;
const RING_PICS = { restraint: "ringRestraint", continuous: "ringContinuous", weapon: "ringWeapon" } as const;

// The saved input: what of it still fits (a field added or removed since it was saved falls back on its own,
// the rest kept), or the defaults (none saved, not JSON, or not passing the rules even so).
const inputOf = (data: string | undefined): StatsInput => parseSaved(JSON.stringify(overlay(STATS_DEFAULTS, readJson(data))), statsInput) ?? structuredClone(STATS_DEFAULTS);
async function savedInput(characterId: number): Promise<StatsInput> {
  return inputOf((await db().statSheet.findUnique({ where: { characterId } }))?.data);
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

// The figures the formula needs besides the sheet, for some HEXA levels: the cores' share of the damage
// (every core at 30: MapleScouter's "Normal"), and the flat ATT a node gives.
function contextOf(hexa: HexaJob, levels: Record<HexaNode, number>, base: Omit<StatsContext, "cores" | "coreAtt">): StatsContext {
  const cores = Object.fromEntries(Object.entries(CORE_OF).map(([node, core]) => [core, levels[node as HexaNode]])) as Record<CoreKey, number>;
  return { ...base, cores: hexaDamage(hexa.model, cores), coreAtt: hexa.att ? coreAttAt(hexa.att.points, levels[hexa.att.node]) : 0 };
}

// (the character: whose sheet it is, and its job, level and world)
export type StatsCharacter = Pick<Awaited<ReturnType<typeof ownCharacter>>, "id" | "job" | "level" | "worldId">;

// What the formula works from for a sheet, a level and HEXA levels (null: a job the page doesn't work out):
// the job's figures, the context (the sacred symbol buff: every Sacred symbol, Grand ones too, maxed on the
// Symbols page), the sheet as counted (what the job can't have doesn't count, whatever's saved: the Ruin
// Force Shield but on the Demon jobs, a one-handed weapon but on Hero, Paladin and Dawn Warrior, a food for
// the other kind of ATT), each boss's own symbol, and the equipped hat's cooldown seconds (the gear pages
// value a hat's).
const heroicOf = (c: StatsCharacter) => HEROIC_WORLDS.includes(c.worldId);
async function figuresFor(c: StatsCharacter, input: StatsInput, level: number, levels: Record<HexaNode, number>) {
  const [job, hexa, rows] = [statsJob(c.job), hexaJob(c.job), rowsOf(c.job)];
  if (!job || !hexa || !rows) return null;
  const [symbols, equipped] = await Promise.all([db().symbolState.findMany({ where: { characterId: c.id } }), equippedItems(c.id)]);
  const heroic = heroicOf(c);
  const isMaxed = (id: string) => (symbols.find((r) => r.symbol === id)?.level ?? 0) >= SYMBOLS.find((y) => y.id === id)!.maxLevel;
  const sacred = SYMBOLS.filter((y) => y.kind === "sacred").every((y) => isMaxed(y.id));
  const options = { ruinShield: job.class === "demon_slayer" || job.class === "demon_avenger", oneHanded: job.toggles.oneHandSword !== undefined, magic: job.magic };
  const kind = (k: string | null) => (STAT_BUFFS_MAGIC.includes(String(k)) ? options.magic : STAT_BUFFS_PHYSICAL.includes(String(k)) ? !options.magic : true);
  const counted = { ...input, ruinShield: input.ruinShield && options.ruinShield, oneHanded: input.oneHanded && options.oneHanded, buffB: kind(input.buffB) ? input.buffB : null };
  const hatLines = equipped.find((e) => e.slot === "hat")?.details?.potential?.lines;
  const hatSec = hatLines ? linesCooldown(hatLines) : 0;
  const maxed = new Set(Object.entries(BOSS_SYMBOL).filter(([, id]) => isMaxed(id)).map(([boss]) => boss));
  const hpMain = rows.shape === "hp";
  return { job, hexa, rows, heroic, sacred, options, counted, hatSec, maxed, hpMain, ctx: contextOf(hexa, levels, { level, heroic, sacred }) };
}
type Figures = NonNullable<Awaited<ReturnType<typeof figuresFor>>>;
const efficiencyOf = (f: Figures) => statEfficiency(f.job, f.counted, f.ctx, statLinks(), cooldownRefs(), f.rows.labels.third !== null, f.hpMain, f.hatSec);

// The page for a sheet, a level and HEXA levels: the saved ones, or test mode's.
async function worked(c: StatsCharacter, input: StatsInput, level: number, levels: Record<HexaNode, number>): Promise<StatsBoard> {
  const f = await figuresFor(c, input, level, levels);
  const heroic = heroicOf(c);
  const dir = getConfig().itemIconDir;
  const icons = Object.fromEntries([...iconFiles("stats")].filter((n) => n.endsWith(".png")).map((n) => [n.slice(0, -4), `/item-icons/stats/${n}`]));
  const rings = Object.fromEntries(
    Object.entries(RING_ITEMS).map(([k, id]) => [k, icons[RING_PICS[k as keyof typeof RING_PICS]] ?? (existsSync(path.join(dir, `${id}.png`)) ? `/item-icons/${id}.png` : null)]),
  ) as StatsBoard["rings"];
  const base = { input, level, heroic, rings, source: `MapleScouter's formula and figures (mapledoro's copy, read ${STATS_FIGURES.generated}); the HEXA cores' (read ${HEXA_FIGURES.generated}); the boss cuts (read ${BOSS_FIGURES.generated})` };
  if (!f) {
    const none = { finalDamage: 0, generalRange: 0, atkTotal: 0, score380: null, score300: null, normal380: null, normal300: null };
    return { ...base, icons: {}, known: false, shine: isShine(c.job), labels: { main: "Main stat", sub: "Secondary stat", third: null, atk: "Attack" }, sacred: false, options: { ruinShield: false, oneHanded: false, magic: false }, hexa: [], out: none, efficiency: null, bosses: [] };
  }
  const { job, hexa, rows, sacred, counted, ctx, hpMain } = f;
  const hexaFiles = iconFiles("hexa");
  const level30 = Object.fromEntries(HEXA_NODES.map((n) => [n, HEXA_LEVEL_MAX])) as Record<HexaNode, number>;
  const [links, refs] = [statLinks(), cooldownRefs()];
  const score = statsScore(job, counted, ctx, links, refs);
  const normal = statsScore(job, counted, contextOf(hexa, level30, { level, heroic, sacred, full: true }), links, refs);
  // the boss clears: the Force typed, and the event's while the event stats are on
  const ev = input.eventOn ? input.eventStats : STATS_DEFAULTS.eventStats;
  const x = clearInputs(job, counted, ctx, contextOf(hexa, { ...levels, ascent: 0 }, { level, heroic, sacred }), f.maxed, hpMain, links, refs);
  const all = bossFigures();
  const bossFiles = iconFiles("bosses");
  const bosses: BossRow[] = x
    ? all.map((b) => {
        const key = `${b.difficulty.toLowerCase()}_${b.name}`;
        const clear = bossClear(b, all, level, input.stats.arcane + ev.arcane, input.stats.sacred + ev.sacred, x);
        return { ...clear, key, boss: b.name, name: b.label, difficulty: b.difficulty, partyLimit: b.partyLimit, need: scoreNeeded(b, all, x), icon: bossFiles.has(`${key}.png`) ? `/item-icons/bosses/${key}.png` : null, phases: phasesOf(b) };
      })
    : [];
  const nodes = hexa.nodes.filter((n) => n.key !== "janus").sort((a, b) => HEXA_ORDER.indexOf(a.key) - HEXA_ORDER.indexOf(b.key));
  return {
    ...base,
    known: true,
    shine: false,
    labels: rows.labels,
    options: f.options,
    icons,
    hexa: nodes.map((n) => ({ node: n.key, name: n.name, level: levels[n.key], icon: n.icon !== null && hexaFiles.has(`${n.icon}.png`) ? `/item-icons/hexa/${n.icon}.png` : null })),
    sacred,
    out: { finalDamage: finalDamage(job, counted, ctx), generalRange: generalRange(job, counted, rows.shape, ctx), atkTotal: statTotal(input.stats.atk), score380: score.score380, score300: score.score300, normal380: normal.score380, normal300: normal.score300 },
    efficiency: efficiencyOf(f),
    bosses,
  };
}

export async function statsBoard(ownerId: string, characterId: number): Promise<StatsBoard> {
  const c = await ownCharacter(ownerId, characterId);
  const [input, hexaInput] = await Promise.all([savedInput(characterId), hexaInputOf(characterId)]);
  return worked(c, input, c.level, hexaInput.current);
}

// Test mode (v4.1.0): the page for a sheet, a level and HEXA levels as typed. Nothing is saved.
export async function statsTry(ownerId: string, characterId: number, t: StatsTryInput): Promise<StatsBoard> {
  return worked(await ownCharacter(ownerId, characterId), t.input, t.level, t.hexa);
}

// The gear pages' stat values, worked out (v4.1.0): from the character's Stats page, if it has one saved
// (null: none, or a job the page doesn't work out). Each stat's 1% under its own name; the cooldowns at 2–6 s.
export async function workedStatValues(c: StatsCharacter): Promise<StatValuesWorked | null> {
  // (only stat efficiency: one read of the sheet, nothing the page alone shows)
  const row = await db().statSheet.findUnique({ where: { characterId: c.id } });
  if (!row) return null;
  const f = await figuresFor(c, inputOf(row.data), c.level, (await hexaInputOf(c.id)).current);
  const e = f && efficiencyOf(f);
  if (!e) return null;
  const labels = f.rows.labels;
  const pct: Record<string, number | null> = { STR: null, DEX: null, INT: null, LUK: null, HP: null };
  pct[labels.main] = e.mainPct;
  pct[labels.sub] = e.subPct;
  pct[String(labels.third)] = e.thirdPct; // (no third stat: under "null", left out)
  return {
    att: e.att, allStat: e.allStatPct, secRatio: e.sub, bossDmg: e.bossDmg, fdPer100: e.fdPer100, attPct: e.attPct, mainFlat: e.mainFlat, critDmg: e.critDmg, ied300: e.ied300, ied380: e.ied380,
    strPct: pct.STR!, dexPct: pct.DEX!, intPct: pct.INT!, lukPct: pct.LUK!, hpPct: pct.HP!,
    cd2: e.cooldown[2], cd3: e.cooldown[3], cd4: e.cooldown[4], cd5: e.cooldown[5], cd6: e.cooldown[6],
  };
}
