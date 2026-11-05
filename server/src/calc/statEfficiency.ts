import { COOLDOWN_SECONDS, type StatsInput } from "@miku/shared";
import type { CooldownRefs, StatsJob } from "../gameFigures/stats";
import { curveDamage, type StatsContext, statsScore } from "./stats";

// Stat efficiency (v4.1.0): what each stat is worth to a character, in main stat, worked out from its Stats
// page, the way MapleScouter's "Detail Eff." table is (and mapledoro's rebuild of it): add one of a stat to
// the sheet, see how much the damage grows, and divide by what one main stat adds. Against 380% bosses (the
// gear pages' ignore defense has its own 300% value); within 0.1% of MapleScouter's table for the owner's
// Ren (tempdata/v41/RESEARCH.md). The gear pages' stat values start from these. Pure.

type Links = Readonly<Record<string, Readonly<Record<string, number>>>>;
export interface Efficiency {
  // in main stat (Demon Avenger: HP)
  bossDmg: number; // 1% boss (or plain) damage
  att: number; // 1 ATT (Magic ATT)
  attPct: number; // 1% ATT
  critDmg: number; // 1% crit damage
  ied300: number; // 1% IED: one more percent of the defense left, against 300% bosses
  ied380: number; // and 380%
  mainPct: number; // 1% main stat
  mainFlat: number; // 1 main stat that % doesn't multiply
  sub: number; // 1 secondary stat (the gear pages' secondary stat ratio)
  subPct: number; // 1% secondary stat
  third: number | null; // the third stat's (the LUK thieves' second secondary, Xenon's LUK; null: none)
  thirdPct: number | null;
  allStatPct: number; // 1% all stats (each stat the job has; a Demon Avenger's HP isn't one)
  fdPer100: number; // % final damage from 100 main stat (the gear pages' "per 100 score")
  cooldown: Record<(typeof COOLDOWN_SECONDS)[number], number>; // % final damage a hat's 2–6 s of skill cooldown add (from the sheet's seconds without the equipped hat's)
}

// One stat changed on a copy of the sheet.
type Nudge = (s: StatsInput["stats"]) => void;
const add = (k: "main" | "sub" | "third" | "atk", part: "base" | "per" | "abs", n = 1): Nudge => (s) => {
  s[k][part] += n;
};
const plus = (k: "boss" | "critDmg", n = 1): Nudge => (s) => {
  s[k] += n;
};
// (1% IED more: 1% of the defense still left is ignored too)
const ied: Nudge = (s) => {
  s.ied = 100 - (100 - s.ied) * 0.99;
};

// null: nothing to divide by (the defense left nothing at 380%: one main stat adds no damage). `hatSec`:
// the equipped hat's cooldown seconds, already in the sheet's (the gear pages' values are a hat's worth).
export function statEfficiency(job: StatsJob, input: StatsInput, ctx: StatsContext, links: Links, refs: CooldownRefs, hasThird: boolean, hpMain: boolean, hatSec = 0): Efficiency | null {
  const base = statsScore(job, input, ctx, links, refs);
  if (!(base.damage > 0)) return null;
  const gain = (nudges: Nudge[], figure: "damage" | "damage300" = "damage") => {
    const sheet = structuredClone(input);
    for (const n of nudges) n(sheet.stats);
    return statsScore(job, sheet, ctx, links, refs)[figure] / base[figure] - 1;
  };
  const main = gain([add("main", "base")]);
  const main300 = gain([add("main", "base")], "damage300");
  const inMain = (nudges: Nudge[]) => gain(nudges) / main;
  const third = hasThird ? inMain([add("third", "base")]) : null;
  // (a hat's cooldown worth: what the curve gives without the hat's seconds, and with that many)
  const curve = (cd: number) => curveDamage(job, refs, base.damage, cd, job.spline380);
  const without = Math.max(0, input.stats.cdSec - hatSec);
  // (every job has a curve, and the damage is above 0 here)
  const now = curve(without)!;
  return {
    bossDmg: inMain([plus("boss")]),
    att: inMain([add("atk", "base")]),
    attPct: inMain([add("atk", "per")]),
    critDmg: inMain([plus("critDmg")]),
    ied300: gain([ied], "damage300") / main300,
    ied380: inMain([ied]),
    mainPct: inMain([add("main", "per")]),
    mainFlat: inMain([add("main", "abs")]),
    sub: inMain([add("sub", "base")]),
    subPct: inMain([add("sub", "per")]),
    third,
    thirdPct: hasThird ? inMain([add("third", "per")]) : null,
    allStatPct: inMain([...(hpMain ? [] : [add("main", "per")]), add("sub", "per"), ...(hasThird ? [add("third", "per")] : [])]),
    fdPer100: gain([add("main", "base", 100)]) * 100,
    cooldown: Object.fromEntries(COOLDOWN_SECONDS.map((s) => [s, (curve(without + s)! / now - 1) * 100])) as Efficiency["cooldown"],
  };
}
