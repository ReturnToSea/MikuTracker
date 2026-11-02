import { HEXA_RANK_MAX, type HexaStat } from "@miku/shared";
import type { CostTable, HexaStep } from "../gameFigures/hexa";

// The HEXA page's maths (v3.0.0): what levels cost, what's invested and left, the expected cost of a
// HEXA Stat node (its rank-ups are random), the upgrade priority from the job's order, and how long the
// fragments take. Pure: no database, no HTTP.

export interface Cost {
  erda: number;
  frags: number;
}
export const NO_COST: Cost = { erda: 0, frags: 0 };
export const addCost = (a: Cost, b: Cost): Cost => ({ erda: a.erda + b.erda, frags: a.frags + b.frags });

// What taking a node from level `from` to `to` costs (nothing when `to` isn't above `from`).
export function levelCost(t: CostTable, from: number, to: number): Cost {
  let out = NO_COST;
  for (let l = from; l < to; l++) out = addCost(out, { erda: t.erda[l]!, frags: t.frags[l]! });
  return out;
}

// HEXA Stat: the expected fragments to take a node from its rank (its primary stat at level `primary`) to
// `target`, worked out exactly over every way the random rank-ups can go. Each rank-up costs by the
// primary stat's level and raises the primary with its chance (chance[10] is 0: at its max), else one of
// the additional stats, which costs nothing different: so only the primary's level and the rank matter
// (the additional stats always have room: they're 19 at most below 20). Unlocking isn't included.
export function statExpected(primary: number, rank: number, target: number, cost: readonly number[], chance: readonly number[]): number {
  const memo = new Map<string, number>();
  const go = (p: number, r: number): number => {
    if (r >= target) return 0;
    const key = `${p},${r}`;
    const seen = memo.get(key);
    if (seen !== undefined) return seen;
    const q = chance[p]!;
    // (a primary at its max isn't raised: no level past it is looked at)
    const out = cost[p]! + (q > 0 ? q * go(p + 1, r + 1) : 0) + (1 - q) * go(p, r + 1);
    memo.set(key, out);
    return out;
  };
  return go(primary, rank);
}

// What a HEXA Stat node's rank-ups have cost so far: its main line at level `primary`, its additional
// lines at `additional` levels in all. Every rank-up costs by the main line's level at the time. The main
// line's own rank-ups are known (one from each of its levels below `primary`); the additional lines' came
// at main line levels we can't know, so they're the expected cost over every order they could have come
// in, each order as likely as the game makes it: an additional rank-up while the main line is at level k
// happens with 1 − chance[k] (the main line's own rank-ups and the split between the two additional
// lines weigh the same in every order). exact: every order costs the same. Unlocking isn't included.
export function statSpent(primary: number, additional: number, cost: readonly number[], chance: readonly number[]): { frags: number; exact: boolean } {
  let main = 0;
  for (let k = 0; k < primary; k++) main += cost[k]!;
  // for the main line's levels k..primary, and r additional rank-ups among them: every order's weight
  // added up (w[r]), and its weight times its cost (c[r])
  const r = Array.from({ length: additional + 1 }, (_, i) => i);
  let w = r.map((n) => (1 - chance[primary]!) ** n);
  let c = r.map((n) => w[n]! * n * cost[primary]!);
  for (let k = primary - 1; k >= 0; k--) {
    const a = 1 - chance[k]!;
    // j of them at level k, the rest at the levels above
    const [above, aboveCost] = [w, c];
    w = r.map((n) => r.slice(0, n + 1).reduce((sum, j) => sum + a ** j * above[n - j]!, 0));
    c = r.map((n) => r.slice(0, n + 1).reduce((sum, j) => sum + a ** j * (aboveCost[n - j]! + above[n - j]! * j * cost[k]!), 0));
  }
  return { frags: main + c[additional]! / w[additional]!, exact: additional === 0 || cost[0] === cost[primary] };
}

// The flat ATT a core gives at a level (v3.2.0: the 3rd Common node's buff on about 20 jobs, Zero's 4th
// Mastery node): MapleScouter's measured points (level, ATT, in level order), straight lines between them
// and from nothing at level 0 (the node isn't learnt); past the last point, the last.
export function coreAttAt(points: readonly (readonly [number, number])[], level: number): number {
  const pts: (readonly [number, number])[] = [[0, 0], ...points];
  // Stryker disable next-line EqualityOperator: at a measured level, > finds the next point and the line from this one gives the same ATT
  const i = pts.findIndex(([L]) => L >= level);
  if (i === -1) return pts.at(-1)![1];
  const [L1, a1] = pts[i]!;
  if (L1 === level) return a1;
  const [L0, a0] = pts[i - 1]!;
  return a0 + ((a1 - a0) * (level - L0)) / (L1 - L0);
}

// A job's built order with its HEXA Stat nodes put in by their own damage per fragment (the same measure
// as buildOrder's: the log of the gain per fragment, from scratch): each before the first step worth less,
// and never before the node before it. `stepFrags`: a step's fragments.
export function placeStats(
  steps: readonly { node: string; from: number; to: number; fd: number }[],
  stepFrags: (s: { node: string; from: number; to: number }) => number,
  stats: readonly { stat: 1 | 2 | 3; frags: number; fd: number }[],
): HexaStep[] {
  const out: HexaStep[] = steps.map((s) => ({ ...s }) as HexaStep);
  const score = (fd: number, frags: number) => Math.log(1 + fd / 100) / frags;
  let after = 0;
  for (const st of stats) {
    const worth = score(st.fd, st.frags);
    let at = out.findIndex((s, i) => i >= after && "node" in s && score(s.fd, stepFrags(s)) < worth);
    if (at === -1) at = out.length;
    out.splice(at, 0, { stat: st.stat, to: HEXA_RANK_MAX });
    after = at + 1;
  }
  return out;
}

// Where a HEXA Stat node's lines end up at rank `target`, from their levels now (main line `p`, additional
// lines `a` and `b`): every way the random rank-ups can go, with its chance. Each rank-up raises the main
// line with chance[p] (0 at 10), else an additional line, each half the time (the other when one is at 10).
export function statOutcomes(p: number, a: number, b: number, target: number, chance: readonly number[]): { p: number; a: number; b: number; chance: number }[] {
  let now = new Map<string, number>([[`${p},${a},${b}`, 1]]);
  for (let rank = p + a + b; rank < target; rank++) {
    const next = new Map<string, number>();
    const add = (key: string, q: number) => next.set(key, (next.get(key) ?? 0) + q);
    for (const [key, q] of now) {
      const [x, y, z] = key.split(",").map(Number) as [number, number, number];
      const main = chance[x]!;
      if (main > 0) add(`${x + 1},${y},${z}`, q * main);
      // (one additional line at 10: the other takes it all)
      const toY = z >= 10 ? 1 : y >= 10 ? 0 : 0.5;
      if (toY > 0) add(`${x},${y + 1},${z}`, q * (1 - main) * toY);
      if (toY < 1) add(`${x},${y},${z + 1}`, q * (1 - main) * (1 - toY));
    }
    now = next;
  }
  return [...now].map(([key, q]) => {
    const [x, y, z] = key.split(",").map(Number) as [number, number, number];
    return { p: x, a: y, b: z, chance: q };
  });
}

// The final damage (%) a HEXA Stat node's lines give: each line's amount at its level (the main line's
// table for the first) × what 1 of its stat is worth (`worth`: % final damage per 1). A line without a
// stat gives nothing.
export type StatAmounts = Readonly<Record<HexaStat, { main: readonly number[]; additional: readonly number[] }>>;
export function statFd(lines: readonly { stat: HexaStat | null; level: number }[], amounts: StatAmounts, worth: Readonly<Record<HexaStat, number>>): number {
  return lines.reduce((sum, l, i) => (l.stat === null ? sum : sum + amounts[l.stat][i === 0 ? "main" : "additional"][l.level]! * worth[l.stat]), 0);
}

// A HEXA Stat node's stats for working out its damage: the ones picked, and for a line without one the
// best for the character as players pick them (the guides: the stat worth most on the main line, the next
// ones on the additional lines; worth: at level 10, what the line gives × what 1 of it is worth), its main
// line never a stat in `takenMains` (another node's main line), its three stats different. Not the most
// on average for one run of rank-ups (that would put the best stat on an additional line, which ends
// higher on average): players reset the node to push the main line up. `assumed`: a line was filled in.
export function bestStats(
  lines: readonly { stat: HexaStat | null; level: number }[],
  takenMains: readonly (HexaStat | null)[],
  amounts: StatAmounts,
  worth: Readonly<Record<HexaStat, number>>,
  stats: readonly HexaStat[],
): { stats: [HexaStat, HexaStat, HexaStat]; assumed: boolean } {
  const ranked = [...stats].sort((x, y) => amounts[y].main[10]! * worth[y] - amounts[x].main[10]! * worth[x]);
  const picked = new Set(lines.map((l) => l.stat));
  const free = ranked.filter((st) => !picked.has(st));
  const main = lines[0]!.stat ?? free.find((st) => !takenMains.includes(st))!;
  const rest = free.filter((st) => st !== main);
  const out = lines.map((l, i) => l.stat ?? (i === 0 ? main : rest.shift()!)) as [HexaStat, HexaStat, HexaStat];
  return { stats: out, assumed: lines.some((l) => l.stat === null) };
}

// One row of the upgrade priority: a node from one level to another (the same node's steps in a row
// merged), or a HEXA Stat node to a rank; what it costs, and the final damage it adds (%; a HEXA Stat
// node's: on average, its rank-ups being random).
export interface PriorityRow {
  node: string; // a HexaNode, or "stat1" to "stat3"
  from: number;
  to: number;
  cost: Cost;
  fd: number;
  partial: boolean; // part of a step of the order: its final damage taken in proportion to its fragments
}

// The upgrade priority: the job's order (its steps, best first), without what's done (each node's level
// now) or past what's wanted, and without Sol Janus (it's never in the order). A step partly done or
// partly wanted counts the part, its final damage in proportion to that part's fragments. The same node
// several steps in a row is one row (its gains multiply).
export function priority(
  steps: readonly HexaStep[],
  levels: Readonly<Record<string, number>>,
  wanted: Readonly<Record<string, number>>,
  tables: Readonly<Record<string, CostTable>>,
  stat: (n: 1 | 2 | 3, to: number) => { from: number; to: number; cost: Cost; fd: number } | null,
): PriorityRow[] {
  const at: Record<string, number> = { ...levels };
  const rows: PriorityRow[] = [];
  // (a node's steps follow on from each other: its level is kept as they go)
  const push = (row: PriorityRow) => {
    const last = rows.at(-1);
    if (last?.node === row.node) rows[rows.length - 1] = { ...last, to: row.to, cost: addCost(last.cost, row.cost), fd: ((1 + last.fd / 100) * (1 + row.fd / 100) - 1) * 100, partial: last.partial || row.partial };
    else rows.push(row);
  };
  for (const s of steps) {
    // (a HEXA Stat node is in the order once: its row is never merged)
    if ("stat" in s) {
      const r = stat(s.stat, s.to);
      if (r) rows.push({ node: `stat${s.stat}`, from: r.from, to: r.to, cost: r.cost, fd: r.fd, partial: false });
      continue;
    }
    const start = Math.max(s.from, at[s.node]!);
    const end = Math.min(s.to, wanted[s.node]!);
    if (end <= start) continue;
    const t = tables[s.node]!;
    const cost = levelCost(t, start, end);
    const whole = levelCost(t, s.from, s.to).frags;
    const partial = start > s.from || end < s.to;
    push({ node: s.node, from: start, to: end, cost, fd: partial ? (s.fd * cost.frags) / whole : s.fd, partial });
    at[s.node] = end;
  }
  return rows;
}

// A job's order, built (v3.1.0): from every node at the level the 6th job gives (Origin 1), each time the
// jump (one node to any higher level) with the most damage per fragment, until every node is at 30; each
// step with the final damage it adds there (%). Damage per fragment: the log of the gain per fragment, so a
// jump of several levels compares fairly with one of a single level (two in a row add up). Ties: the first
// node, then the shortest jump. It gives MapleScouter's own order for Ren and Hoyoung (the tests). A step
// never shows a loss (the figures' rounding can make a worthless core's look like −0.000001%).
export function buildOrder(nodes: readonly { key: string; costs: CostTable; free: number }[], damage: (levels: Readonly<Record<string, number>>) => number): { node: string; from: number; to: number; fd: number }[] {
  const at: Record<string, number> = Object.fromEntries(nodes.map((n) => [n.key, n.free]));
  const out: { node: string; from: number; to: number; fd: number }[] = [];
  for (;;) {
    const now = damage(at);
    let best: { score: number; key: string; to: number; gain: number } | null = null;
    for (const n of nodes) {
      let frags = 0;
      for (let to = at[n.key]! + 1; to <= 30; to++) {
        frags += n.costs.frags[to - 1]!;
        const gain = damage({ ...at, [n.key]: to }) / now;
        const score = Math.log(gain) / frags;
        if (!best || score > best.score) best = { score, key: n.key, to, gain };
      }
    }
    if (!best) return out;
    out.push({ node: best.key, from: at[best.key]!, to: best.to, fd: Math.max(0, (best.gain - 1) * 100) });
    at[best.key] = best.to;
  }
}

// The job's order with the same node several steps in a row as one step, to the last one's level (their
// gains multiply). HEXA Stat steps are never joined.
export function joinRuns(steps: readonly HexaStep[]): HexaStep[] {
  const out: HexaStep[] = [];
  for (const s of steps) {
    const last = out.at(-1);
    if (last && "node" in last && "node" in s && last.node === s.node) out[out.length - 1] = { ...last, to: s.to, fd: ((1 + last.fd / 100) * (1 + s.fd / 100) - 1) * 100 };
    else out.push(s);
  }
  return out;
}

// The final damage a list of gains (%) adds together: they multiply.
export const fdTogether = (gains: readonly number[]): number => (gains.reduce((m, g) => m * (1 + g / 100), 1) - 1) * 100;

// Days until `needed` fragments come in at `perDay` farmed a day plus `perWeek` a week (null: never;
// 0: already there). Fractional: the page rounds it.
export function daysFor(needed: number, perDay: number, perWeek: number): number | null {
  if (needed <= 0) return 0;
  const rate = perDay + perWeek / 7;
  return rate > 0 ? needed / rate : null;
}
