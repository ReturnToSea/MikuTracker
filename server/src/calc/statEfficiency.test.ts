import { describe, expect, it } from "vitest";
import reference from "../../test/fixtures/stats-mapledoro.json";
import { cooldownBonus, groups, splineReach } from "./stats";
import { cooldownRefs, DEFAULT_WEIGHTS, STAT_WEIGHTS, statLinks, statsJob } from "../gameFigures/stats";
import { statEfficiency } from "./statEfficiency";

// What one more of a stat does to the damage, from the formula's own shape: damage is a product of groups,
// each a sum, so one more point in a group multiplies the damage by (group + step) / group. The stat term is
// linear in each stat (base × (1 + %) + not affected), so 1 main stat adds weight × (1 + main %) to it.
describe("statEfficiency: each stat's worth in main stat (the random sheets of every job)", () => {
  const cases = reference.cases.filter((_, i) => i % 3 === 0);
  it.each(cases.map((c) => [c.job, c] as const))("%s", (_job, c) => {
    const job = statsJob(c.job)!;
    const input = c.input as never as Parameters<typeof groups>[1];
    const e = statEfficiency(job, input, c.ctx, statLinks(), cooldownRefs(), true, false);
    const { g, keep } = groups(job, input, c.ctx, statLinks());
    if (!e) {
      // (only where one main stat adds no damage: no curve, or the defense left nothing at 380%)
      expect(!job.spline380 || g.def <= 0).toBe(true);
      return;
    }
    const w = STAT_WEIGHTS[job.class] ?? DEFAULT_WEIGHTS;
    const s = input.stats;
    const multMain = 1 + (s.main.per + input.famPct.main) / 100;
    const main = (w.main * multMain) / g.stat; // one main stat's share of the damage
    const close = (got: number, want: number) => expect(got / want - 1).toBeCloseTo(0, 6);
    close(e.att, 1 / g.flatAtk / main);
    close(e.attPct, 0.01 / g.atkPct / main);
    close(e.bossDmg, 0.01 / g.dmg / main);
    close(e.critDmg, 0.01 / g.crit / main);
    close(e.mainFlat, w.main / g.stat / main);
    // the secondary stat and the third: their weight × (1 + their %), as main stat's (none for most jobs' third)
    close(e.sub, (w.sub * (1 + (s.sub.per + input.famPct.sub) / 100)) / g.stat / main);
    if (w.ssub) close(e.third!, (w.ssub * (1 + (s.third.per + input.famPct.third) / 100)) / g.stat / main);
    else expect(e.third).toBe(0);
    // (1% IED more keeps 99% of the defense still kept: against 380%, keep; against 300%, 3/3.8 of it)
    close(e.ied380, (0.01 * keep) / (1 - keep) / main);
    const keep300 = (keep * 3) / 3.8;
    close(e.ied300, (0.01 * keep300) / (1 - keep300) / main);
    // all stats % is each stat's % together (the stat term is a sum)
    close(e.allStatPct, e.mainPct + e.subPct + e.thirdPct!);
    // (a Demon Avenger's HP isn't one of the stats all stats % raises)
    close(statEfficiency(job, input, c.ctx, statLinks(), cooldownRefs(), true, true)!.allStatPct, e.subPct + e.thirdPct!);
    // 100 main stat: (stat + 100 × weight × (1 + %)) / stat, as % final damage
    close(e.fdPer100, ((100 * w.main * multMain) / g.stat) * 100);
    // cooldown: the class's table, at the score before cooldown
    const x = job.splineScale === null ? 0 : 1;
    if (x) {
      const d = job.scale * g.stat * g.flatAtk * g.atkPct * g.dmg * g.crit * g.cores * g.other * g.def * job.splineScale!;
      const h0 = splineReach(job.spline380!, d);
      const at = (sec: number) => 1 + (Math.round(sec) > 0 ? cooldownBonus(job, cooldownRefs(), Math.round(sec), h0) : 0);
      close(e.cooldown[4] / 100 + 1, at(s.cdSec + 4) / at(s.cdSec));
    }
  });
});

it("statEfficiency: a sheet whose defense leaves nothing at 380% is worth nothing to work out (null)", () => {
  const c = reference.cases[0]!;
  const low = { ...c.input, stats: { ...c.input.stats, ied: 0 } } as never;
  expect(statEfficiency(statsJob(c.job)!, low, c.ctx, statLinks(), cooldownRefs(), true, false)).toBeNull();
});
it("statEfficiency: no damage at all (exactly 0) is worth nothing to work out either (null)", () => {
  const c = reference.cases[0]!;
  expect(statEfficiency(statsJob(c.job)!, c.input as never, { ...c.ctx, cores: 0 }, statLinks(), cooldownRefs(), true, false)).toBeNull();
});
