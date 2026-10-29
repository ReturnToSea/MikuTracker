import { HEXA_DEFAULTS, HEXA_NODES, type HexaInput, type HexaNode, hexaInput } from "@miku/shared";
import { addCost, type Cost, daysFor, fdTogether, joinRuns, levelCost, NO_COST, priority, type PriorityRow, statExpected, statSpent } from "../calc/hexa";
import { db } from "../db";
import { DUNGEON_FRAGS, ERDA_REQUEST_FRAGS, HEXA_ICONS, HEXA_JOBS, HEXA_MAX, type HexaGroup, STAT_LEVEL, STAT_MAX_RANK, STAT_PRIMARY_CHANCE, STAT_RANK_COST, STAT_UNLOCK } from "../gameFigures/hexa";
import { listCharacters, ownCharacter } from "./characters";
import { iconFiles } from "./icons";

// The HEXA page (v3.0.0): a world's characters (tabs), and one character's HEXA as typed, with what
// it has cost, what's left, the upgrade priority and how long the fragments take. Ren only for now.

export interface HexaCharacter {
  id: number;
  name: string;
  job: string;
  level: number;
  avatar: string | null;
  known: boolean; // a job the HEXA page works out (v3.0.0: Ren)
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
}
// One step of the job's whole order (the same node several steps in a row joined), for the full order view.
export interface HexaOrderStep {
  node: string; // a HexaNode, or "stat1" to "stat3"
  name: string;
  icon: string | null;
  from: number;
  to: number; // a HEXA Stat node: 20
  cost: Cost; // the whole step's (a HEXA Stat node: its unlock and its rank-ups from 0, on average)
  fd: number | null;
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
  priority: (PriorityRow & { name: string; icon: string | null; total: Cost; days: number | null })[]; // total: fragments and Sol Erda through this row
  fdToDesired: number; // the final damage the priority's rows add together (%; HEXA Stat not included)
  // perWeek: Erda's Request and the Epic Dungeon; needed: still to get for every level wanted (and every
  // HEXA Stat node that can be taken to 20), after the fragments owned
  fragments: { perWeek: number; needed: number; days: number | null };
  order: HexaOrderStep[];
  icons: { stat: string | null; erda: string | null; frags: string | null };
  // the fragments a week from Erda's Request and from each Epic Dungeon (the page shows them, and adds up
  // what comes in from the input as typed)
  figures: { erdaRequest: number; dungeons: Record<HexaInput["dungeon"], number> };
  source: string; // where the order and final damage come from
}

// A HEXA picture's address, when it's downloaded (into the data folder's item-icons/hexa/).
function iconUrl(): (name: string) => string | null {
  const files = iconFiles("hexa");
  return (name) => (files.has(`${name}.png`) ? `/item-icons/hexa/${name}.png` : null);
}

export async function hexaTabs(ownerId: string, worldId: number): Promise<HexaTabs> {
  const { characters } = await listCharacters(ownerId, worldId);
  return { characters: characters.map((c) => ({ id: c.id, name: c.name, job: c.job, level: c.level, avatar: c.avatar, known: Object.hasOwn(HEXA_JOBS, c.job) })) };
}

// The saved input, or the defaults (none saved, or one that no longer passes the rules or isn't JSON).
async function savedInput(characterId: number): Promise<HexaInput> {
  const row = await db().hexaPlan.findUnique({ where: { characterId } });
  let parsed: ReturnType<typeof hexaInput.safeParse> | null = null;
  try {
    parsed = row ? hexaInput.safeParse(JSON.parse(row.data)) : null;
  } catch {
    // (not JSON: the defaults)
  }
  return parsed?.success ? parsed.data : structuredClone(HEXA_DEFAULTS);
}

export async function saveHexa(ownerId: string, characterId: number, input: HexaInput): Promise<void> {
  await ownCharacter(ownerId, characterId);
  const data = JSON.stringify(input);
  await db().hexaPlan.upsert({ where: { characterId }, create: { characterId, data }, update: { data } });
}

export async function hexaBoard(ownerId: string, characterId: number): Promise<HexaBoard> {
  const c = await ownCharacter(ownerId, characterId);
  const input = await savedInput(characterId);
  const job = Object.hasOwn(HEXA_JOBS, c.job) ? HEXA_JOBS[c.job]! : null;
  const perWeek = (input.erdaRequest ? ERDA_REQUEST_FRAGS : 0) + DUNGEON_FRAGS[input.dungeon];
  const icon = iconUrl();
  const icons = { stat: icon(HEXA_ICONS.stat), erda: icon(HEXA_ICONS.erda), frags: icon(HEXA_ICONS.frags) };
  const none = { ...NO_COST, exact: true };
  const figures = { erdaRequest: ERDA_REQUEST_FRAGS, dungeons: DUNGEON_FRAGS };
  if (!job) return { known: false, input, nodes: [], invested: none, left: none, stats: [], priority: [], fdToDesired: 0, fragments: { perWeek, needed: 0, days: 0 }, order: [], icons, figures, source: "" };
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
    };
  });
  const total = (base: Cost, part: (s: HexaStatView) => Cost) => stats.reduce((acc, s) => addCost(acc, part(s)), base);
  // (the level the 6th job gives is free: not invested)
  const invested = { ...total(sum((f) => f.free, (f) => input.current[f.key]), (s) => s.spent), exact: spends.every((s) => s.exact) };
  // (a HEXA Stat node's rank-ups to come are an average, unless there are none)
  const left = { ...total(sum((f) => input.current[f.key], () => HEXA_MAX), (s) => s.left), exact: stats.every((s) => s.rank >= STAT_MAX_RANK) };

  const tables = Object.fromEntries(job.nodes.map((f) => [f.key, f.costs]));
  const rows = priority(job.order.steps, input.current, desired, tables, (n) => {
    const s = stats[n - 1]!;
    return s.rank >= STAT_MAX_RANK || s.needs ? null : { from: s.rank, to: STAT_MAX_RANK, cost: s.left };
  });
  const names: Record<string, string> = { ...Object.fromEntries(job.nodes.map((f) => [f.key, f.name])), stat1: "HEXA Stat I", stat2: "HEXA Stat II", stat3: "HEXA Stat III" };
  const icons1: Record<string, string | null> = { ...Object.fromEntries(job.nodes.map((f) => [f.key, icon(f.icon)])), stat1: icons.stat, stat2: icons.stat, stat3: icons.stat };
  let through = NO_COST;
  const listed = rows.map((r) => {
    through = addCost(through, r.cost);
    return { ...r, name: names[r.node]!, icon: icons1[r.node]!, total: through, days: daysFor(through.frags - input.owned, input.perDay, perWeek) };
  });

  // the whole order, every node to 30 and every HEXA Stat node to 20: what each step still costs adds up
  // (a HEXA Stat node the character can't take yet adds nothing, as in what's still to get)
  let owed = 0;
  const order: HexaOrderStep[] = joinRuns(job.order.steps).map((st) => {
    if ("stat" in st) {
      const i = st.stat - 1;
      const s = stats[i]!;
      if (!s.needs) owed += s.left.frags;
      return { node: `stat${st.stat}`, name: names[`stat${st.stat}`]!, icon: icons.stat, from: 0, to: STAT_MAX_RANK, cost: statLeft(i, false, 0, 0), fd: null, done: s.rank >= STAT_MAX_RANK, days: daysFor(owed - input.owned, input.perDay, perWeek) };
    }
    const t = tables[st.node]!;
    owed += levelCost(t, Math.max(st.from, input.current[st.node]), st.to).frags;
    return { node: st.node, name: names[st.node]!, icon: icons1[st.node]!, from: st.from, to: st.to, cost: levelCost(t, st.from, st.to), fd: st.fd, done: input.current[st.node] >= st.to, days: daysFor(owed - input.owned, input.perDay, perWeek) };
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
    // (HEXA Stat rows add no known final damage)
    fdToDesired: fdTogether(rows.map((r) => r.fd ?? 0)),
    fragments: { perWeek, needed, days: daysFor(needed, input.perDay, perWeek) },
    order,
    icons,
    figures,
    source: job.order.source,
  };
}
