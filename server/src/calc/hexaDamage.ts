// A job's damage at given HEXA core levels (v3.1.0), as a share of its damage with every core at 30:
// MapleScouter's figures (through mapledoro's copy, gameFigures/hexa-jobs.json) and mapledoro's method of
// putting them together, in our own code (its repository has no license: a reference, not a source).
// Checked against mapledoro's engine for every job, and against MapleScouter's own Ren and Hoyoung orders
// (tempdata/hexa/RESEARCH.md). Pure: no database, no HTTP.
//
// The figures: each core's damage share at a level with the rest at 30 ("masteryCore1=15"), all at 0
// ("allCores=0"), each alone with the rest at 0 ("only reinCore1"), and pairs of Mastery cores on a
// {0, 1} grid ("masteryCore1=0,masteryCore2=1"). Some levels weren't measured: they're filled from the
// job's own measured levels, in the shape of Ren's curves (`curves`, the most measured job) or of the
// steps the wiki's skill tables show (`steps`: a stat that rises every n levels).

export const CORE_KEYS = ["skillCore1", "skillCore2", "masteryCore1", "masteryCore2", "masteryCore3", "masteryCore4", "reinCore1", "reinCore2", "reinCore3", "reinCore4", "generalCore2", "generalCore3"] as const;
export type CoreKey = (typeof CORE_KEYS)[number];
export type CurveKey = "skill1" | "skill2" | "mastery" | "rein" | "general2" | "general3";

export interface HexaModel {
  cores: Readonly<Record<string, number>>;
  curves: Readonly<Record<CurveKey, readonly number[]>>; // Ren's share kept at each level 0–30, per kind of core
  steps: Readonly<Partial<Record<CoreKey, readonly number[]>>>; // the levels where a core's stat steps up
}

const curveOf = (c: CoreKey): CurveKey => (c === "skillCore1" ? "skill1" : c === "skillCore2" ? "skill2" : c.startsWith("mastery") ? "mastery" : c.startsWith("rein") ? "rein" : c === "generalCore2" ? "general2" : "general3");
const isMastery = (c: CoreKey) => c.startsWith("mastery");
// Interpolating between two points (x0, y0) and (x1, y1) along a shape: the shape's share of the way.
const between = (y0: number, y1: number, share: number) => y0 + (y1 - y0) * share;

// The share of a core's value kept at level L (0 at level 0, 1 at 30).
function kept(m: HexaModel, c: CoreKey, level: number): number {
  const L = Math.max(0, Math.min(30, Math.round(level)));
  const z = m.cores[`${c}=0`]!;
  // (a core worth nothing in the figures: always all of it; one the figures put above its level 30 at
  // level 0, Lynn's and Mo Xuan's 3rd Common node, counts as worth nothing too: a level never lowers damage)
  if (z >= 1 || L === 30) return 1;
  const has = (k: number) => m.cores[`${c}=${k}`] !== undefined;
  const at = (k: number) => (k === 30 ? 1 : (m.cores[`${c}=${k}`]! - z) / (1 - z));
  // (level 0 is always measured: the figures' "core at 0")
  if (has(L)) return at(L);
  const ren = (k: number) => m.curves[curveOf(c)][k]!;
  // Not even level 1 measured: Ren's curve for its kind of core (mapledoro bends it to the job's levels 5,
  // 15 and 25 when those were measured; no job's figures need that)
  if (!has(1)) return ren(L);
  const measured = [...Array.from({ length: 29 }, (_, k) => k + 1).filter(has), 30];
  // Stryker disable next-line EqualityOperator: L is never a measured level here (has(L) returned above), so ≥ finds the same
  const i = measured.findIndex((k) => k > L);
  const [x0, x1] = [measured[i - 1]!, measured[i]!];
  // Mastery cores and the 3rd common node rise evenly, or evenly plus the wiki's steps; the others follow
  // Ren's curve or a straight line, whichever predicts their own inner measured levels better
  if (isMastery(c) || c === "generalCore3") {
    const stair = stairs(m.steps[c], measured.map((k) => [k, at(k)]));
    return between(at(x0), at(x1), stair ? (stair(L) - stair(x0)) / (stair(x1) - stair(x0)) : (L - x0) / (x1 - x0));
  }
  const lin = (x: number, a: number, b: number) => (x - a) / (b - a);
  const curve = (x: number, a: number, b: number) => (ren(x) - ren(a)) / (ren(b) - ren(a));
  const miss = (shape: typeof lin) => measured.slice(1, -1).reduce((sum, x, j) => sum + Math.abs(between(at(measured[j]!), at(measured[j + 2]!), shape(x, measured[j]!, measured[j + 2]!)) - at(x)), 0);
  // Stryker disable next-line EqualityOperator: on an exact tie both shapes predict the core's levels as well (in floating point, practically never exact)
  const shape = measured.length > 3 && miss(lin) < miss(curve) ? lin : curve;
  return between(at(x0), at(x1), shape(L, x0, x1));
}

// The wiki's steps fitted to a core's measured levels: y = a + s L + J (steps so far), by least squares
// (null without the steps, with too few levels to check them: two to spare, or when the levels can't tell
// the steps from an even rise). Gives the shape, a left out.
export function stairs(stepLevels: readonly number[] | undefined, pts: [number, number][]): ((L: number) => number) | null {
  if (!stepLevels || pts.length < 5) return null;
  // Stryker disable next-line EqualityOperator: counting the steps above L instead fits the same shape (J the other way round, a constant apart)
  const steps = (L: number) => stepLevels.filter((x) => x <= L).length;
  const mean = (f: (pt: [number, number]) => number) => pts.reduce((t, pt) => t + f(pt), 0) / pts.length;
  const [mL, mS] = [mean(([L]) => L), mean(([L]) => steps(L))];
  // (each a covariance: mean of x × (y − mean y))
  const sLL = mean(([L]) => L * (L - mL));
  const sSS = mean(([L]) => steps(L) * (steps(L) - mS));
  const sLS = mean(([L]) => L * (steps(L) - mS));
  const sLY = mean(([L, y]) => y * (L - mL));
  const sSY = mean(([L, y]) => y * (steps(L) - mS));
  const det = sLL * sSS - sLS * sLS;
  // Stryker disable next-line EqualityOperator,ArithmeticOperator: a cut-off for "the levels can't tell the steps from an even rise": no figures land near it (the tests' even rise is exactly 0)
  if (det < 1e-6 * sLL * sSS) return null;
  const s = (sLY * sSS - sSY * sLS) / det;
  const J = (sSY * sLL - sLY * sLS) / det;
  return (L) => s * L + J * steps(L);
}

// The pairs of cores that interact (two Mastery cores boosting the same skill): each with its {0, 1}
// grid complete.
function pairs(m: HexaModel): { a: CoreKey; b: CoreKey; grid: Record<string, number> }[] {
  const found = new Map<string, { a: CoreKey; b: CoreKey; grid: Record<string, number> }>();
  for (const [key, value] of Object.entries(m.cores)) {
    // ("a=x,b=y"; every other figure has no comma)
    if (!key.includes(",")) continue;
    const [one, two] = key.split(",").map((part) => part.split("=") as [CoreKey, string]) as [[CoreKey, string], [CoreKey, string]];
    // (in the cores' order, whichever way the figures name them)
    // Stryker disable next-line EqualityOperator: a pair's two cores are never the same one
    const [[a, x], [b, y]] = CORE_KEYS.indexOf(one[0]) < CORE_KEYS.indexOf(two[0]) ? [one, two] : [two, one];
    const pair = found.get(`${a},${b}`) ?? { a, b, grid: {} };
    pair.grid[`${x},${y}`] = value;
    found.set(`${a},${b}`, pair);
  }
  return [...found.values()].filter((p) => ["0,0", "0,1", "1,0", "1,1"].every((k) => p.grid[k] !== undefined));
}

// The cores that multiply a share of the job's damage instead of adding to it (Thunder Breaker's 1st Boost
// core, Paladin's), and that share: from its "alone, the rest at 0" figure, share = (1 − (q − none) / loss)
// / (1 − q). Ordinary cores land on one baseline (the median), so only cores clearly above it count, and
// never a Mastery core (they interact in pairs instead) or a paired core above 1.
function multipliers(m: HexaModel, paired: ReadonlySet<CoreKey>): Map<CoreKey, number> {
  const out = new Map<CoreKey, number>();
  if (!CORE_KEYS.every((c) => m.cores[`only ${c}`] !== undefined)) return out;
  const none = m.cores["allCores=0"]!;
  const raw: [CoreKey, number][] = [];
  for (const c of CORE_KEYS) {
    if (isMastery(c)) continue;
    const loss = 1 - m.cores[`${c}=0`]!;
    const q = m.cores[`only ${c}`]!;
    // (a core worth nothing, or one whose alone-figure is all of it, has no share to work out)
    if (loss > 0 && q < 1) raw.push([c, (1 - (q - none) / loss) / (1 - q)]);
  }
  const baseline = raw.map(([, s]) => s).sort((x, y) => x - y)[Math.floor(raw.length / 2)]!;
  // Stryker disable next-line EqualityOperator: cut-offs (8 points above the baseline, a share above 1): no job's figures land on them
  for (const [c, s] of raw) if (s - baseline > 0.08 && !(s > 1 && paired.has(c))) out.set(c, s);
  return out;
}

// What doesn't change with the levels, worked out once per job: each core's share kept at every level, the
// pairs, the multiplier cores.
interface Prepared {
  kept: Record<CoreKey, number[]>;
  pairs: ReturnType<typeof pairs>;
  shares: Map<CoreKey, number>;
}
const prepared = new WeakMap<HexaModel, Prepared>();
function prepare(m: HexaModel): Prepared {
  const known = prepared.get(m);
  if (known) return known;
  const pairList = pairs(m);
  const p: Prepared = {
    kept: Object.fromEntries(CORE_KEYS.map((c) => [c, Array.from({ length: 31 }, (_, L) => kept(m, c, L))])) as Record<CoreKey, number[]>,
    pairs: pairList,
    shares: multipliers(m, new Set(pairList.flatMap((x) => [x.a, x.b]))),
  };
  prepared.set(m, p);
  return p;
}

// The job's damage with its cores at these levels (0–30), as a share of every core at 30. Each ordinary
// core takes away what it loses alone; a measured pair puts back the difference its two cores make
// together (within a pair, damage is bilinear over each core's level 0, 1 and 30); each multiplier core
// with share s and loss d then gives pool × (1 − s d) − (1 − s) d (its own loss when the pool is full).
export function hexaDamage(m: HexaModel, levels: Readonly<Record<CoreKey, number>>): number {
  const { kept: k, pairs: pairList, shares } = prepare(m);
  const single = (c: CoreKey, L: number) => 1 - (1 - m.cores[`${c}=0`]!) * (1 - k[c][L]!);
  // a core's level as weights on its levels 1 and 30 (level 0: all on 0)
  const nodes = (c: CoreKey, L: number): [number, number][] => {
    if (L === 0) return [[0, 1]];
    const f1 = k[c][1]!;
    const t = f1 >= 1 ? 1 : (k[c][L]! - f1) / (1 - f1);
    return [[1, 1 - t], [30, t]];
  };
  let pool = 1;
  for (const c of CORE_KEYS) if (!shares.has(c)) pool -= 1 - single(c, levels[c]);
  for (const { a, b, grid } of pairList) {
    if (shares.has(a) || shares.has(b)) continue;
    // (both at 30: single(a, 30), which is 1)
    const at = (i: number, j: number) => (j === 30 ? single(a, i) : i === 30 ? single(b, j) : grid[`${i},${j}`]!);
    let together = 0;
    for (const [i, wi] of nodes(a, levels[a])) for (const [j, wj] of nodes(b, levels[b])) together += wi * wj * at(i, j);
    pool += together - (single(a, levels[a]) + single(b, levels[b]) - 1);
  }
  let scale = 1;
  let flat = 0;
  for (const [c, s] of shares) {
    const d = 1 - single(c, levels[c]);
    scale *= 1 - s * d;
    flat += (1 - s) * d;
  }
  return pool * scale - flat;
}
