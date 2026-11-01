import { describe, expect, it } from "vitest";
import { coreSteps } from "../gameFigures/hexa";
import figures from "../gameFigures/hexa-jobs.json";
import mapledoro from "../../test/fixtures/hexa-mapledoro.json";
import { CORE_KEYS, type CurveKey, type HexaModel, hexaDamage, stairs } from "./hexaDamage";

type Job = { class: string; cores: Record<string, number> };
const jobs = Object.values(figures.jobs as Record<string, Job>);
const model = (j: Job): HexaModel => ({ cores: j.cores, curves: figures.curves as Record<CurveKey, number[]>, steps: coreSteps(j.class) });
const at = (levels: number[]) => Object.fromEntries(CORE_KEYS.map((c, i) => [c, levels[i]!])) as Record<(typeof CORE_KEYS)[number], number>;

describe("hexaDamage: a job's damage at given core levels, as a share of every core at 30", () => {
  it("gives mapledoro's engine's figures for every job (each core alone at seven levels, and 18 mixes of levels), but where a core is worth more at 0 than at 30", () => {
    const cases = mapledoro.classes as Record<string, { levels: number[]; damage: number }[]>;
    let checked = 0;
    for (const j of jobs) {
      const m = model(j);
      // (Lynn's and Mo Xuan's 3rd Common node: worth nothing here, more at 0 there)
      const above = CORE_KEYS.flatMap((c, i) => (j.cores[`${c}=0`]! > 1 ? [i] : []));
      for (const { levels, damage } of cases[j.class]!) {
        if (above.some((i) => levels[i]! < 30)) continue;
        expect(hexaDamage(m, at(levels))).toBeCloseTo(damage, 9);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(53 * (3 + 15 + 12 * 7) - 2 * 30);
  });

  it("a core the figures put above its level 30 at level 0 (Lynn's 3rd Common node) is worth nothing: no level changes the damage", () => {
    const lynn = jobs.find((j) => j.class === "lynn")!;
    expect(lynn.cores["generalCore3=0"]).toBeGreaterThan(1);
    const m = model(lynn);
    const base = CORE_KEYS.map(() => 12);
    const values = [0, 1, 15, 29, 30].map((L) => hexaDamage(m, at(base.map((v, i) => (CORE_KEYS[i] === "generalCore3" ? L : v)))));
    for (const v of values) expect(v).toBeCloseTo(values[0]!, 12);
  });


  it("every core at 30 is 1; every core at 0 is the figures' own all-cores-at-0 figure: exactly where the cores just add up (Ren), within 2.5% where they interact (the model's own limit, the same in mapledoro's engine)", () => {
    for (const j of jobs) {
      const m = model(j);
      expect(hexaDamage(m, at(CORE_KEYS.map(() => 30)))).toBeCloseTo(1, 12);
      expect(Math.abs(hexaDamage(m, at(CORE_KEYS.map(() => 0))) / j.cores["allCores=0"]! - 1)).toBeLessThan(0.025);
    }
    const ren = jobs.find((j) => j.class === "ren")!;
    expect(hexaDamage(model(ren), at(CORE_KEYS.map(() => 0)))).toBeCloseTo(ren.cores["allCores=0"]!, 12);
  });

  it("a core measured at a level gives its own figure there, the rest at 30 (Ren's Lotus Flower at 12)", () => {
    const ren = jobs.find((j) => j.class === "ren")!;
    expect(hexaDamage(model(ren), at(CORE_KEYS.map((c) => (c === "generalCore3" ? 12 : 30))))).toBeCloseTo(ren.cores["generalCore3=12"]!, 12);
  });
});

// Made-up figures for the paths no job's figures take: every core at 0 worth 0.9 (so with the rest at 30, a
// core alone gives 1 − 0.1 × (1 − kept)), each kind of core with its own curve.
const SYN_CURVES: Record<CurveKey, number[]> = {
  skill1: Array.from({ length: 31 }, (_, L) => L / 30),
  skill2: Array.from({ length: 31 }, (_, L) => (L / 30) ** 2),
  mastery: Array.from({ length: 31 }, (_, L) => Math.sqrt(L / 30)),
  // (a straight line but at 3: Ren's shape and a straight line agree at every other level)
  rein: Array.from({ length: 31 }, (_, L) => (L === 3 ? 0.2 : L / 30)),
  general2: Array.from({ length: 31 }, (_, L) => (L / 30) ** 3),
  general3: Array.from({ length: 31 }, (_, L) => (L / 30) ** 0.25),
};
const synthetic = (extra: Record<string, number> = {}, steps: HexaModel["steps"] = {}): HexaModel => ({ cores: { ...Object.fromEntries(CORE_KEYS.map((c) => [`${c}=0`, 0.9])), ...extra }, curves: SYN_CURVES, steps });
// a core's share kept at L, the rest at 30, read back from the damage
const keptOf = (m: HexaModel, c: (typeof CORE_KEYS)[number], L: number) => 1 - (1 - hexaDamage(m, at(CORE_KEYS.map((k) => (k === c ? L : 30))))) / 0.1;

describe("hexaDamage on made-up figures: how levels not measured are filled in", () => {
  it("a core not measured even at level 1: Ren's curve for its kind (skill nodes', Mastery, Boost, Sol Hecate, the 3rd common node)", () => {
    const m = synthetic();
    const kinds: [(typeof CORE_KEYS)[number], CurveKey][] = [["skillCore1", "skill1"], ["skillCore2", "skill2"], ["masteryCore3", "mastery"], ["reinCore2", "rein"], ["generalCore2", "general2"], ["generalCore3", "general3"]];
    for (const [c, curve] of kinds) expect(keptOf(m, c, 7), c).toBeCloseTo(SYN_CURVES[curve][7]!, 12);
    // level 30: all of it; 0: none
    expect([keptOf(m, "skillCore2", 30), keptOf(m, "skillCore2", 0)]).toEqual([expect.closeTo(1, 12), expect.closeTo(0, 12)]);
  });

  it("a Mastery core or the 3rd common node measured at 1 and 15: a straight line between (no steps); the others: Ren's curve", () => {
    // kept at 1: 0.1, at 15: 0.5 (figures 0.91 and 0.95)
    const m = synthetic({ "masteryCore2=1": 0.91, "masteryCore2=15": 0.95, "generalCore3=1": 0.91, "generalCore3=15": 0.95, "skillCore2=1": 0.91, "skillCore2=15": 0.95 });
    // level 8: 0.1 + 0.4 × 7 / 14 = 0.3
    expect(keptOf(m, "masteryCore2", 8)).toBeCloseTo(0.3, 12);
    expect(keptOf(m, "generalCore3", 8)).toBeCloseTo(0.3, 12);
    // a skill node: along Ren's (made-up) curve, (L / 30)²: 0.1 + 0.4 × (64 − 1) / (225 − 1)
    expect(keptOf(m, "skillCore2", 8)).toBeCloseTo(0.1 + (0.4 * (64 - 1)) / (225 - 1), 12);
    // with the wiki's steps (here every level from 2, as many as the levels: an even rise, no fit), still a straight line
    const stepped = synthetic({ "masteryCore2=1": 0.91, "masteryCore2=15": 0.95 }, { masteryCore2: [5, 10] });
    expect(keptOf(stepped, "masteryCore2", 8)).toBeCloseTo(0.3, 12);
  });

  it("a Boost core with only 1 and 15 measured follows Ren's curve even when a straight line fits them (too few levels to tell)", () => {
    // kept: 1 → 1/30, 15 → 0.5: exactly on a straight line to 30, and on the (made-up) curve but at 3
    const m = synthetic({ "reinCore2=1": 0.9 + 0.1 / 30, "reinCore2=15": 0.95 });
    // level 3 along the curve: 1/30 + (0.2 − 1/30) / (0.5 − 1/30) × (0.5 − 1/30)
    expect(keptOf(m, "reinCore2", 3)).toBeCloseTo(0.2, 12);
  });

  it("a Boost core with more levels: a straight line where it predicts the core's own inner levels better; Ren's curve when both do as well", () => {
    const line = (L: number) => 0.9 + (0.1 * L) / 30; // the figure for kept = L / 30
    // measured 1, 5, 10 on a straight line: both shapes predict 5 and 10 exactly (the curve's only bend is at 3), a tie: Ren's curve
    const tie = synthetic({ "reinCore2=1": line(1), "reinCore2=5": line(5), "reinCore2=10": line(10) });
    expect(keptOf(tie, "reinCore2", 3)).toBeCloseTo(1 / 30 + ((0.2 - 1 / 30) / (5 / 30 - 1 / 30)) * (4 / 30), 12);
    // measured 1, 7, 10, 12 on a straight line, the curve bent at 7 instead: it predicts 7 badly, so a straight line: level 8 is 8/30
    const better: HexaModel = { ...synthetic({ "reinCore2=1": line(1), "reinCore2=7": line(7), "reinCore2=10": line(10), "reinCore2=12": line(12) }), curves: { ...SYN_CURVES, rein: Array.from({ length: 31 }, (_, L) => (L === 7 ? 0.5 : L / 30)) } };
    expect(keptOf(better, "reinCore2", 8)).toBeCloseTo(8 / 30, 12);
  });

  it("a measured pair named the other way round is the same pair", () => {
    const grid = { "0,0": 0.8, "0,1": 0.85, "1,0": 0.86, "1,1": 0.9 };
    const named = (first: string, second: string, swap: boolean) =>
      Object.fromEntries(Object.entries(grid).map(([k, v]) => {
        const [x, y] = k.split(",");
        return [swap ? `${second}=${y},${first}=${x}` : `${first}=${x},${second}=${y}`, v];
      }));
    const a = synthetic(named("masteryCore1", "masteryCore2", false));
    const b = synthetic(named("masteryCore1", "masteryCore2", true));
    // named both ways in the same figures: still one complete pair
    const both = Object.entries(named("masteryCore1", "masteryCore2", false)).map(([k, v], i) => (i % 2 ? Object.entries(named("masteryCore1", "masteryCore2", true))[i]! : [k, v]));
    const mixed = synthetic(Object.fromEntries(both));
    const levels = at(CORE_KEYS.map((c) => (c === "masteryCore1" ? 0 : c === "masteryCore2" ? 1 : 30)));
    // the pair's own figure where both are at 0 / 1
    expect(hexaDamage(a, levels)).toBeCloseTo(0.85, 12);
    expect(hexaDamage(b, levels)).toBeCloseTo(0.85, 12);
    expect(hexaDamage(mixed, levels)).toBeCloseTo(0.85, 12);
  });

  it("a pair with a core worth nothing (its figure at 0 above 1) still gives a number: that core counts as all of it at any level", () => {
    const m = synthetic({ "masteryCore1=0": 1.002, "masteryCore1=0,masteryCore2=0": 0.9, "masteryCore1=0,masteryCore2=1": 0.92, "masteryCore1=1,masteryCore2=0": 0.9, "masteryCore1=1,masteryCore2=1": 0.92 });
    const d = hexaDamage(m, at(CORE_KEYS.map((c) => (c === "masteryCore1" ? 5 : c === "masteryCore2" ? 0 : 30))));
    expect(Number.isFinite(d)).toBe(true);
  });

  it("multiplier cores: only with every core's alone-figure; a core clearly above the rest multiplies a share of the damage", () => {
    // alone-figures q: share = (1 − (q − 0.5) / 0.1) / (1 − q); every core on a share of 0.1 (q = 5.9 / 9.9)
    // but Boost 1 on 0.8 (q = 5.2 / 9.2), which multiplies
    const none = 0.5;
    const only = Object.fromEntries(CORE_KEYS.map((c) => [`only ${c}`, c === "reinCore1" ? 5.2 / 9.2 : 5.9 / 9.9]));
    const full = synthetic({ "allCores=0": none, ...only });
    const levels = at(CORE_KEYS.map((c) => (c === "reinCore1" ? 0 : c === "reinCore2" ? 0 : 30)));
    // without one alone-figure: no multipliers, each core's loss adds up: 1 − 0.1 − 0.1
    const partial = synthetic({ "allCores=0": none, ...only, "only generalCore3": undefined as unknown as number });
    delete (partial.cores as Record<string, number>)["only generalCore3"];
    expect(hexaDamage(partial, levels)).toBeCloseTo(0.8, 12);
    // with all: Boost 1 multiplies its share 0.8, Boost 2 adds: (1 − 0.1)(1 − 0.8 × 0.1) − (1 − 0.8) × 0.1 = 0.808
    expect(hexaDamage(full, levels)).toBeCloseTo(0.808, 12);
    expect(hexaDamage(full, levels)).not.toBeCloseTo(0.8, 6);
    // a core whose alone-figure is all of it (1): no share to work out, never a division by zero (here it
    // would be +∞, a "multiplier"): every other core alike, so none multiplies and the losses add up
    const whole = synthetic({ "allCores=0": 0.95, ...Object.fromEntries(CORE_KEYS.map((c) => [`only ${c}`, c === "reinCore3" ? 1 : 0.96])) });
    expect(hexaDamage(whole, levels)).toBeCloseTo(0.8, 12);
  });
});

describe("every job's figures, as the app reads them", () => {
  it("no level lowers a job's damage (each core alone, the rest at 30), but two known quirks of MapleScouter's first-level figures; never anything but a number", () => {
    const lower: string[] = [];
    for (const j of jobs) {
      const m = model(j);
      for (const c of CORE_KEYS) {
        let last = -Infinity;
        for (let L = 0; L <= 30; L++) {
          const d = hexaDamage(m, at(CORE_KEYS.map((k) => (k === c ? L : 30))));
          expect(Number.isFinite(d), `${j.class} ${c} ${L}`).toBe(true);
          // (the figures' rounding: a millionth)
          if (d < last - 1e-6) lower.push(`${j.class} ${c} ${L - 1}→${L}`);
          last = d;
        }
      }
    }
    // Ark's 3rd Common node (−0.30%) and Night Lord's 4th Mastery node (−0.53%) at their first level: the
    // order jumps past them (calc/hexa.ts buildOrder); a figures refresh bringing another is worth a look
    expect(lower).toEqual(["ark generalCore3 0→1", "night_lord masteryCore4 0→1"]);
  });
});

describe("stairs: the wiki's steps fitted to a core's measured levels", () => {
  it("fits y = s L + J (steps so far) exactly when the levels follow it (s 0.01, J 0.05, steps at 6 and 12)", () => {
    const f = (L: number) => 0.2 + 0.01 * L + 0.05 * [6, 12].filter((x) => x <= L).length;
    const fit = stairs([6, 12], [1, 3, 7, 13, 20, 30].map((L) => [L, f(L)]))!;
    // the shape, without the constant: differences match
    expect(fit(20) - fit(1)).toBeCloseTo(f(20) - f(1), 12);
    expect(fit(7) - fit(5)).toBeCloseTo(0.07, 12);
  });
  it("five levels are enough (two to spare)", () => {
    const f = (L: number) => 0.01 * L + 0.05 * [6, 12].filter((x) => x <= L).length;
    const fit = stairs([6, 12], [1, 7, 13, 20, 30].map((L) => [L, f(L)]))!;
    expect(fit(20) - fit(1)).toBeCloseTo(f(20) - f(1), 12);
  });
  it("none without steps, with fewer than five levels, or when steps every level look like an even rise", () => {
    const pts: [number, number][] = [[1, 0.1], [5, 0.3], [15, 0.6], [25, 0.9], [30, 1]];
    expect(stairs(undefined, pts)).toBeNull();
    expect(stairs([10], pts.slice(1))).toBeNull();
    expect(stairs(Array.from({ length: 30 }, (_, i) => i + 1), pts)).toBeNull();
  });
});
