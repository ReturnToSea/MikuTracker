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

// One row of the upgrade priority: a node from one level to another (the same node's steps in a row
// merged), or a HEXA Stat node to a rank; what it costs, and the final damage it adds (%; null: not
// known, HEXA Stat's depends on its random rank-ups).
export interface PriorityRow {
  node: string; // a HexaNode, or "stat1" to "stat3"
  from: number;
  to: number;
  cost: Cost;
  fd: number | null;
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
  stat: (n: 1 | 2 | 3, to: number) => { from: number; to: number; cost: Cost } | null,
): PriorityRow[] {
  const at: Record<string, number> = { ...levels };
  const rows: PriorityRow[] = [];
  // (a node's steps follow on from each other: its level is kept as they go)
  const push = (row: PriorityRow & { fd: number }) => {
    const last = rows.at(-1);
    if (last?.node === row.node) rows[rows.length - 1] = { ...last, to: row.to, cost: addCost(last.cost, row.cost), fd: ((1 + last.fd! / 100) * (1 + row.fd / 100) - 1) * 100, partial: last.partial || row.partial };
    else rows.push(row);
  };
  for (const s of steps) {
    // (a HEXA Stat node is in the order once: its row is never merged)
    if ("stat" in s) {
      const r = stat(s.stat, s.to);
      if (r) rows.push({ node: `stat${s.stat}`, from: r.from, to: r.to, cost: r.cost, fd: null, partial: false });
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
