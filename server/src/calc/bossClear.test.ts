import { describe, expect, it } from "vitest";
import reference from "../../test/fixtures/boss-mapledoro.json";
import scouter from "../../test/fixtures/maplescouter-bosses.json";
import { type BossFigure, bossesFor, bossFigures, PARTY_TAGS, phasesOf, SOLO_MIN, SOLO_TAGS } from "../gameFigures/bossClear";
import figures from "../gameFigures/boss-clear.json";
import jobFigures from "../gameFigures/stats-jobs.json";
import { cooldownRefs, statLinks, statsJob } from "../gameFigures/stats";
import { bossClear, clearInputs, type ScouterSheet, scouterCorrection, scoreNeeded } from "./bossClear";
import { splineAt } from "./stats";

// Every tag's threshold: a rate this close to one can round to either side (the reference works from the
// rounded score, we from the unrounded damage: 0.035% apart at most).
const THRESHOLDS = [...Object.values(SOLO_TAGS), ...Object.values(PARTY_TAGS)].flat().map(([t]) => t);
const nearThreshold = (rate: number) => THRESHOLDS.some((t) => Math.abs(rate / t - 1) < 5e-4);

describe("bossClear against mapledoro's code (the reference)", () => {
  it("every job, random sheets, every boss: the same clear rate, tag, adjusted score, score needed and gaps", () => {
    const all = bossFigures();
    let n = 0;
    for (const c of reference.cases) {
      const job = statsJob(c.job)!;
      const x = clearInputs(job, c.input as never, c.ctx, c.ascentLess, c.normal, new Set(c.maxed), c.job === "Demon Avenger", statLinks(), cooldownRefs())!;
      all.forEach((b, i) => {
        const [rate, shown, tag, bossStat, need, lv, af, sf] = c.bosses[i] as [number, number, string, number, number, number, number, number];
        const got = bossClear(b, c.ctx.level, c.input.stats.arcane, c.input.stats.sacred, x);
        const at = `${c.job} ${b.difficulty} ${b.name}`;
        n++;
        expect(Math.abs(got.rate - rate), at).toBeLessThanOrEqual(5e-4 * rate);
        expect(Math.abs(got.shown - shown), at).toBeLessThanOrEqual(5e-4 * shown);
        if (!nearThreshold(rate)) expect(got.tag, at).toBe(tag);
        expect(Math.abs(got.bossStat - bossStat), at).toBeLessThanOrEqual(Math.max(1, 3e-4 * bossStat));
        expect(Math.abs(scoreNeeded(b, x) - need), at).toBeLessThanOrEqual(1);
        // each gap's damage, against its best
        const kept = (k: string) => 1 - (got.gaps.find((g) => g.kind === k)?.loss ?? 0);
        const tops = [1.2, b.arcane ? (b.name === "blackMage" ? 1.1 : 1.5) : 1, b.sacred ? 1.25 : 1];
        expect([kept("level"), kept("arcane"), kept("sacred")].map((v, j) => (v * tops[j]!).toFixed(9)), at).toEqual([lv, af, sf].map((v) => v.toFixed(9)));
        // all the gaps' loss together: what the three leave, against their best
        expect(got.loss, at).toBeCloseTo(1 - (lv / tops[0]!) * (af / tops[1]!) * (sf / tops[2]!), 9);
      });
    }
    expect(n).toBe(reference.cases.length * all.length);
    expect(reference.cases.length).toBeGreaterThan(100);
  });
});

const first = reference.cases[0]!;
const inputsOf = (c: (typeof reference.cases)[number]) => clearInputs(statsJob(c.job)!, c.input as never, c.ctx, c.ascentLess, c.ctx, new Set(c.maxed), c.job === "Demon Avenger", statLinks(), cooldownRefs())!;

describe("a party-only boss (Hard Jupiter, 3 at most) you could solo", () => {
  const all = bossFigures();
  const jupiter = all.find((b) => b.name === "jupiter" && b.difficulty === "Hard")!;
  // (no Ascent: the rate grows with the damage alone)
  const times = (k: number) => {
    const x = { ...inputsOf(first), ascent: 0 };
    return { ...x, d380: x.d380 * k, d300: x.d300 * k, kaling: x.kaling * k };
  };
  const at = (k: number) => bossClear(jupiter, 300, 0, 2000, times(k));
  // its party rate counts one of a full party of you: "1p Min Cut" (2.7) is you alone at the solo cut (0.9)
  const toSolo = 2.7 / 0.9;
  it("strong enough: shown on the solo scale, with the solo tags", () => {
    const base = at(1).rate;
    const strong = at(10 / base);
    expect(strong.rate).toBeCloseTo(10, 9);
    expect(strong.shown).toBeCloseTo(10 / toSolo, 9);
    expect(strong.tag).toBe("Easy");
    const weak = at(1.5 / base);
    expect([weak.shown, weak.tag]).toEqual([weak.rate, "2p Min Cut"]);
  });
  it("exactly at the solo cut counts as solo (\"Solo Min\")", () => {
    const base = at(1).rate;
    // (the damage nudged one step at a time until the solo rate lands on the cut exactly)
    const divisor = PARTY_TAGS[3]![0]![0] / SOLO_MIN;
    let exact = null;
    for (let n = -200; n <= 200 && !exact; n++) {
      const got = at(((SOLO_MIN * divisor) / base) * (1 + n * Number.EPSILON));
      if (got.rate / divisor === SOLO_MIN) exact = got;
    }
    expect(exact).not.toBeNull();
    expect([exact!.shown, exact!.tag]).toEqual([SOLO_MIN, "Solo Min"]);
  });
});

describe("the boss figures", () => {
  it("every job's curve gives every boss's cut a positive damage (so a clear rate never divides by 0 or less)", () => {
    for (const name of Object.keys(jobFigures.jobs)) {
      const job = statsJob(name)!;
      for (const b of bossFigures()) expect(splineAt((b.guard === 300 ? job.spline300 : job.spline380)!, (b.cut ?? b.partyCut)!), `${name} ${b.difficulty} ${b.name}`).toBeGreaterThan(0);
    }
  });
  it("each difficulty's own phases; a Champion's: the one it's built on; a boss without phase HP: none", () => {
    expect(phasesOf({ name: "seren", difficulty: "Normal" })).toEqual(figures.hp.seren_normal);
    expect(phasesOf({ name: "seren", difficulty: "Champion" })).toEqual(figures.hp.seren_hard);
    expect(figures.hp.seren_normal).not.toEqual(figures.hp.seren_hard);
    expect(phasesOf({ name: "zakum", difficulty: "Chaos" })).toBeNull();
    // every Champion: Seren, Black Mage, Verus Hilla and Lotus on Hard's, Kalos on Normal's
    for (const [name, base] of [["seren", "hard"], ["blackMage", "hard"], ["verusHilla", "hard"], ["lotus", "hard"], ["kalos", "normal"]] as const) {
      expect(phasesOf({ name, difficulty: "Champion" }), name).toEqual((figures.hp as Record<string, unknown>)[`${name}_${base}`]);
      expect(phasesOf({ name, difficulty: "Champion" }), name).not.toBeNull();
    }
  });
  it("with a sheet whose defense leaves nothing at 380%: no boss clears", () => {
    const c = first;
    const low = { ...c.input, stats: { ...c.input.stats, ied: 0 } };
    expect(clearInputs(statsJob(c.job)!, low as never, c.ctx, c.ascentLess, c.ctx, new Set(), false, statLinks(), cooldownRefs())).toBeNull();
  });
});

describe("Mayrin (Challenger's own boss, v4.2.0)", () => {
  it("only on Challenger, in MapleScouter's place for it (the figures' order); its HP per phase", () => {
    const ids = (list: readonly { name: string; difficulty: string }[]) => list.map((b) => `${b.name} ${b.difficulty}`);
    expect(ids(bossesFor(true))).toEqual(ids(bossFigures()));
    expect(ids(bossFigures()).filter((id) => id.startsWith("maerin"))).toEqual(["maerin Hard", "maerin Normal"]);
    expect(ids(bossesFor(false))).toEqual(ids(bossFigures()).filter((id) => !id.startsWith("maerin")));
    // KMS figures ×100,000,000, as the others': 591,500 and 2,843,750 a phase
    expect(phasesOf({ name: "maerin", difficulty: "Normal" })).toEqual([{ name: "Phase 1", hp: [59_150_000_000_000] }, { name: "Phase 2", hp: [59_150_000_000_000] }]);
    expect(phasesOf({ name: "maerin", difficulty: "Hard" })!.map((p) => p.hp)).toEqual([[284_375_000_000_000], [284_375_000_000_000]]);
  });

  it("its damage: 95% the 380% figure, 5% MapleScouter's Normal one (every core at 30), on the same scale", () => {
    // the same context for both: the Normal figure is the 380% one, so Mayrin's is too
    const same = clearInputs(statsJob(first.job)!, first.input as never, first.ctx, first.ascentLess, first.ctx, new Set(first.maxed), false, statLinks(), cooldownRefs())!;
    expect(same.mayrin).toBeCloseTo(same.d380, 6);
    // a Normal context with the cores' figure doubled (it multiplies the damage): the Normal figure twice the
    // 380% one, so Mayrin's 0.95 + 0.05 × 2 of it
    const job = statsJob(first.job)!;
    const doubled = { ...first.ctx, cores: first.ctx.cores * 2 };
    const x = clearInputs(job, first.input as never, first.ctx, first.ascentLess, doubled, new Set(first.maxed), false, statLinks(), cooldownRefs())!;
    expect(x.mayrin / x.d380).toBeCloseTo(1.05, 9);
    // off Challenger (no Normal context: Mayrin isn't shown) the Normal figure isn't worked out: Mayrin's is the 380% one
    const off = clearInputs(job, first.input as never, first.ctx, first.ascentLess, null, new Set(first.maxed), false, statLinks(), cooldownRefs())!;
    expect(off.mayrin).toBe(off.d380);
    expect(x.mayrin).toBeGreaterThan(x.d380);
  });

  it("Hard lets you in from level 280, Normal from 270", () => {
    const x = inputsOf(first);
    const mayrin = (d: string) => bossFigures().find((b) => b.name === "maerin" && b.difficulty === d)!;
    expect([bossClear(mayrin("Hard"), 279, 0, 0, x).cannotEnter, bossClear(mayrin("Hard"), 280, 0, 0, x).cannotEnter]).toEqual([true, false]);
    expect([bossClear(mayrin("Normal"), 269, 0, 0, x).cannotEnter, bossClear(mayrin("Normal"), 270, 0, 0, x).cannotEnter]).toEqual([true, false]);
  });
});

describe("the figures against MapleScouter's own rates (v4.4.0)", () => {
  const sheet = scouter.sheet as ScouterSheet;
  const job = statsJob(sheet.job)!;
  it("given MapleScouter's damage figures for a captured sheet, every boss's rate is MapleScouter's (within 1.5%: two classes' corrections averaged)", () => {
    for (const b of bossFigures()) expect(Math.abs(scouterCorrection(b, sheet, job.spline300!, job.spline380!)! - 1), `${b.difficulty} ${b.name}`).toBeLessThan(0.015);
    expect(Object.keys(sheet.rates)).toHaveLength(bossFigures().length);
  });
  it("Champion Black Mage is Hard's rate × 0.75 in the figures (MapleScouter's own, since v.272)", () => {
    const rate = (d: string) => bossFigures().find((b) => b.name === "blackMage" && b.difficulty === d)!.easyRate;
    expect(rate("Champion") / rate("Hard")).toBeCloseTo(0.75, 6);
  });
});

describe("scouterCorrection", () => {
  const sheet = scouter.sheet as ScouterSheet;
  const job = statsJob(sheet.job)!;
  const x = { d380: sheet.d380, d300: sheet.d300, kaling: sheet.kaling, mayrin: 0.95 * sheet.d380 + 0.05 * sheet.normal380, sacredBoost: 1, maxed: new Set<string>(), genesisPass: null, ascent: 0, spline300: job.spline300!, spline380: job.spline380! };
  const ours = (b: BossFigure) => bossClear(b, sheet.level, sheet.arcane, sheet.sacred, x).rate;
  const at = (b: BossFigure, rate: number) => scouterCorrection(b, { ...sheet, rates: { [`${b.name} ${b.difficulty}`]: rate } }, job.spline300!, job.spline380!);
  const seren = bossFigures().find((b) => b.name === "seren" && b.difficulty === "Hard")!;
  const kalos = bossFigures().find((b) => b.name === "kalos" && b.difficulty === "Extreme")!; // (party-only, 6)
  it("what the difficulty rate is multiplied by for our rate to be MapleScouter's (Mayrin with her own figure)", () => {
    expect(at(seren, ours(seren) * 1.1)).toBeCloseTo(1.1, 9);
    expect(at(seren, ours(seren) * 0.8)).toBeCloseTo(0.8, 9);
    const mayrin = bossFigures().find((b) => b.name === "maerin" && b.difficulty === "Normal")!;
    expect(at(mayrin, ours(mayrin) * 1.2)).toBeCloseTo(1.2, 9);
  });
  it("a party-only boss MapleScouter counts on the solo scale (its rate over 5.1 / 0.9): corrected on that scale, whichever is the smaller change", () => {
    const divisor = 5.1 / 0.9;
    expect(at(kalos, (ours(kalos) / divisor) * 1.03)).toBeCloseTo(1.03, 9);
    expect(at(kalos, ours(kalos) * 1.03)).toBeCloseTo(1.03, 9);
    // a boss with a solo mode: never
    expect(at(seren, (ours(seren) / divisor) * 1.03)).toBeCloseTo(1.03 / divisor, 9);
  });
  it("a boss MapleScouter has no rate for: none", () => {
    expect(scouterCorrection(seren, { ...sheet, rates: {} }, job.spline300!, job.spline380!)).toBeNull();
  });
});
