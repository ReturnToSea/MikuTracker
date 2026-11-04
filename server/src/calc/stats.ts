import { STAT_BUFFS, STAT_EVENT_BUFFS, STATS_DEFAULTS, type StatsInput } from "@miku/shared";
import {
  AUTHENTIC_DMG_PCT, BUFF_ALL_STAT, BUFF_ATT_PCT, BUFF_CRIT_DMG, BUFF_DMG, BUFF_FLAT_ATT, BUFF_IED, BUFF_KEY, CHAMPION, CONTINUOUS_ATT, CONTINUOUS_BOSS, type CooldownRefs, CRIT_RATE_TO_CRIT_DMG, DA_BUFF_HP,
  DA_HP_PER_CHAMPION_ALL, DA_PURE_HP, DEFAULT_WEIGHTS, ELEMENTAL_CAP, FINAL_ATTACK_CLASSES, FINAL_ATTACK_PER_30, GENESIS_FD, GUILD_PER_LEVEL, HEROIC_FD, HEROIC_FD_TOP, MAGICIAN_LINK, RESTRAINT_LV6_OVER_LV5,
  RESTRAINT_SHAPE, RING_MAX, RUIN_FORCE_SHIELD_FD, STAT_WEIGHTS, type StatsJob, SUMMON_CAP, UNDER_260, WILD_HUNTER_DMG, WILD_HUNTER_RANKS,
} from "../gameFigures/stats";

// The Stats page's maths (v4.0.0): MapleScouter's damage formula and score, as chablades/mapledoro rebuilt
// it from MapleScouter's answers (its code a reference: no license; this is our own, checked against its
// results), and the game's Final Damage and damage range. Pure: no database, no HTTP.
//
// Damage is the class's scale × a product of groups, inputs inside a group adding up, each group starting
// from the class's hidden amount (its passives, measured):
//   stat term × flat ATT × ATT % × damage × crit damage × defense × HEXA cores × the rest
// The score (MapleScouter's "HEXA value", what boss cuts compare against) is where that damage lands on the
// class's measured curve, raised for skill cooldown.

type Spline = { x: number[]; y: number[]; m: number[] };
// What the formula needs besides what's typed.
export interface StatsContext {
  level: number;
  heroic: boolean; // a Heroic (Reboot) world
  cores: number; // the HEXA cores' share of the damage with every core at 30 (calc/hexaDamage.ts)
  coreAtt: number; // flat ATT a HEXA node gives (calc/hexa.ts coreAttAt)
  sacred: boolean; // every Sacred symbol maxed: the sacred symbol buff (+20% damage against 380% bosses)
}

const sum = (values: Iterable<number>) => [...values].reduce((a, v) => a + v, 0);
const on = (yes: boolean, factor = 1) => (yes ? factor : 1);
// The buffs on, as MapleScouter's boxes: those ticked, each group's pick, the Advanced Stat Potion, the
// event ones while the event stats are on, and the sacred symbol buff.
// (a name no table has, a group without a pick, adds nothing: every table is read with ?? 0)
function ticked(input: StatsInput, sacred: boolean): (string | undefined)[] {
  const events = STAT_EVENT_BUFFS.filter((k) => input.eventOn && input.events[k]);
  return [...STAT_BUFFS.filter((k) => input.buffs[k]), input.buffA, input.buffB, ...events].map((k) => BUFF_KEY[String(k)]).concat(input.statPotion ? "statPotion" : undefined, sacred ? "authenticDmg" : undefined);
}
// What the event stats typed add (nothing while they're off).
const eventStats = (input: StatsInput): StatsInput["eventStats"] => (input.eventOn ? input.eventStats : STATS_DEFAULTS.eventStats);

// The buffs', links' and Legion card's additions, per group: flat ATT, damage % points, crit damage % points,
// ATT % points, base all stats, base HP (Demon Avenger), and the share of defense still kept.
export interface BuffTotals {
  flatAtk: number;
  dmg: number;
  crit: number;
  atkPct: number;
  allStat: number;
  hp: number;
  iedKeep: number;
}
export function buffTotals(input: StatsInput, classId: string, links: Readonly<Record<string, Readonly<Record<string, number>>>>, sacred: boolean): BuffTotals {
  const list = ticked(input, sacred);
  const from = (table: Readonly<Record<string, number>>) => sum(list.map((k) => table[String(k)] ?? 0));
  const da = classId === "demon_avenger";
  const n = input.guild;
  const c = input.renown;
  let iedKeep = list.reduce((keep, k) => keep * (1 - (BUFF_IED[String(k)] ?? 0)), 1);
  iedKeep *= (1 - (GUILD_PER_LEVEL / 100) * n.undeterred) * (1 - CHAMPION.ied * c.ied);
  let dmg = from(BUFF_DMG) + GUILD_PER_LEVEL * (n.bossSlayers + n.forTheGuild) + CHAMPION.boss * c.boss;
  // Wild Hunter Legion card: per rank reached
  dmg += WILD_HUNTER_DMG * WILD_HUNTER_RANKS.filter((L) => input.wildHunter >= L).length;
  // (a link at 0 adds nothing: the tables' level 0 is 0)
  for (const [link, level] of Object.entries(input.links)) {
    if (link === "magician") {
      // (every 2 levels, rounded up)
      const steps = Math.ceil(level / 2);
      dmg += MAGICIAN_LINK.dmg * steps;
      iedKeep *= 1 - MAGICIAN_LINK.ied * steps;
    } else dmg += links[link]![String(level)]!;
  }
  return {
    flatAtk: from(BUFF_FLAT_ATT) + CHAMPION.atk * c.atk,
    dmg,
    crit: from(BUFF_CRIT_DMG) + GUILD_PER_LEVEL * n.hardHitter + CHAMPION.critDmg * c.critDmg,
    atkPct: from(BUFF_ATT_PCT),
    // (Candy gives a Demon Avenger nothing)
    allStat: from(BUFF_ALL_STAT) + CHAMPION.allStat * c.allStat - (da && list.includes("candy") ? (BUFF_ALL_STAT.candy ?? 0) : 0),
    hp: da ? from(DA_BUFF_HP) + DA_HP_PER_CHAMPION_ALL * c.allStat : 0,
    iedKeep,
  };
}

// The Ring of Restraint's ATT % points (its shape per level, sized by the class's own Lv. 4 and 5).
export function restraintPts(ring: StatsJob["restraint"], level: number): number {
  if (level >= RING_MAX) return ring.lv5 * RESTRAINT_LV6_OVER_LV5;
  return level >= RING_MAX - 1 ? ring.lv5 : ring.lv4 * RESTRAINT_SHAPE[level]!;
}

// The groups, each from the class's hidden amount and what's typed, and the share of defense kept.
export interface Groups {
  stat: number;
  flatAtk: number;
  atkPct: number;
  dmg: number;
  crit: number;
  def: number;
  cores: number;
  other: number;
}
export function groups(job: StatsJob, input: StatsInput, ctx: StatsContext, links: Readonly<Record<string, Readonly<Record<string, number>>>>): { g: Groups; keep: number } {
  const b = buffTotals(input, job.class, links, ctx.sacred);
  const s = input.stats;
  const ev = eventStats(input);
  const w = STAT_WEIGHTS[job.class] ?? DEFAULT_WEIGHTS;
  const triple = { main: s.main, sub: s.sub, ssub: s.third };
  const famPct = { main: input.famPct.main, sub: input.famPct.sub, ssub: input.famPct.third };
  const mult = (k: keyof typeof triple) => 1 + (triple[k].per + famPct[k]) / 100;
  // (event All Stats count as the buffs' do)
  const allStat = b.allStat + ev.allStat;
  const hidden = Object.entries(job.stat.hiddenBase) as [keyof typeof triple, number][];
  const stat =
    hidden.reduce((t, [k, h]) => t + w[k] * (h + allStat + (k === "main" ? b.hp : 0)) * mult(k), 0) +
    (["main", "sub", "ssub"] as const).reduce((t, k) => t + w[k] * (triple[k].base * mult(k) + triple[k].abs), 0) +
    job.stat.flat +
    job.stat.perLevel * ctx.level * mult("main");
  // Ignore defense: the defense factor is 1 − k (1 − IED); buffs that ignore defense scale k
  const ied = 1 - (1 - s.ied / 100) * (1 - ev.ied / 100);
  const keep = job.defenseK * b.iedKeep * (1 - ied);
  const ring = Math.min(RING_MAX, input.rings.continuous);
  const critRateToDmg = CRIT_RATE_TO_CRIT_DMG[job.class] ?? 0;
  const g: Groups = {
    stat,
    flatAtk: job.flatAtk + s.atk.base + ev.att + b.flatAtk + ctx.coreAtt,
    atkPct: job.atkPct + (s.atk.per + b.atkPct + CONTINUOUS_ATT[ring]!) / 100 + restraintPts(job.restraint, input.rings.restraint),
    // (buff duration keeps damage buffs up longer)
    dmg: job.dmg + (s.dmg + ev.dmg + s.boss + ev.boss + s.statusDmg) / 100 + (CONTINUOUS_BOSS[ring]! + b.dmg) / 100 + job.dmgPerBuffDuration * s.buffDuration,
    // (the formula assumes every hit crits: crit rate counts as 100 at least)
    crit: job.crit + (s.critDmg + ev.critDmg + critRateToDmg * Math.max(100, s.critRate) + b.crit) / 100,
    def: 1 - keep,
    cores: ctx.cores,
    other:
      on(ctx.heroic, job.toggles.isReboot) *
      on(input.innerAbility === "passive", job.toggles.passiveSkillLevelUp) *
      on(input.oneHanded, job.toggles.oneHandSword) *
      on(input.liberation, GENESIS_FD) *
      on(input.ruinShield, RUIN_FORCE_SHIELD_FD) *
      (1 + Math.min(ELEMENTAL_CAP, Math.floor(s.elemResist)) / 100) *
      (1 + job.perCooldownPercent * s.cdPct) *
      (1 + job.perResetChance * s.cdSkip) *
      (1 + job.perSummonDuration * Math.min(SUMMON_CAP, s.summon)) *
      (FINAL_ATTACK_CLASSES.has(job.class) ? 1 + (FINAL_ATTACK_PER_30 * input.artifact.finalAttack) / 30 : 1) *
      (ctx.level < 260 ? UNDER_260 : 1),
  };
  return { g, keep };
}

// MapleScouter's cubic Hermite curve at t (straight on past its ends), and where it reaches a value
// (by halving, over 0 to 400,000).
export function splineAt({ x, y, m }: Spline, t: number): number {
  const L = x.length;
  // Stryker disable next-line EqualityOperator: at the first point both give its value
  if (t < x[0]!) return y[0]! + (t - x[0]!) * m[0]!;
  // Stryker disable next-line EqualityOperator: at the last point both give its value
  if (t > x[L - 1]!) return y[L - 1]! + (t - x[L - 1]!) * Math.max(m[L - 1]!, 1e-9);
  // (t is within the points here, so some segment holds it: the start value is never kept)
  // Stryker disable next-line ArithmeticOperator: never kept
  let seg = L - 2;
  // Stryker disable next-line EqualityOperator,ArithmeticOperator: more rounds look past the last point and find nothing
  for (let i = 0; i < L - 1; i++)
    // Stryker disable next-line EqualityOperator,ConditionalExpression: at a point between two segments both give its value; the segments go in order, so t is past each start the loop reaches
    if (t >= x[i]! && t <= x[i + 1]!) {
      seg = i;
      break;
    }
  const h = x[seg + 1]! - x[seg]!;
  const s = (t - x[seg]!) / h;
  const [s2, s3] = [s * s, s * s * s];
  return (2 * s3 - 3 * s2 + 1) * y[seg]! + (s3 - 2 * s2 + s) * h * m[seg]! + (-2 * s3 + 3 * s2) * y[seg + 1]! + (s3 - s2) * h * m[seg + 1]!;
}
export function splineReach(spline: Spline, target: number): number {
  let [lo, hi] = [0, 400_000];
  // Stryker disable next-line EqualityOperator: one more halving moves the answer by far less than the score's rounding
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    // Stryker disable next-line EqualityOperator: exactly reaching the target at a halving point changes nothing (its value is the same)
    if (splineAt(spline, mid) < target) lo = mid;
    else hi = mid;
  }
  return lo;
}

// A cooldown table's bonus for s seconds at the score h0 (before cooldown): straight lines between its
// rows, held at its ends.
export function tableBonus(rows: CooldownRefs[string]["rows"], s: number, h0: number): number {
  // Stryker disable next-line EqualityOperator: at a row's own score both give its bonus
  const i = rows.findIndex((r) => r.h0 >= h0);
  if (i <= 0) return rows[i === 0 ? 0 : rows.length - 1]!.bonus[String(s)]!;
  const [a, b] = [rows[i - 1]!, rows[i]!];
  return a.bonus[String(s)]! + ((h0 - a.h0) / (b.h0 - a.h0)) * (b.bonus[String(s)]! - a.bonus[String(s)]!);
}
// What s seconds of skill cooldown add to the score's damage, the stronger the less: the class's own table
// if measured, else the measured classes' tables averaged, scaled by the class's own measured seconds
// (past 6 s: 6 s's, in proportion).
export function cooldownBonus(job: StatsJob, refs: CooldownRefs, s: number, h0: number): number {
  const col = Math.min(s, 6);
  const over = s / col;
  const own = refs[job.class];
  if (own) return over * tableBonus(own.rows, col, h0);
  const all = Object.values(refs);
  const shared = sum(all.map((r) => tableBonus(r.rows, col, h0) / r.norm2)) / all.length;
  const scale = job.cooldownScale ?? {};
  const known = Object.keys(scale).map(Number);
  let k = 1;
  if (known.length > 0) {
    // Stryker disable next-line EqualityOperator: at measured seconds, the line between its neighbours gives its own value
    const lo = Math.max(...known.filter((x) => x <= col), known[0]!);
    // Stryker disable next-line EqualityOperator: as above
    const hi = Math.min(...known.filter((x) => x >= col), known[known.length - 1]!);
    k = lo === hi ? scale[String(lo)]! : scale[String(lo)]! + ((col - lo) / (hi - lo)) * (scale[String(hi)]! - scale[String(lo)]!);
  }
  return over * k * shared;
}

// The score at 380% and 300% boss defense (null: the class has no curve), and the damage behind them.
export interface Score {
  damage: number;
  damage300: number;
  score380: number | null;
  score300: number | null;
}
export function statsScore(job: StatsJob, input: StatsInput, ctx: StatsContext, links: Readonly<Record<string, Readonly<Record<string, number>>>>, refs: CooldownRefs): Score {
  const { g, keep } = groups(job, input, ctx, links);
  // everything but the defense factor (1 − kept): 380%'s, and 300%'s, the same IED against a weaker guard,
  // without the sacred symbol buff's damage (380% only)
  const rest = job.scale * g.stat * g.flatAtk * g.atkPct * g.dmg * g.crit * g.cores * g.other;
  const damage = rest * g.def;
  const damage300 = rest * (1 - (keep * 3) / 3.8) * (ctx.sacred ? 1 - AUTHENTIC_DMG_PCT / 100 / g.dmg : 1);
  // (no score where the defense left nothing: too little IED typed for the class)
  const score = (d: number, spline: Spline | undefined) => {
    if (!spline || job.splineScale === null || !(d > 0)) return null;
    const s = Math.round(input.stats.cdSec);
    const h0 = splineReach(spline, d * job.splineScale);
    return Math.round(s <= 0 ? h0 : splineReach(spline, d * job.splineScale * (1 + cooldownBonus(job, refs, s, h0))));
  };
  return { damage, damage300, score380: score(damage, job.spline380), score300: score(damage300, job.spline300) };
}

// The game's Final Damage (%): the class's always-on, by Combat Orders, × a liberated Genesis weapon × the
// Ruin Force Shield × the Heroic worlds' bonus by level (sources multiply).
export function heroicBonus(level: number): number {
  return HEROIC_FD.find(([below]) => level < below)?.[1] ?? HEROIC_FD_TOP;
}
export function finalDamage(job: StatsJob, input: StatsInput, ctx: Pick<StatsContext, "level" | "heroic">): number {
  const tier = { none: 0, decent: 1, real: 2 }[input.combatOrders];
  const m = (1 + job.finalDamage[tier]! / 100) * on(input.liberation, GENESIS_FD) * on(input.ruinShield, RUIN_FORCE_SHIELD_FD) * (ctx.heroic ? 1 + heroicBonus(ctx.level) / 100 : 1);
  return (m - 1) * 100;
}

// A stat's total as the game shows it: base × (1 + %), rounded down, plus what % doesn't multiply.
export const statTotal = (t: { base: number; per: number; abs: number }, extraPct = 0): number => Math.floor(t.base * (1 + (t.per + extraPct) / 100)) + t.abs;

// The top of the game's damage range (the Stats window's): the weapon multiplier × the stat value × the
// ATT (or Magic ATT) total, rounded, then × (1 + Damage %) × (1 + Final Damage %), rounded down. The stat
// value: 4 × main + secondary (both secondaries for the LUK thieves); Xenon: 4 × (STR + DEX + LUK); Demon
// Avenger: its pure HP / 3.5 + 0.8 × the rest of its HP / 3.5 + STR. The familiars' stat % lines added in.
export type StatShape = "two" | "luk3" | "xenon" | "hp";
export function generalRange(job: StatsJob, input: StatsInput, shape: StatShape, ctx: Pick<StatsContext, "level" | "heroic">): number {
  const s = input.stats;
  const f = input.famPct;
  const [main, sub, third] = [statTotal(s.main, f.main), statTotal(s.sub, f.sub), statTotal(s.third, f.third)];
  let value: number;
  if (shape === "hp") {
    const pure = DA_PURE_HP.base + DA_PURE_HP.perLevel * ctx.level;
    value = Math.floor(pure / 3.5) + 0.8 * Math.floor((main - pure) / 3.5) + sub;
  } else if (shape === "xenon") value = 4 * (main + sub + third);
  else value = 4 * main + sub + (shape === "luk3" ? third : 0);
  const weapon = typeof job.weapon === "number" ? job.weapon : input.oneHanded ? job.weapon.oneHanded : job.weapon.twoHanded;
  const actual = Math.round((weapon * value * statTotal(s.atk)) / 100);
  return Math.floor(actual * (1 + s.dmg / 100) * (1 + finalDamage(job, input, ctx) / 100));
}
