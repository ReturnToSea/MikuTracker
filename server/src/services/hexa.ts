import { HEXA_DEFAULTS, HEXA_NODES, HEXA_STATS, type HexaInput, type HexaNode, type HexaStat, hexaInput } from "@miku/shared";
import { addCost, bestStats, buildOrder, type Cost, coreAttAt, daysFor, fdTogether, joinRuns, levelCost, NO_COST, placeStats, priority, type PriorityRow, statExpected, statFd, statOutcomes, statSpent } from "../calc/hexa";
import { type CoreKey, hexaDamage } from "../calc/hexaDamage";
import { db } from "../db";
import { CORE_OF, DUNGEON_FRAGS, ERDA_REQUEST_FRAGS, HEXA_FIGURES, HEXA_ICONS, forgetHexaJobs, HEXA_MAX, type HexaGroup, type HexaJob, hexaJob, isShine, STAT_AMOUNTS, STAT_LEVEL, STAT_MAIN_NOT_WORKED_OUT, STAT_MAX_RANK, STAT_PRIMARY_CHANCE, STAT_RANK_COST, STAT_UNLOCK } from "../gameFigures/hexa";
import { listCharacters, ownCharacter } from "./characters";
import { statValuesOf } from "./gear";
import { iconFiles } from "./icons";
import { parseSaved } from "./saved";

// The HEXA page (v3.0.0, every job from v3.1.0): a world's characters (tabs), and one character's HEXA as
// typed, with what it has cost, what's left, the upgrade priority (the job's order, built from
// MapleScouter's figures, with the HEXA Stat nodes put in by their damage for this character) and how
// long the fragments take.

export interface HexaCharacter {
  id: number;
  name: string;
  job: string;
  level: number;
  avatar: string | null;
  known: boolean; // a job the HEXA page works out (every job but the SHINE classes)
  shine: boolean; // a SHINE class: Erda Link instead of HEXA
}
export interface HexaTabs {
  characters: HexaCharacter[];
}

export interface HexaNodeView {
  key: HexaNode;
  name: string;
  group: HexaGroup;
  icon: string | null; // null: not downloaded
  min: number; // the level the 6th job gives it (Origin: 1)
  max: number;
}
export interface HexaStatView {
  lines: HexaInput["stats"][number]["lines"];
  rank: number;
  unlocked: boolean; // ticked, or any level
  needs: number | null; // the character level it needs first, when the character's is lower: then not in the priority
  spent: Cost; // the unlock and the rank-ups so far (the additional lines' part on average, see statSpent)
  left: Cost; // to rank 20: the unlock (if locked) and the rank-ups' fragments on average
  // its damage: with the stats picked, and the best for the character where a line has none (`assumed`);
  // the final damage it gives now, and what rank 20 adds to that on average (%)
  worked: [HexaStat, HexaStat, HexaStat];
  assumed: boolean;
  fdNow: number;
  fdToCome: number;
}
// Which of a row's figures are estimates (≈ on the page): its cost (a HEXA Stat node's rank-ups: an
// average), its final damage (a HEXA Stat node's; part of a step of the order; a node's flat ATT, from
// the character's 1 ATT value).
export interface Estimate {
  cost: boolean;
  fd: boolean;
}
// One step of the job's whole order (the same node several steps in a row joined), for the full order view.
export interface HexaOrderStep {
  node: string; // a HexaNode, or "stat1" to "stat3"
  name: string;
  icon: string | null;
  from: number;
  to: number; // a HEXA Stat node: 20
  cost: Cost; // the whole step's (a HEXA Stat node: its unlock and its rank-ups from 0, on average)
  fd: number; // a HEXA Stat node's: rank 0 to 20, on average, with the stats it's worked out with
  estimate: Estimate;
  done: boolean;
  days: number | null; // until the fragments up to the end of this step are in (0: now)
}
export interface HexaBoard {
  known: boolean; // false: a job the page doesn't work out yet
  input: HexaInput;
  nodes: HexaNodeView[];
  // the nodes (Sol Janus only when it's counted) and the HEXA Stat nodes: invested so far and left to
  // complete (every node at 30, every HEXA Stat node at 20); exact: no HEXA Stat average in it
  invested: Cost & { exact: boolean };
  left: Cost & { exact: boolean };
  stats: HexaStatView[];
  priority: (PriorityRow & { name: string; icon: string | null; total: Cost; days: number | null; estimate: Estimate })[]; // total: fragments and Sol Erda through this row
  fdToDesired: number; // the final damage the priority's rows add together (%; HEXA Stat's on average)
  // perWeek: Erda's Request and the Epic Dungeon; needed: still to get for every level wanted (and every
  // HEXA Stat node that can be taken to 20), after the fragments owned
  fragments: { perWeek: number; needed: number; days: number | null };
  order: HexaOrderStep[];
  icons: { stat: string | null; erda: string | null; frags: string | null };
  // the fragments a week from Erda's Request and from each Epic Dungeon (the page shows them, and adds up
  // what comes in from the input as typed)
  figures: { erdaRequest: number; dungeons: Record<HexaInput["dungeon"], number> };
  source: string; // where the order and final damage come from
  attNode: string | null; // the node that also gives flat ATT (its name), counted from the 1 ATT value
}

// A HEXA picture's address, when it's downloaded (into the data folder's item-icons/hexa/).
function iconUrl(): (name: string | null) => string | null {
  const files = iconFiles("hexa");
  return (name) => (name !== null && files.has(`${name}.png`) ? `/item-icons/hexa/${name}.png` : null);
}

export async function hexaTabs(ownerId: string, worldId: number): Promise<HexaTabs> {
  const { characters } = await listCharacters(ownerId, worldId);
  return { characters: characters.map((c) => ({ id: c.id, name: c.name, job: c.job, level: c.level, avatar: c.avatar, known: hexaJob(c.job) !== null, shine: isShine(c.job) })) };
}

// The saved input, or the defaults (none saved, or one that no longer passes the rules or isn't JSON;
// the Stats page reads the levels now from it too).
export async function savedInput(characterId: number): Promise<HexaInput> {
  const row = await db().hexaPlan.findUnique({ where: { characterId } });
  return parseSaved(row?.data, hexaInput) ?? structuredClone(HEXA_DEFAULTS);
}

// A job's order (calc/hexa.ts buildOrder) from its figures; a job with a node that also gives flat ATT
// (v3.2.0), with that ATT's final damage too: `attWorth`, % final damage per 1 ATT (the character's 1 ATT
// value), on top of the figures' (which leave it out).
export function orderFor(job: HexaJob, attWorth = 0): ReturnType<typeof buildOrder> {
  // (every core is one node's)
  const cores = (levels: Readonly<Record<string, number>>) => Object.fromEntries(Object.entries(CORE_OF).map(([node, core]) => [core, levels[node]!])) as Record<CoreKey, number>;
  const att = job.att;
  return buildOrder(
    job.nodes.filter((n) => n.key !== "janus"),
    (levels) => hexaDamage(job.model, cores(levels)) * (att ? 1 + (attWorth * coreAttAt(att.points, levels[att.node]!)) / 100 : 1),
  );
}
// The same, built once per job (and 1 ATT's worth, for a job with an ATT node, to 4 decimals: stat values
// typed again or another character's land on the same order) and kept (a third of a second each; null: a
// job the page doesn't work out).
const orders = new Map<string, ReturnType<typeof buildOrder>>();
export function jobOrder(name: string, attWorth = 0): ReturnType<typeof buildOrder> | null {
  const job = hexaJob(name);
  if (!job) return null;
  const worth = Math.round(attWorth * 10_000) / 10_000;
  const key = job.att ? `${name}|${worth}` : name;
  const known = orders.get(key) ?? orderFor(job, worth);
  orders.set(key, known);
  return known;
}
// (for the tests: forget every job's figures and order, so the next ask works them out again; with
// them kept, mutation testing's planted bugs would never run)
export function forgetHexa(): void {
  orders.clear();
  forgetHexaJobs();
}

export async function saveHexa(ownerId: string, characterId: number, input: HexaInput): Promise<void> {
  await ownCharacter(ownerId, characterId);
  const data = JSON.stringify(input);
  await db().hexaPlan.upsert({ where: { characterId }, create: { characterId, data }, update: { data } });
}

export async function hexaBoard(ownerId: string, characterId: number): Promise<HexaBoard> {
  const c = await ownCharacter(ownerId, characterId);
  // (the saved input and the stat values, read together)
  const [input, valuesRow] = await Promise.all([savedInput(characterId), db().statValues.findUnique({ where: { characterId } })]);
  const job = hexaJob(c.job);
  const perWeek = (input.erdaRequest ? ERDA_REQUEST_FRAGS : 0) + DUNGEON_FRAGS[input.dungeon];
  const icon = iconUrl();
  const icons = { stat: icon(HEXA_ICONS.stat), erda: icon(HEXA_ICONS.erda), frags: icon(HEXA_ICONS.frags) };
  const none = { ...NO_COST, exact: true };
  const figures = { erdaRequest: ERDA_REQUEST_FRAGS, dungeons: DUNGEON_FRAGS };
  if (!job) return { known: false, input, nodes: [], invested: none, left: none, stats: [], priority: [], fdToDesired: 0, fragments: { perWeek, needed: 0, days: 0 }, order: [], icons, figures, source: "", attNode: null };
  const values = statValuesOf(valuesRow ?? undefined);
  // (a level wanted below the level now is the level now: nothing to do)
  const desired = Object.fromEntries(HEXA_NODES.map((n) => [n, Math.max(input.current[n], input.desired[n])])) as Record<HexaNode, number>;
  const nodes: HexaNodeView[] = job.nodes.map((f) => ({ key: f.key, name: f.name, group: f.group, icon: icon(f.icon), min: f.free, max: HEXA_MAX }));
  const counted = job.nodes.filter((f) => f.key !== "janus" || input.janus);
  const sum = (from: (f: (typeof counted)[number]) => number, to: (f: (typeof counted)[number]) => number) => counted.reduce((acc, f) => addCost(acc, levelCost(f.costs, from(f), to(f))), NO_COST);

  const rankOf = (i: number) => input.stats[i]!.lines.reduce((a, l) => a + l.level, 0);
  const unlockedAt = (i: number) => rankOf(i) > 0 || input.stats[i]!.unlocked;
  // what a HEXA Stat node still costs to rank 20 from `rank`, its main line at `primary`
  const statLeft = (i: number, unlocked: boolean, primary: number, rank: number): Cost =>
    addCost(unlocked ? NO_COST : STAT_UNLOCK[i]!, { erda: 0, frags: statExpected(primary, rank, STAT_MAX_RANK, STAT_RANK_COST, STAT_PRIMARY_CHANCE) });
  const spends = input.stats.map(({ lines: [main, a, b] }) => statSpent(main.level, a.level + b.level, STAT_RANK_COST, STAT_PRIMARY_CHANCE));
  // what 1 of each stat is worth: its value (in main stat) × the final damage per main stat (Xenon's and
  // Demon Avenger's main stat lines aren't main stat: not worked out)
  const perMain = values.fdPer100 / 100;
  const worth: Record<HexaStat, number> = {
    mainStat: STAT_MAIN_NOT_WORKED_OUT.includes(c.job) ? 0 : values.mainFlat * perMain,
    att: values.att * perMain,
    bossDmg: values.bossDmg * perMain,
    dmg: values.bossDmg * perMain,
    ied: (values.bossDef === 300 ? values.ied300 : values.ied380) * perMain,
    critDmg: values.critDmg * perMain,
  };
  // each node's stats to work with, in order (a node's assumed main line isn't another's)
  const mains: (HexaStat | null)[] = input.stats.map((s) => s.lines[0].stat);
  // a node's final damage at rank 20 on average, from these outcomes, with these stats
  const fromZero = statOutcomes(0, 0, 0, STAT_MAX_RANK, STAT_PRIMARY_CHANCE);
  const expectedFd = (outcomes: ReturnType<typeof statOutcomes>, with3: (levels: [number, number, number]) => { stat: HexaStat; level: number }[]) =>
    outcomes.reduce((sum, o) => sum + o.chance * statFd(with3([o.p, o.a, o.b]), STAT_AMOUNTS, worth), 0);
  const worked = input.stats.map((s) => {
    const [main, a, b] = s.lines;
    // (its own main line, when picked, is in `mains` too: a picked line is kept as it is)
    const best = bestStats(s.lines, mains, STAT_AMOUNTS, worth, HEXA_STATS);
    mains.push(best.stats[0]);
    const withStats = (levels: [number, number, number]) => best.stats.map((stat, i) => ({ stat, level: levels[i]! }));
    const fdNow = statFd(withStats([main.level, a.level, b.level]), STAT_AMOUNTS, worth);
    const fdEnd = expectedFd(statOutcomes(main.level, a.level, b.level, STAT_MAX_RANK, STAT_PRIMARY_CHANCE), withStats);
    // (from scratch: where the node goes in the order)
    return { best, fdNow, fdToCome: fdEnd - fdNow, fromZero: expectedFd(fromZero, withStats) };
  });
  const stats: HexaStatView[] = input.stats.map((s, i) => {
    const main = s.lines[0];
    const spent = spends[i]!;
    return {
      lines: s.lines,
      rank: rankOf(i),
      unlocked: unlockedAt(i),
      needs: !unlockedAt(i) && c.level < STAT_LEVEL[i]! ? STAT_LEVEL[i]! : null,
      spent: unlockedAt(i) ? addCost(STAT_UNLOCK[i]!, { erda: 0, frags: spent.frags }) : NO_COST,
      left: statLeft(i, unlockedAt(i), main.level, rankOf(i)),
      worked: worked[i]!.best.stats,
      assumed: worked[i]!.best.assumed,
      fdNow: worked[i]!.fdNow,
      fdToCome: worked[i]!.fdToCome,
    };
  });
  const total = (base: Cost, part: (s: HexaStatView) => Cost) => stats.reduce((acc, s) => addCost(acc, part(s)), base);
  // (the level the 6th job gives is free: not invested)
  const invested = { ...total(sum((f) => f.free, (f) => input.current[f.key]), (s) => s.spent), exact: spends.every((s) => s.exact) };
  // (a HEXA Stat node's rank-ups to come are an average, unless there are none)
  const left = { ...total(sum((f) => input.current[f.key], () => HEXA_MAX), (s) => s.left), exact: stats.every((s) => s.rank >= STAT_MAX_RANK) };

  const tables = Object.fromEntries(job.nodes.map((f) => [f.key, f.costs]));
  // each HEXA Stat node from scratch: its unlock and every rank-up on average (its place in the order, its step)
  const fullCost = input.stats.map((_, i) => statLeft(i, false, 0, 0));
  const steps = placeStats(
    jobOrder(c.job, job.att ? worth.att : 0)!,
    (st) => levelCost(tables[st.node]!, st.from, st.to).frags,
    worked.map((w, i) => ({ stat: (i + 1) as 1 | 2 | 3, frags: fullCost[i]!.frags, fd: w.fromZero })),
  );
  const rows = priority(steps, input.current, desired, tables, (n) => {
    const s = stats[n - 1]!;
    return s.rank >= STAT_MAX_RANK || s.needs ? null : { from: s.rank, to: STAT_MAX_RANK, cost: s.left, fd: s.fdToCome };
  });
  const names: Record<string, string> = { ...Object.fromEntries(job.nodes.map((f) => [f.key, f.name])), stat1: "HEXA Stat I", stat2: "HEXA Stat II", stat3: "HEXA Stat III" };
  const icons1: Record<string, string | null> = { ...Object.fromEntries(job.nodes.map((f) => [f.key, icon(f.icon)])), stat1: icons.stat, stat2: icons.stat, stat3: icons.stat };
  const estimateOf = (node: string, partial = false): Estimate => ({ cost: node.startsWith("stat"), fd: node.startsWith("stat") || partial || node === job.att?.node });
  let through = NO_COST;
  const listed = rows.map((r) => {
    through = addCost(through, r.cost);
    return { ...r, name: names[r.node]!, icon: icons1[r.node]!, total: through, days: daysFor(through.frags - input.owned, input.perDay, perWeek), estimate: estimateOf(r.node, r.partial) };
  });

  // the whole order, every node to 30 and every HEXA Stat node to 20: what each step still costs adds up
  // (a HEXA Stat node the character can't take yet adds nothing, as in what's still to get)
  let owed = 0;
  const order: HexaOrderStep[] = joinRuns(steps).map((st) => {
    if ("stat" in st) {
      const i = st.stat - 1;
      const s = stats[i]!;
      if (!s.needs) owed += s.left.frags;
      return { node: `stat${st.stat}`, name: names[`stat${st.stat}`]!, icon: icons.stat, from: 0, to: STAT_MAX_RANK, cost: fullCost[i]!, fd: worked[i]!.fromZero, estimate: estimateOf(`stat${st.stat}`), done: s.rank >= STAT_MAX_RANK, days: daysFor(owed - input.owned, input.perDay, perWeek) };
    }
    const t = tables[st.node]!;
    owed += levelCost(t, Math.max(st.from, input.current[st.node]), st.to).frags;
    return { node: st.node, name: names[st.node]!, icon: icons1[st.node]!, from: st.from, to: st.to, cost: levelCost(t, st.from, st.to), fd: st.fd, estimate: estimateOf(st.node), done: input.current[st.node] >= st.to, days: daysFor(owed - input.owned, input.perDay, perWeek) };
  });

  const toDesired = sum((f) => input.current[f.key], (f) => desired[f.key]);
  const needed = Math.max(0, total(toDesired, (s) => (s.needs ? NO_COST : s.left)).frags - input.owned);
  return {
    known: true,
    input,
    nodes,
    invested,
    left,
    stats,
    priority: listed,
    fdToDesired: fdTogether(rows.map((r) => r.fd)),
    fragments: { perWeek, needed, days: daysFor(needed, input.perDay, perWeek) },
    order,
    icons,
    figures,
    source: `MapleScouter's figures (mapledoro's copy, read ${HEXA_FIGURES.generated}); the order built from them`,
    attNode: job.att ? names[job.att.node]! : null,
  };
}
