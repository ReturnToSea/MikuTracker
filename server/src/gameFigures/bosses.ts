import type { Difficulty } from "@miku/shared";

// GMS boss crystals: every weekly boss in game order, plus Black Mage (monthly), with each
// difficulty's crystal price and the most people a party may have.
//
// Prices are the base (non-Heroic) prices of each boss's crystal, from the MapleStory Wiki's
// "Intense Power Crystal" table (labeled GMS v270, edited 2026-10-15), checked against
// masonym.dev's boss data (src/data/bossData.js, updated 2026-08-06): they agree on every price
// except Jupiter's (Normal 593M vs 591M, Hard 1,190.6M vs 1,205.2M), where the wiki's is used and
// unconfirmed. GMS v.271's patch notes change no prices.
//
// Heroic worlds (Kronos, Hyperion and Challenger are all Heroic) pay 5× these prices (the wiki: "these
// values are quintupled in GMS Heroic Worlds"). A party splits the crystal equally, rounded down.
// Whether the ×5 comes before or after the split isn't documented; we multiply first (it changes
// at most a few meso).
//
// Party sizes: 6 unless smaller (both sources): First Adversary, Malefic Star, Limbo, Baldrix and
// Jupiter take up to 3; Extreme Lotus up to 2.
//
// Limits: 14 weekly crystals per character a week (Nexon's v.255 patch notes, updated
// 2024-12-05) and 180 per world (the wiki). Sales reset every Thursday at 00:00 UTC (v.255). The
// monthly crystal doesn't count toward the weekly limits ("only daily and monthly crystals will be
// sold" after the weekly limit, v.255); Black Mage resets on the 1st of each month (StrategyWiki;
// GMS game time is UTC).
//
// Re-check after each GMS patch.
export const BOSS_PRICES_PATCH = "v.270";

export { DIFFICULTIES, type Difficulty } from "@miku/shared"; // shared with the app

export const HEROIC_MULTIPLIER = 5;
export const WEEKLY_CRYSTALS_PER_CHARACTER = 14;
export const WEEKLY_CRYSTALS_PER_WORLD = 180;
export const MAX_PARTY = 6;

export interface BossFigure {
  id: string; // also the name of its picture in the data folder's boss-art/ (<id>.png)
  name: string;
  kind: "weekly" | "monthly";
  difficulties: { difficulty: Difficulty; price: number; maxParty: number }[]; // easiest first
}

// [difficulty, base price] pairs, every one with a party of up to 6 unless `maxParty` says less.
function boss(id: string, name: string, prices: [Difficulty, number][], maxParty: Partial<Record<Difficulty, number>> = {}, kind: BossFigure["kind"] = "weekly"): BossFigure {
  return { id, name, kind, difficulties: prices.map(([difficulty, price]) => ({ difficulty, price, maxParty: maxParty[difficulty] ?? MAX_PARTY })) };
}
const UP_TO_3 = { Easy: 3, Normal: 3, Hard: 3, Extreme: 3 };

export const BOSSES: readonly BossFigure[] = [
  boss("zakum", "Zakum", [["Chaos", 16_200_000]]),
  boss("magnus", "Magnus", [["Hard", 19_012_500]]),
  boss("hilla", "Hilla", [["Hard", 11_250_000]]),
  boss("papulatus", "Papulatus", [["Chaos", 26_450_000]]),
  boss("pierre", "Pierre", [["Chaos", 16_200_000]]),
  boss("von_bon", "Von Bon", [["Chaos", 16_200_000]]),
  boss("crimson_queen", "Crimson Queen", [["Chaos", 16_200_000]]),
  boss("vellum", "Vellum", [["Chaos", 21_012_500]]),
  boss("pink_bean", "Pink Bean", [["Chaos", 12_800_000]]),
  boss("cygnus", "Cygnus", [["Easy", 9_112_500], ["Normal", 14_450_000]]),
  boss("princess_no", "Princess No", [["Normal", 16_200_000]]),
  boss("akechi_mitsuhide", "Akechi Mitsuhide", [["Normal", 28_800_000]]),
  boss("lotus", "Lotus", [["Normal", 32_512_500], ["Hard", 88_935_000], ["Extreme", 279_500_000]], { Extreme: 2 }),
  boss("damien", "Damien", [["Normal", 33_800_000], ["Hard", 84_375_000]]),
  boss("guardian_angel_slime", "Guardian Angel Slime", [["Normal", 46_334_700], ["Chaos", 120_115_625]]),
  boss("lucid", "Lucid", [["Easy", 47_401_875], ["Normal", 50_765_625], ["Hard", 100_800_000]]),
  boss("will", "Will", [["Easy", 49_348_950], ["Normal", 55_815_000], ["Hard", 124_362_000]]),
  boss("gloom", "Gloom", [["Normal", 59_535_000], ["Chaos", 112_789_000]]),
  boss("verus_hilla", "Verus Hilla", [["Normal", 116_376_000], ["Hard", 152_421_000]]),
  boss("darknell", "Darknell", [["Normal", 63_375_000], ["Hard", 133_584_000]]),
  boss("chosen_seren", "Chosen Seren", [["Normal", 177_804_375], ["Hard", 219_312_000], ["Extreme", 847_000_000]]),
  boss("kalos_the_guardian", "Kalos the Guardian", [["Easy", 187_500_000], ["Normal", 260_000_000], ["Chaos", 520_000_000], ["Extreme", 1_040_000_000]]),
  boss("first_adversary", "First Adversary", [["Easy", 197_000_000], ["Normal", 273_000_000], ["Hard", 588_000_000], ["Extreme", 1_176_000_000]], UP_TO_3),
  boss("kaling", "Kaling", [["Easy", 206_250_000], ["Normal", 301_300_000], ["Hard", 598_000_000], ["Extreme", 1_205_200_000]]),
  boss("malefic_star", "Malefic Star", [["Normal", 290_400_000], ["Hard", 798_000_000]], UP_TO_3),
  boss("limbo", "Limbo", [["Normal", 420_000_000], ["Hard", 749_000_000]], UP_TO_3),
  boss("baldrix", "Baldrix", [["Normal", 560_000_000], ["Hard", 840_000_000]], UP_TO_3),
  boss("jupiter", "Jupiter", [["Normal", 593_000_000], ["Hard", 1_190_600_000]], UP_TO_3),
  boss("black_mage", "Black Mage", [["Hard", 900_000_000], ["Extreme", 3_600_000_000]], {}, "monthly"),
];

export const findBoss = (id: string): BossFigure | undefined => BOSSES.find((b) => b.id === id);
