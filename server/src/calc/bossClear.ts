import type { StatsInput } from "@miku/shared";
import {
  ARCANE_CAP, ARCANE_GAP, ARCANE_GAP_FLOOR, ARCANE_TOP, ARCANE_TOP_BLACK_MAGE, ASCENT, type BossFigure, CHAMPION_BLACK_MAGE_VS_HARD, GENESIS_PASS, LEVEL_GAP, LEVEL_TOP, PARTY_TAGS, SACRED_GAP,
  KALING_ASCENT_WEIGHT, SACRED_GAP_FLOOR, SACRED_TOP, SOLO_MIN, SOLO_TAGS,
} from "../gameFigures/bossClear";
import type { CooldownRefs, StatsJob } from "../gameFigures/stats";
import { curveDamage, splineAt, splineReach, type StatsContext, statsScore } from "./stats";

// The boss clears (v4.1.0): MapleScouter's method, as chablades/mapledoro ported it from MapleScouter's page
// (a reference: this is our own, checked against MapleScouter's own answer for the owner's Ren). Pure.
//
// A boss sees the character's damage (the score's, before the curve turns it into the score) cut by the gaps:
// level, Arcane Force and Sacred Force, each against its best (the cuts are measured there). That damage
// over the damage the boss's cut stands for, × the boss's difficulty rate, then Ascent's timer bonus, is the
// clear rate; 1 = 100%: a solo clear at the cut. Its tag by the rate.

type Spline = { x: number[]; y: number[]; m: number[] };
type Links = Readonly<Record<string, Readonly<Record<string, number>>>>;
// What the character brings, worked out from its Stats page (services/stats.ts).
export interface ClearInputs {
  d380: number; // the damage the 380% score stands for (the curve's: unrounded), without any Sacred symbol's bonus
  d300: number; // and the 300% score's
  kaling: number; // Kaling's own figure (380%, without the symbol)
  sacredBoost: number; // what a maxed Sacred symbol's +20% multiplies the 380% damage by
  maxed: ReadonlySet<string>; // the bosses whose own Sacred symbol is maxed (by MapleScouter's id)
  genesisPass: number | null; // what the Genesis Pass's buff multiplies the damage by (its 300% figure's; null: not on)
  ascent: number; // the Ascent core's share of the damage (0: none)
  spline300: Spline;
  spline380: Spline;
}
export interface Gap {
  kind: "level" | "arcane" | "sacred";
  you: number;
  boss: number; // its requirement
  full: number; // where the damage is at its best
  loss: number; // the damage lost against the best (0–1)
}
export interface BossClear {
  rate: number; // the clear rate, a party-only boss's on its party scale (what MapleScouter's filter reads)
  shown: number; // the rate shown: a party-only boss you could solo, on the solo scale
  tag: string;
  partyOnly: boolean;
  bossStat: number; // the score as this boss sees it (gaps and buffs in)
  gaps: Gap[];
  loss: number; // all the gaps' loss together (0–1)
  cannotEnter: boolean;
}

const pick = (value: number, rows: readonly (readonly [number, number | string])[]) => rows.find(([min]) => value >= min)?.[1];
export const levelGap = (level: number, boss: number): number => LEVEL_GAP[String(Math.max(-40, Math.min(LEVEL_TOP.lead, level - boss)))]! / 100;
export const arcaneGap = (arcane: number, boss: number): number => ((pick((arcane / boss) * 100, ARCANE_GAP) as number | undefined) ?? ARCANE_GAP_FLOOR) / 100;
export const sacredGap = (sacred: number, boss: number): number => ((pick(sacred - boss, SACRED_GAP) as number | undefined) ?? SACRED_GAP_FLOOR) / 100;

// The difficulty rate: Champion Black Mage's from Hard's (MapleScouter's own is ×1.25: a sign mistake).
export function easyRate(b: BossFigure, all: readonly BossFigure[]): number {
  if (b.name !== "blackMage" || b.difficulty !== "Champion") return b.easyRate;
  return all.find((x) => x.name === "blackMage" && x.difficulty === "Hard")!.easyRate * CHAMPION_BLACK_MAGE_VS_HARD;
}
// Ascent's 3 uses are timed for a full fight: a boss that dies sooner gets more of them per HP.
export function ascentBonus(b: BossFigure, preTimer: number, ascent: number): number {
  const divisor = b.name === "lucid" && b.difficulty === "Hard" ? ASCENT.hardLucid : Math.min(ASCENT.uses, Math.ceil(ASCENT.minutes / preTimer / ASCENT.perUse));
  return 1 + ((ASCENT.uses * ascent) / divisor - ascent || 0);
}
// A party-only boss's tags and its solo scale: its rate counts one member of a full party of you, so
// the first tag ("1p": you alone) over 0.9 turns it into a solo rate.
const partyRows = (limit: number) => PARTY_TAGS[limit] ?? PARTY_TAGS[6]!;
const soloDivisor = (limit: number) => partyRows(limit)[0]![0] / SOLO_MIN;

// What a boss sees: the gaps and the damage they leave (its defense's figure, its own symbol, the Genesis
// Pass's buff, all cut by the gaps).
function seen(b: BossFigure, level: number, arcane: number, sacred: number, x: ClearInputs): { gaps: Gap[]; kept: number; damage: number } {
  const genesis = x.genesisPass !== null && GENESIS_PASS.bosses.has(b.name);
  const af = Math.min(arcane + (genesis ? GENESIS_PASS.arcane : 0), ARCANE_CAP);
  const arcTop = b.name === "blackMage" ? ARCANE_TOP_BLACK_MAGE : ARCANE_TOP;
  const gaps: Gap[] = [{ kind: "level", you: level, boss: b.level, full: b.level + LEVEL_TOP.lead, loss: 1 - levelGap(level, b.level) / LEVEL_TOP.damage }];
  if (b.arcane) gaps.push({ kind: "arcane", you: af, boss: b.arcane, full: Math.ceil(b.arcane * arcTop - 1e-9), loss: 1 - arcaneGap(af, b.arcane) / arcTop });
  if (b.sacred) gaps.push({ kind: "sacred", you: sacred, boss: b.sacred, full: b.sacred + SACRED_TOP.lead, loss: 1 - sacredGap(sacred, b.sacred) / SACRED_TOP.damage });
  const kept = gaps.reduce((k, g) => k * (1 - g.loss), 1);
  // (the Genesis Pass's: against Extreme Lotus too, at 380%, the same)
  const raw = (b.guard === 300 ? x.d300 : (b.name === "kaling" ? x.kaling : x.d380) * (x.maxed.has(b.name) ? x.sacredBoost : 1)) * (genesis ? x.genesisPass! : 1);
  return { gaps, kept, damage: raw * kept };
}
// The clear rate for the damage a boss sees, and Ascent's bonus in it.
function rateAt(b: BossFigure, all: readonly BossFigure[], damage: number, cutDamage: number, ascentShare: number): { rate: number; ascent: number } {
  // (mapledoro's guard for a cut below 0 isn't needed: every job's curve gives every cut a positive damage, a test checks)
  const preTimer = (damage / cutDamage) * easyRate(b, all);
  const ascent = ascentBonus(b, preTimer, ascentShare);
  return { rate: preTimer * ascent || 0, ascent };
}
const splineOf = (b: BossFigure, x: ClearInputs) => (b.guard === 300 ? x.spline300 : x.spline380);
const cutOf = (b: BossFigure, x: ClearInputs) => splineAt(splineOf(b, x), (b.cut ?? b.partyCut)!);

export function bossClear(b: BossFigure, all: readonly BossFigure[], level: number, arcane: number, sacred: number, x: ClearInputs): BossClear {
  const { gaps, kept, damage } = seen(b, level, arcane, sacred, x);
  const { rate, ascent } = rateAt(b, all, damage, cutOf(b, x), x.ascent);
  const partyOnly = b.cut === null;
  let shown = rate;
  let tag = String(pick(rate, SOLO_TAGS[b.partyLimit] ?? SOLO_TAGS[6]!) ?? "Impossible");
  if (partyOnly) {
    const solo = rate / soloDivisor(b.partyLimit);
    if (solo >= SOLO_MIN) {
      shown = solo;
      tag = String(pick(solo, SOLO_TAGS[1]!));
    } else tag = String(pick(rate, partyRows(b.partyLimit)) ?? "Impossible");
  }
  const cannotEnter = level < b.entryLevel;
  return { rate, shown, tag: cannotEnter ? "Can't Enter" : tag, partyOnly, bossStat: Math.round(splineReach(splineOf(b, x), damage * ascent)), gaps, loss: 1 - kept, cannotEnter };
}

// The score that clears this boss exactly (100%; a party-only boss's on the solo scale), as this boss would
// see it: the damage that takes, found by halving over a million times less to a million times more than its
// cut's (only the clear rate in the loop; the score once at the end).
export function scoreNeeded(b: BossFigure, all: readonly BossFigure[], x: ClearInputs): number {
  const cut = cutOf(b, x);
  const solo = b.cut === null ? soloDivisor(b.partyLimit) : 1;
  let [lo, hi] = [Math.log(cut * 1e-6), Math.log(cut * 1e6)];
  // Stryker disable next-line EqualityOperator: past ~53 halvings the range is under a double's precision, so a 61st changes nothing
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    // Stryker disable next-line EqualityOperator: only a mid at exactly 100% differs, and both ends then close on that same point
    if (rateAt(b, all, Math.exp(mid), cut, x.ascent).rate / solo < 1) lo = mid;
    else hi = mid;
  }
  const d = Math.exp(hi);
  return Math.round(splineReach(splineOf(b, x), d * rateAt(b, all, d, cut, x.ascent).ascent));
}

// What the boss clears need from a sheet: the damage the scores stand for without any
// Sacred symbol's bonus, what a maxed symbol multiplies it by, Kaling's figure, the Ascent core's share and
// the Genesis Pass's buff (ascentLess: the context with the Ascent core at 0). null: no curve, or no damage.
export function clearInputs(job: StatsJob, input: StatsInput, ctx: StatsContext, ascentLess: StatsContext, maxed: ReadonlySet<string>, hpMain: boolean, links: Links, refs: CooldownRefs): ClearInputs | null {
  const plain = { ...ctx, sacred: false };
  const s = statsScore(job, input, plain, links, refs);
  const d380 = curveDamage(job, refs, s.damage, input.stats.cdSec, job.spline380);
  if (d380 === null) return null;
  // (the 300% damage is higher, so it has its figure whenever the 380% one does)
  const d300 = curveDamage(job, refs, s.damage300, input.stats.cdSec, job.spline300)!;
  const sacredBoost = statsScore(job, input, { ...plain, sacred: true }, links, refs).damage / s.damage;
  const ascent = s.damage / statsScore(job, input, { ...ascentLess, sacred: false }, links, refs).damage - 1;
  const A = job.kalingAscent ?? ascent;
  // (the Genesis Pass's buff, as stats on the sheet, against 300% bosses)
  let genesisPass: number | null = null;
  if (input.buffs.genepass) {
    const g = structuredClone(input);
    g.stats.atk.base += GENESIS_PASS.att;
    g.stats.main.base += hpMain ? GENESIS_PASS.daHp : GENESIS_PASS.allStat;
    g.stats.sub.base += GENESIS_PASS.allStat;
    g.stats.third.base += GENESIS_PASS.allStat;
    g.stats.boss += GENESIS_PASS.boss;
    g.stats.ied = 100 - (100 - g.stats.ied) * (1 - GENESIS_PASS.ied / 100);
    genesisPass = statsScore(job, g, plain, links, refs).damage300 / s.damage300;
  }
  return { d380, d300, kaling: d380 * ((1 + KALING_ASCENT_WEIGHT * ascent) / (1 + KALING_ASCENT_WEIGHT * A)), sacredBoost, maxed, genesisPass, ascent, spline300: job.spline300!, spline380: job.spline380! };
}
