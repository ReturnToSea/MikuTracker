import { describe, expect, it } from "vitest";
import answers from "../../test/fixtures/maplescouter-curves.json";
import curves from "../gameFigures/score-curves.json";
import jobFigures from "../gameFigures/stats-jobs.json";
import { cooldownRefs, curveSource, mapledoroJob, statsJob } from "../gameFigures/stats";
import { curveDamage, splineAt, splineReach } from "./stats";

// Our score for MapleScouter's damage (its answers leave out the cooldown bonus its score counts: 1 s here),
// as the app gives it: × the class's scale and our cooldown bonus, through the class's curve.
const scoreFor = (job: string, damage: number, guard: 380 | 300) => {
  const j = statsJob(job)!;
  const spline = guard === 380 ? j.spline380! : j.spline300!;
  return splineReach(spline, curveDamage(j, cooldownRefs(), damage, 1, spline)!);
};
const JOIN = curves.join;

describe("the score curves (v4.5.0): against MapleScouter's own answers", () => {
  it("the measured classes (Ren, Lethe): within 0.1% from ~60,000 to ~160,000, both guards", () => {
    const high = answers.answers.filter((a) => ["Ren", "Lethe"].includes(a.job) && a.s380 > 50000);
    expect(high.length).toBeGreaterThanOrEqual(9);
    for (const a of high) {
      expect(Math.abs(scoreFor(a.job, a.d380, 380) / a.s380 - 1), `${a.job} ${a.s380}`).toBeLessThan(0.001);
      expect(Math.abs(scoreFor(a.job, a.d300!, 300) / a.s300! - 1), `${a.job} ${a.s300} (300%)`).toBeLessThan(0.001);
    }
  });
  it("the measured classes' low end: within 0.5% under 25,000 (mapledoro's curve gave Ren +19% at 5,682)", () => {
    const low = answers.answers.filter((a) => ["Ren", "Lethe"].includes(a.job) && a.s380 < 25000);
    expect(low.length).toBeGreaterThanOrEqual(3);
    for (const a of low) expect(Math.abs(scoreFor(a.job, a.d380, 380) / a.s380 - 1), `${a.job} ${a.s380}`).toBeLessThan(0.005);
    // (the curve they replaced, for the record: far off)
    const ren = answers.answers.find((a) => a.job === "Ren" && a.s380 === 5682)!;
    const old = mapledoroJob("Ren")!;
    expect(splineReach(old.spline380!, curveDamage(old, cooldownRefs(), ren.d380, 1, old.spline380)!) / ren.s380 - 1).toBeGreaterThan(0.1);
  });
  it("classes fitted below 33,228 (Night Walker, Kanna, Hero): within 1% of their answers there", () => {
    const fitted = answers.answers.filter((a) => curveSource(a.job)?.source === "fitted" && a.s380 < JOIN);
    expect(new Set(fitted.map((a) => a.job))).toEqual(new Set(["Night Walker", "Kanna", "Hero"]));
    for (const a of fitted) expect(Math.abs(scoreFor(a.job, a.d380, 380) / a.s380 - 1), `${a.job} ${a.s380}`).toBeLessThan(0.01);
  });
  it("a fitted class's 300% low end (moved with its 380% fit): within 1% too, where an answer has its 300% score (Night Walker; review)", () => {
    const at300 = answers.answers.filter((a) => curveSource(a.job)?.source === "fitted" && a.s380 < JOIN && a.s300);
    expect(at300.length).toBeGreaterThanOrEqual(2);
    for (const a of at300) expect(Math.abs(scoreFor(a.job, a.d300!, 300) / a.s300! - 1), `${a.job} ${a.s300}`).toBeLessThan(0.01);
  });
  it("Zero (fitted): its mid curve, mapledoro's, within 0.1% of its answer at ~70,000", () => {
    const zero = answers.answers.find((a) => a.job === "Zero")!;
    expect(Math.abs(scoreFor("Zero", zero.d380, 380) / zero.s380 - 1)).toBeLessThan(0.001);
  });
});

describe("the score curves: facts that always hold", () => {
  const all = Object.entries(curves.classes) as [string, (typeof curves.classes)[keyof typeof curves.classes]][];
  it("every class with mapledoro's figures has curves; every curve starts at 0 and keeps rising", () => {
    const withCurve = Object.entries(jobFigures.jobs).filter(([, j]) => (j as { spline380?: unknown }).spline380).map(([n]) => n);
    expect(all.map(([n]) => n).sort()).toEqual(withCurve.sort());
    for (const [name, c] of all)
      for (const sp of [c.spline380, c.spline300]) {
        expect([sp.x[0], sp.y[0]], name).toEqual([0, 0]);
        // (sampled every 250: each value above the last)
        let last = 0;
        for (let t = 250; t <= 200000; t += 250) {
          const v = splineAt(sp, t);
          expect(v, `${name} at ${t}`).toBeGreaterThan(last);
          last = v;
        }
      }
  });
  it("a class not measured keeps mapledoro's curve past 33,228; below it, the shared shape × its point at 33,228 (× its fit)", () => {
    for (const [name, c] of all.filter(([, c]) => c.source !== "measured")) {
      const old = mapledoroJob(name)!;
      for (const [sp, was] of [[c.spline380, old.spline380!], [c.spline300, old.spline300!]] as const) {
        const k = sp.x.indexOf(JOIN);
        const scale = sp.y[k]! / was.y[was.x.indexOf(JOIN)]!;
        if (c.source === "mapledoro") expect(scale, name).toBeCloseTo(1, 9);
        // (past 33,228: mapledoro's points and slopes, kept to 10 digits)
        const j = was.x.indexOf(JOIN);
        expect(sp.x.slice(k + 1), name).toEqual(was.x.slice(j + 1));
        sp.y.slice(k + 1).forEach((v, i) => expect(v / was.y[j + 1 + i]!, name).toBeCloseTo(1, 9));
        sp.m.slice(k + 1).forEach((v, i) => expect(v / was.m[j + 1 + i]!, name).toBeCloseTo(1, 9));
        // (below: the damage per point a share of the average to 33,228, the same for every class)
        curves.shape.x.forEach((s, i) => expect((sp.y[sp.x.indexOf(s)]! / s / (sp.y[k]! / JOIN)) / curves.shape.share[i]!, `${name} at ${s}`).toBeCloseTo(1, 6));
      }
    }
  });
  it("the shared shape: the damage per point dips to ~77% of the average around 15,000 and is back to ~90% at 30,000 (MapleScouter's captures)", () => {
    const at = (s: number) => curves.shape.share[curves.shape.x.indexOf(s)]!;
    expect(at(15000)).toBeGreaterThan(0.75);
    expect(at(15000)).toBeLessThan(0.8);
    expect(at(5000)).toBeGreaterThan(at(15000));
    expect(at(30000)).toBeGreaterThan(0.88);
  });
});

describe("statsJob and the curves", () => {
  it("statsJob gives the class's curves from score-curves.json; mapledoroJob, mapledoro's own; the rest the same", () => {
    const [ours, theirs] = [statsJob("Ren")!, mapledoroJob("Ren")!];
    expect(ours.spline380).toEqual(curves.classes.Ren.spline380);
    expect(ours.spline300).toEqual(curves.classes.Ren.spline300);
    expect(theirs.spline380).toEqual(jobFigures.jobs.Ren.spline380);
    const { spline380: _a, spline300: _b, ...rest } = ours;
    const { spline380: _c, spline300: _d, ...was } = theirs;
    expect(rest).toEqual(was);
    // (the same object each time)
    expect(statsJob("Ren")).toBe(ours);
  });
  it("a job not in the figures: null, no source", () => {
    expect(statsJob("Made Up")).toBeNull();
    expect(mapledoroJob("Made Up")).toBeNull();
    expect(curveSource("Made Up")).toBeNull();
  });
  it("curveSource: measured for Ren and Lethe, fitted for a class with its own low-end answers, mapledoro else; the day rebuilt", () => {
    expect(curveSource("Ren")).toEqual({ source: "measured", date: curves.generated });
    expect(curveSource("Lethe")?.source).toBe("measured");
    expect(curveSource("Night Walker")?.source).toBe("fitted");
    expect(curveSource("Paladin")?.source).toBe("mapledoro");
  });
});
