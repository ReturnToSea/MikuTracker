import type { SymbolInput } from "@miku/shared";
import type { SymbolInfo } from "../api/types";

// The symbol calculator's maths, on the costs the server sends. Plain functions, tested on their
// own. A symbol at level 0 isn't unlocked yet: it has no time to max (nothing to forecast from).

export type SymbolState = SymbolInput;

// A symbol not entered yet: not unlocked, daily every day, no weekly clears.
export const blankState = (): SymbolState => ({ level: 0, held: 0, days: 7, weekly: 0 });

// Symbols needed from `level` to the next, and the most that can be held at it (none at level 0 or
// at the top).
export const need = (s: SymbolInfo, level: number): number => s.steps[level - 1]!.symbols;
export const room = (s: SymbolInfo, level: number): number => (level === 0 || level >= s.maxLevel ? 0 : need(s, level) - 1);

// A typed state made valid for its symbol: the level within 0 to the top, the symbols held within
// what that level can hold, days 0–7, weekly clears 0–3 (none without weekly content).
export function fit(s: SymbolInfo, st: SymbolState): SymbolState {
  const level = Math.min(s.maxLevel, Math.max(0, st.level));
  return {
    level,
    held: Math.min(room(s, level), Math.max(0, st.held)),
    days: Math.min(7, Math.max(0, st.days)),
    weekly: s.weeklyPerClear === null ? 0 : Math.min(3, Math.max(0, st.weekly)),
  };
}

// Symbols a day, averaged over the week: e.g. 5 days of 40 is 200 / 7 ≈ 28.6 a day.
export const perDay = (s: SymbolInfo, st: SymbolState): number => (s.daily * st.days + (s.weeklyPerClear ?? 0) * st.weekly) / 7;

// Symbols still needed to reach the top, with `extra` more held (null: not unlocked).
export function left(s: SymbolInfo, st: SymbolState, extra = 0): number | null {
  if (st.level === 0) return null;
  let n = -(st.held + extra);
  for (let l = st.level; l < s.maxLevel; l++) n += need(s, l);
  return Math.max(0, n);
}

// Days to the top at the entered rate: 0 when maxed, null when it never gets there (not
// unlocked, or no symbols coming in).
export function daysToMax(s: SymbolInfo, st: SymbolState, extra = 0): number | null {
  const n = left(s, st, extra);
  if (n === null) return null;
  if (n === 0) return 0;
  const rate = perDay(s, st);
  return rate > 0 ? n / rate : null;
}

// Meso to pay from the current level to the top (null: not unlocked).
export function mesoToMax(s: SymbolInfo, level: number): number | null {
  if (level === 0) return null;
  return s.steps.slice(level - 1).reduce((t, step) => t + step.meso, 0);
}

// A tab's totals: how many symbols are unlocked, its Force now and at the top, when every unlocked symbol is maxed (0: all
// already are; null: one never gets there, or none is unlocked), and the meso still to pay.
export function summary(symbols: SymbolInfo[], states: Record<string, SymbolState>) {
  const unlocked = symbols.filter((s) => states[s.id]!.level > 0);
  const days = unlocked.map((s) => daysToMax(s, states[s.id]!));
  return {
    unlocked: unlocked.length,
    force: symbols.reduce((t, s) => t + s.force[states[s.id]!.level]!, 0),
    maxForce: symbols.reduce((t, s) => t + s.force[s.maxLevel]!, 0),
    allMaxed: unlocked.length === 0 || days.includes(null) ? null : Math.max(...(days as number[])),
    meso: unlocked.reduce((t, s) => t + mesoToMax(s, states[s.id]!.level)!, 0),
  };
}

// The tab's Force day by day from today (day 0), the symbols coming in at their averaged rates,
// until every unlocked symbol is maxed or `maxDays` have passed.
export function forecast(symbols: SymbolInfo[], states: Record<string, SymbolState>, maxDays = 730): { day: number; force: number }[] {
  const now = symbols.map((s) => ({ s, level: states[s.id]!.level, held: states[s.id]!.held, rate: perDay(s, states[s.id]!) }));
  const total = () => now.reduce((t, x) => t + x.s.force[x.level]!, 0);
  const points = [{ day: 0, force: total() }];
  const growing = () => now.some((x) => x.level > 0 && x.level < x.s.maxLevel && x.rate > 0);
  for (let day = 1; day <= maxDays && growing(); day++) {
    for (const x of now) {
      if (x.level === 0) continue; // (a maxed one gains symbols but can't go higher)
      x.held += x.rate;
      while (x.level < x.s.maxLevel && x.held >= need(x.s, x.level)) {
        x.held -= need(x.s, x.level);
        x.level += 1;
      }
    }
    points.push({ day, force: total() });
  }
  return points;
}

// The symbols a selector coupon can go into: this kind's, unlocked, and with a selector at all
// (Geardock has none). (Maxed ones take nothing: they need nothing more.)
const takers = (symbols: SymbolInfo[], states: Record<string, SymbolState>, kind: SymbolInfo["kind"]) => symbols.filter((s) => s.selector === kind && states[s.id]!.level > 0);

// Where to put `coupons` so everything is maxed soonest: one at a time to the symbol with the
// longest wait (one that never gets there first; of equal waits, the earlier).
export function soonest(symbols: SymbolInfo[], states: Record<string, SymbolState>, kind: SymbolInfo["kind"], coupons: number): Record<string, number> {
  const pool = takers(symbols, states, kind).map((s) => ({ s, left: left(s, states[s.id]!)!, rate: perDay(s, states[s.id]!), give: 0 }));
  // Never more coupons than everything still needs (more change nothing), so each round some
  // symbol still needs one, and it beats any that's done: a positive wait (Infinity with nothing
  // coming in) against 0 (or NaN, which never wins).
  for (let n = Math.min(coupons, pool.reduce((t, x) => t + x.left, 0)); n > 0; n--) {
    let best = pool[0]!;
    let worst = -1;
    for (const x of pool) {
      const wait = (x.left - x.give) / x.rate;
      if (wait > worst) [best, worst] = [x, wait];
    }
    best.give += 1;
  }
  return Object.fromEntries(pool.filter((x) => x.give > 0).map((x) => [x.s.id, x.give]));
}

// Where to put `coupons` for the most Force soonest: whole level-ups, cheapest first (of equal
// ones, the earlier); what's left over goes toward the next cheapest. With the Force gained.
export function mostForce(symbols: SymbolInfo[], states: Record<string, SymbolState>, kind: SymbolInfo["kind"], coupons: number): { give: Record<string, number>; gain: number } {
  const pool = takers(symbols, states, kind).map((s) => ({ s, level: states[s.id]!.level, held: states[s.id]!.held, give: 0 }));
  let n = coupons;
  let gain = 0;
  while (n > 0) {
    let best: (typeof pool)[number] | null = null;
    let cost = Infinity;
    for (const x of pool) {
      if (x.level >= x.s.maxLevel) continue;
      const c = need(x.s, x.level) - x.held;
      if (c < cost) [best, cost] = [x, c];
    }
    if (!best) break;
    const used = Math.min(cost, n);
    best.give += used;
    n -= used;
    // A part-level only happens with the last coupons, so nothing more is counted after it.
    if (used === cost) {
      gain += best.s.force[best.level + 1]! - best.s.force[best.level]!;
      best.level += 1;
      best.held = 0;
    }
  }
  return { give: Object.fromEntries(pool.filter((x) => x.give > 0).map((x) => [x.s.id, x.give])), gain };
}

// When everything unlocked would be maxed with coupons put in as `give` says (as summary()).
export function allMaxedWith(symbols: SymbolInfo[], states: Record<string, SymbolState>, give: Record<string, number>): number | null {
  const unlocked = symbols.filter((s) => states[s.id]!.level > 0);
  const days = unlocked.map((s) => daysToMax(s, states[s.id]!, give[s.id] ?? 0));
  return unlocked.length === 0 || days.includes(null) ? null : Math.max(...(days as number[]));
}
