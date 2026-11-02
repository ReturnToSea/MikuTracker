import { FAMILIAR_STATS, type FamiliarStat } from "@miku/shared";

// The Familiars page's maths (v3.2.0): what the lines and badges add up to (which lines a rank allows:
// @miku/shared's familiarChoices and familiarLineFits, the page's too). Pure: no database, no HTTP.

// One stat's total: from the familiars' lines, from the badges, and together. Familiar Boss DMG counts up
// to the cap (`over`: what the lines add up to, when that's more); IED sources each ignore a share of
// what's left (1 − (1 − a)(1 − b)…), so they combine instead of adding.
export interface Total {
  stat: FamiliarStat;
  familiars: number;
  badges: number;
  total: number;
  over: number | null;
}
const combined = (values: readonly number[]) => 100 * (1 - values.reduce((keep, v) => keep * (1 - v / 100), 1));
// ("other" lines: no stat of the totals)
export function familiarTotals(lines: readonly { stat: FamiliarStat | "other"; value: number }[], badges: readonly Partial<Record<FamiliarStat, number>>[], bossCap: number): Total[] {
  const fromLines = (stat: FamiliarStat) => lines.filter((l) => l.stat === stat).map((l) => l.value);
  const fromBadges = (stat: FamiliarStat) => badges.map((b) => b[stat] ?? 0).filter((v) => v > 0);
  const sum = (values: readonly number[]) => values.reduce((a, v) => a + v, 0);
  const out: Total[] = [];
  for (const stat of FAMILIAR_STATS) {
    const f = fromLines(stat);
    const b = fromBadges(stat);
    if (f.length + b.length === 0) continue;
    if (stat === "ied") {
      out.push({ stat, familiars: combined(f), badges: combined(b), total: combined([...f, ...b]), over: null });
      continue;
    }
    const fam = sum(f);
    const counted = stat === "bossDmg" ? Math.min(fam, bossCap) : fam;
    out.push({ stat, familiars: fam, badges: sum(b), total: counted + sum(b), over: counted < fam ? fam : null });
  }
  return out;
}
