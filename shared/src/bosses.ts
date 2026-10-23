// Boss difficulties, easiest first (the prices are in server/src/gameFigures/bosses.ts). Here so
// the app's input rules and the planning menu can use them too.
export const DIFFICULTIES = ["Easy", "Normal", "Hard", "Chaos", "Extreme"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

// Which crystals pay out when there are more than can be sold: the `limit` most valuable, and of
// equal ones the earlier. For each value, in the order given, whether it counts. Used by the
// server's totals and by the planning menu while a plan is being changed.
export function countedCrystals(values: readonly number[], limit: number): boolean[] {
  // JavaScript's sort keeps equal values in their order (it's stable), so the earlier comes first.
  const best = values
    .map((value, i) => ({ value, i }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
  const counts = values.map(() => false);
  for (const { i } of best) counts[i] = true;
  return counts;
}
