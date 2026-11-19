import { STATS_DEFAULTS, type StatsInput } from "@miku/shared";
import { describe, expect, it } from "vitest";
import answers from "../../test/fixtures/maplescouter-damage.json";
import measured from "../gameFigures/measured-classes.json";
import jobFigures from "../gameFigures/stats-jobs.json";
import { CORE_OF, hexaJob } from "../gameFigures/hexa";
import { BUFF_DMG, classFiguresSource, cooldownRefs, mapledoroJob, STAT_POTION, statLinks, statsJob } from "../gameFigures/stats";
import { coreAttAt } from "./hexa";
import { hexaDamage } from "./hexaDamage";
import { angelLink, groups, potionAside, statsScore } from "./stats";

// Each saved MapleScouter answer (made-up sheets: v4.6.0's probes and the 2026-11-17 captures) as the app works it out:
// the class's figures, and HEXA from the sheet's core levels.
type Answer = (typeof answers.answers)[number];
const ctxOf = (a: Answer) => {
  const hexa = hexaJob(a.job)!;
  const levels = Object.fromEntries(Object.entries(CORE_OF).map(([node, core]) => [node, a.coreLevels[core as keyof typeof a.coreLevels]]));
  return { level: a.level, heroic: a.heroic, sacred: a.sacred, cores: hexaDamage(hexa.model, a.coreLevels as never), coreAtt: hexa.att ? coreAttAt(hexa.att.points, levels[hexa.att.node]!) : 0 };
};
const input = (a: Answer) => a.input as unknown as StatsInput;
const ours = (a: Answer) => statsScore(statsJob(a.job)!, input(a), ctxOf(a), statLinks(), cooldownRefs());
const off = (mine: number, theirs: number) => Math.abs(mine / theirs - 1);

describe("the measured classes (v4.6.0): our damage against MapleScouter's own answers", () => {
  for (const job of ["Ren", "Lethe", "Night Walker"]) {
    // (but one left out: Lethe's with Mastery 2 at 2, which MapleScouter's calculation ignores though its own HEXA order counts it)
    const mine = answers.answers.filter((a) => a.job === job && !a.left);
    it(`${job}: every answer within 0.1%, at 380% and at 300%, the held-out check sheets too (three within 0.2%: their reasons in the fixture)`, () => {
      expect(mine.length).toBeGreaterThanOrEqual(9);
      expect(mine.some((a) => a.held)).toBe(true);
      for (const a of mine) {
        const s = ours(a);
        const most = a.wide ? 0.002 : 0.001;
        expect(off(s.damage, a.theirs.d380), `${a.label} 380%`).toBeLessThan(most);
        expect(off(s.damage300, a.theirs.d300), `${a.label} 300%`).toBeLessThan(most);
      }
    });
    it(`${job}: its damage % and ATT % totals are MapleScouter's (from its efficiencies), and its stat total`, () => {
      // (but Passive Skills +1: MapleScouter spreads its levels over the groups otherwise; its damage, above, still matches)
      for (const a of mine.filter((x) => x.input.innerAbility !== "passive")) {
        const { g } = groups(statsJob(job)!, input(a), ctxOf(a), statLinks());
        expect(Math.abs((g.dmg - 1) * 100 - a.theirs.dmg), `${a.label} damage %`).toBeLessThan(0.1);
        expect(Math.abs(g.atkPct * 100 - a.theirs.atkPct), `${a.label} ATT %`).toBeLessThan(0.05);
        expect(off(g.stat, a.theirs.stat), `${a.label} stat`).toBeLessThan(0.0005);
      }
    });
  }
  it("the classes' own figures moved from mapledoro's (as the probes showed): Ren's damage % about 20 points (the wiki's always-on passives), not 3.6", () => {
    expect((statsJob("Ren")!.dmg - 1) * 100).toBeGreaterThan(19.5);
    expect((statsJob("Ren")!.dmg - 1) * 100).toBeLessThan(21.5);
    expect((mapledoroJob("Ren")!.dmg - 1) * 100).toBeLessThan(4);
  });
});

// A plain sheet for the shared rules (STATS_DEFAULTS: nothing typed).
const sheet = (over: Partial<StatsInput> = {}): StatsInput => ({ ...structuredClone(STATS_DEFAULTS), ...over }) as StatsInput;
const ctx = { level: 280, heroic: false, sacred: false, cores: 1, coreAtt: 0 };
const dmgOf = (job: string, s: StatsInput) => (groups(statsJob(job)!, s, ctx, statLinks()).g.dmg - 1) * 100;

describe("the shared rules MapleScouter's probes measured (v4.6.0), for every class", () => {
  it("the Advanced Stat Potion: +29.96 main and +29.76 secondary stat (its share of mapledoro's hidden base), no damage", () => {
    expect(BUFF_DMG).not.toHaveProperty("statPotion");
    const [on, offSheet] = [sheet({ statPotion: true }), sheet({ statPotion: false })];
    expect(dmgOf("Paladin", on)).toBeCloseTo(dmgOf("Paladin", offSheet), 9);
    // (no stat % typed: each point counts once, the main stat 4 times)
    const stat = (s: StatsInput) => groups(statsJob("Paladin")!, s, ctx, statLinks()).g.stat;
    expect(stat(on) - stat(offSheet)).toBeCloseTo(4 * 29.95622435 + 29.75665399, 6);
    expect(potionAside(statsJob("Paladin")!, offSheet)).toEqual(STAT_POTION);
    expect(potionAside(statsJob("Paladin")!, on)).toEqual({ main: 0, sub: 0 });
  });
  it("…out of a hidden base that holds it to a millionth (mapledoro's figures carry float noise; review)", () => {
    const pal = statsJob("Paladin")!;
    const noisy = { ...pal, stat: { ...pal.stat, hiddenBase: { main: STAT_POTION.main - 1e-9, sub: STAT_POTION.sub - 1e-9 } } };
    expect(potionAside(noisy, sheet())).toEqual(STAT_POTION);
    // (exactly at the millionth's edge: still held)
    const edge = { ...pal, stat: { ...pal.stat, hiddenBase: { main: STAT_POTION.main - 1e-6, sub: STAT_POTION.sub - 1e-6 } } };
    expect(potionAside(edge, sheet())).toEqual(STAT_POTION);
    const short = { ...pal, stat: { ...pal.stat, hiddenBase: { main: STAT_POTION.main - 1e-3, sub: STAT_POTION.sub } } };
    expect(potionAside(short, sheet())).toEqual({ main: 0, sub: 0 });
  });
  it("…but not out of a hidden base that doesn't hold it (Cannoneer's secondary 16.8), nor Demon Avenger's or Xenon's", () => {
    for (const job of ["Cannoneer", "Demon Avenger", "Xenon"]) expect(potionAside(statsJob(job)!, sheet()), job).toEqual({ main: 0, sub: 0 });
  });
  it("Illium's link by class (it stacks as you move): Ren and Lethe 7 / 10 / 13, Night Walker 3.5 / 5 / 6.5 (MapleScouter's probes); a class not measured, mapledoro's", () => {
    const by = (job: string, L: number) => Number((dmgOf(job, sheet({ links: { ...STATS_DEFAULTS.links, illium: L } })) - dmgOf(job, sheet())).toFixed(9));
    for (const [job, want] of [["Ren", [7, 10, 13]], ["Lethe", [7, 10, 13]], ["Night Walker", [3.5, 5, 6.5]], ["Paladin", [3.5, 5, 6.5]]] as const)
      expect([1, 2, 3].map((L) => by(job, L)), job).toEqual(want);
    expect(statsJob("Paladin")!.illium).toBeUndefined();
  });
  it("Lethe's Ring of Restraint at 5: +2.67 ATT % over level 4 (MapleScouter's probe; mapledoro's, borrowed from Ren, +3.48)", () => {
    const atk = (job: string, r: number) => groups(statsJob(job)!, sheet({ rings: { ...STATS_DEFAULTS.rings, restraint: r } }), ctx, statLinks()).g.atkPct * 100;
    expect(atk("Lethe", 5) - atk("Lethe", 4)).toBeCloseTo(2.671, 1);
    expect(atk("Ren", 5) - atk("Ren", 4)).toBeCloseTo(3.477, 1);
  });
  it("Angelic Buster's link: 2 : 3 : 4 by level, the class's own (Ren: 24.45 at level 2 and buff duration 40, as MapleScouter's)", () => {
    const ren = statsJob("Ren")!;
    expect(angelLink(ren, 0, 40)).toBe(0);
    expect(angelLink(ren, 2, 40)).toBeCloseTo(24.449, 1);
    expect(angelLink(ren, 1, 40) / angelLink(ren, 2, 40)).toBeCloseTo(2 / 3, 9);
    expect(angelLink(ren, 3, 40) / angelLink(ren, 2, 40)).toBeCloseTo(4 / 3, 9);
    // (buff duration 40 → 0 lowers Ren's by 3.3, as MapleScouter's: 3.299)
    expect(angelLink(ren, 2, 40) - angelLink(ren, 2, 0)).toBeCloseTo(3.299, 1);
  });
  it("buff duration changes nothing without Angelic Buster's link (Ren's probe), for any class", () => {
    for (const job of ["Ren", "Paladin", "Night Walker"]) {
      const at = (bd: number) => dmgOf(job, sheet({ stats: { ...STATS_DEFAULTS.stats, buffDuration: bd } }));
      expect(at(40), job).toBeCloseTo(at(0), 9);
    }
  });
  it("a class not measured: the measured classes' link at buff duration 0, and its mapledoro per-buff-duration × their share", () => {
    const pal = mapledoroJob("Paladin")!;
    expect(statsJob("Paladin")!.angel).toBeUndefined();
    expect(angelLink(statsJob("Paladin")!, 2, 0)).toBeCloseTo(measured.shared.angelBase, 9);
    expect(angelLink(statsJob("Paladin")!, 2, 10) - angelLink(statsJob("Paladin")!, 2, 0)).toBeCloseTo(10 * pal.dmgPerBuffDuration * 100 * measured.shared.angelPerBuffDurationShare, 9);
    // (the measured classes' share came out the same for all three: ~0.80)
    expect(measured.shared.angelPerBuffDurationShare).toBeGreaterThan(0.79);
    expect(measured.shared.angelPerBuffDurationShare).toBeLessThan(0.82);
  });
  it("the Artifact's Final Attack: 1.416 damage % per 30 for a job with final attacks (Ren's probe), nothing for the others", () => {
    const fa = (job: string, n: number) => dmgOf(job, sheet({ artifact: { ...STATS_DEFAULTS.artifact, finalAttack: n } }));
    expect(fa("Ren", 30) - fa("Ren", 0)).toBeCloseTo(1.416, 9);
    expect(fa("Ren", 15) - fa("Ren", 0)).toBeCloseTo(0.708, 9);
    expect(fa("Night Walker", 30)).toBeCloseTo(fa("Night Walker", 0), 9);
    // (and no longer in the rest's final damage)
    const other = (n: number) => groups(statsJob("Ren")!, sheet({ artifact: { ...STATS_DEFAULTS.artifact, finalAttack: n } }), ctx, statLinks()).g.other;
    expect(other(30)).toBeCloseTo(other(0), 12);
  });
});

describe("statsJob and the measured classes", () => {
  it("a measured class: its fitted figures over mapledoro's; the rest mapledoro's; mapledoroJob mapledoro's own", () => {
    const [m, raw] = [statsJob("Lethe")!, mapledoroJob("Lethe")!];
    const fit = measured.classes.Lethe;
    expect([m.dmg, m.atkPct, m.scale, m.angel, m.restraint]).toEqual([fit.dmg, fit.atkPct, fit.scale, fit.angel, fit.restraint]);
    expect(raw.dmg).toBe(jobFigures.jobs.Lethe.dmg);
    const { dmg: _a, atkPct: _b, scale: _c, angel: _d, spline380: _e, spline300: _f, defenseK: _l, restraint: _n, illium: _p, ...rest } = m;
    const { dmg: _g, atkPct: _h, scale: _i, spline380: _j, spline300: _k, defenseK: _m, restraint: _o, ...was } = raw;
    expect(rest).toEqual(was);
    expect(statsJob("Paladin")!.dmg).toBe(jobFigures.jobs.Paladin.dmg);
    // (every class's defense figure × the shared factor measured: MapleScouter's 380% boss keeps a little more)
    for (const job of ["Lethe", "Paladin"]) expect(statsJob(job)!.defenseK).toBeCloseTo(mapledoroJob(job)!.defenseK * measured.shared.defenseKeep, 12);
    expect(measured.shared.defenseKeep).toBeGreaterThan(1);
    expect(measured.shared.defenseKeep).toBeLessThan(1.01);
  });
  it("classFiguresSource: measured for Ren, Lethe, Night Walker (the day fitted), mapledoro's else (its day), null for no job", () => {
    for (const job of ["Ren", "Lethe", "Night Walker"]) expect(classFiguresSource(job)).toEqual({ source: "measured", date: measured.generated });
    expect(classFiguresSource("Paladin")).toEqual({ source: "mapledoro", date: jobFigures.generated });
    expect(classFiguresSource("Made Up")).toBeNull();
  });
});
