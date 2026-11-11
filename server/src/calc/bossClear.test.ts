import { describe, expect, it } from "vitest";
import reference from "../../test/fixtures/boss-mapledoro.json";
import { bossesFor, bossFigures, PARTY_TAGS, phasesOf, SOLO_MIN, SOLO_TAGS } from "../gameFigures/bossClear";
import figures from "../gameFigures/boss-clear.json";
import jobFigures from "../gameFigures/stats-jobs.json";
import { cooldownRefs, statLinks, statsJob } from "../gameFigures/stats";
import { bossClear, clearInputs, scoreNeeded } from "./bossClear";
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
      const x = clearInputs(job, c.input as never, c.ctx, c.ascentLess, c.ctx, new Set(c.maxed), c.job === "Demon Avenger", statLinks(), cooldownRefs())!;
      all.forEach((b, i) => {
        const [rate, shown, tag, bossStat, need, lv, af, sf] = c.bosses[i] as [number, number, string, number, number, number, number, number];
        const got = bossClear(b, all, c.ctx.level, c.input.stats.arcane, c.input.stats.sacred, x);
        const at = `${c.job} ${b.difficulty} ${b.name}`;
        n++;
        expect(Math.abs(got.rate - rate), at).toBeLessThanOrEqual(5e-4 * rate);
        expect(Math.abs(got.shown - shown), at).toBeLessThanOrEqual(5e-4 * shown);
        if (!nearThreshold(rate)) expect(got.tag, at).toBe(tag);
        expect(Math.abs(got.bossStat - bossStat), at).toBeLessThanOrEqual(Math.max(1, 3e-4 * bossStat));
        expect(Math.abs(scoreNeeded(b, all, x) - need), at).toBeLessThanOrEqual(1);
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
  const at = (k: number) => bossClear(jupiter, all, 300, 0, 2000, times(k));
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
  });
  it("with a sheet whose defense leaves nothing at 380%: no boss clears", () => {
    const c = first;
    const low = { ...c.input, stats: { ...c.input.stats, ied: 0 } };
    expect(clearInputs(statsJob(c.job)!, low as never, c.ctx, c.ascentLess, c.ctx, new Set(), false, statLinks(), cooldownRefs())).toBeNull();
  });
});

describe("Mayrin (Challenger's own boss, v4.2.0)", () => {
  it("only on Challenger: Hard after Extreme Lotus, Normal after Hard Seren, as MapleScouter's list has them; its HP per phase", () => {
    expect(bossesFor(false)).toEqual(bossFigures());
    const ids = (list: readonly { name: string; difficulty: string }[]) => list.map((b) => `${b.name} ${b.difficulty}`);
    const withIt = ids(bossesFor(true));
    expect(withIt).toHaveLength(bossFigures().length + 2);
    expect(withIt.slice(withIt.indexOf("lotus Extreme"), withIt.indexOf("lotus Extreme") + 2)).toEqual(["lotus Extreme", "maerin Hard"]);
    expect(withIt.slice(withIt.indexOf("seren Hard"), withIt.indexOf("seren Hard") + 2)).toEqual(["seren Hard", "maerin Normal"]);
    expect(withIt.filter((id) => !id.startsWith("maerin"))).toEqual(ids(bossFigures())); // the rest as they were
    // a rebuilt list without the boss one goes after: a mistake, said, not hidden at the top
    expect(() => bossesFor(true, bossFigures().filter((b) => !(b.name === "seren" && b.difficulty === "Hard")))).toThrow("Mayrin Normal goes after seren Hard, which the boss figures no longer have");
    // KMS figures ×100,000,000, as the others': 591,500 and 2,843,750 a phase
    expect(phasesOf({ name: "maerin", difficulty: "Normal" })).toEqual([{ name: "Phase 1", hp: [59_150_000_000_000] }, { name: "Phase 2", hp: [59_150_000_000_000] }]);
    expect(phasesOf({ name: "maerin", difficulty: "Hard" })!.map((p) => p.hp)).toEqual([[284_375_000_000_000], [284_375_000_000_000]]);
  });

  it("its damage: 95% the 380% figure, 5% MapleScouter's Normal one (every core at 30), on the same scale", () => {
    // the same context for both: the Normal figure is the 380% one, so Mayrin's is too
    expect(inputsOf(first).mayrin).toBeCloseTo(inputsOf(first).d380, 6);
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

  it("gives back MapleScouter's clear rates for the owner's Ren it was worked out from (Lv. 278: 507% Normal, 87% Hard)", () => {
    // MapleScouter's figures for that Ren (KMS, Challenger mode): HEXA 405,499,155 and Normal 657,341,462 at 380%
    const ren = statsJob("Ren")!;
    const mayrin = 0.95 * 405_499_154.62 + 0.05 * 657_341_462.2;
    const x = { ...inputsOf(first), d380: 405_499_154.62, mayrin, ascent: 0, spline380: ren.spline380!, maxed: new Set<string>() };
    const all = bossesFor(true);
    const rate = (difficulty: string) => bossClear(all.find((b) => b.name === "maerin" && b.difficulty === difficulty)!, all, 278, 0, 0, x).rate;
    expect(Math.abs(rate("Normal") / 5.0695 - 1)).toBeLessThan(0.01);
    expect(Math.abs(rate("Hard") / 0.8745 - 1)).toBeLessThan(0.01);
    expect(bossClear(all.find((b) => b.name === "maerin" && b.difficulty === "Hard")!, all, 278, 0, 0, x).cannotEnter).toBe(true);
  });
});
