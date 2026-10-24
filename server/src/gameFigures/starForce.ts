// What each star of Star Force adds to an item (GMS, 30★ era). Star Force gains aren't in the game's
// files (only rates and costs are), so every source transcribes the same tables:
//   - the MapleStory Wiki's "Star Force Enhancement/Stat Tables" (armor and accessories up to 30★
//     and Lv. 250; weapons only up to 25★ and Lv. 249);
//   - masonym.dev's transcription (src/lib/equip/starforce.js), which matches the wiki everywhere
//     we compared, and marks what it guessed;
//   - StrategyWiki's "MapleStory/Spell Trace and Star Force" (older, up to 25★).
// Where they disagree, two sources agreeing win, and the disagreement is written next to the figure.
// Read 2026-10-24. Stars are counted from 1 (the gain for reaching that star).

// Stars 1–15, the same for every item level.
export const EARLY = {
  // class stats (STR and DEX on a Warrior item; all four on an item any class wears)
  stat: [2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  // Max HP for armor and accessories (not gloves, shoes, face or eye accessories)
  armorHp: [5, 5, 10, 10, 10, 15, 15, 20, 20, 25, 25, 25, 25, 25, 25],
  // Max HP and MP for weapons (their 3rd star is still 5; masonym and the wiki agree)
  weaponHp: [5, 5, 5, 10, 10, 15, 15, 20, 20, 25, 25, 25, 25, 25, 25],
  // shoes' speed and jump: +2 from 11★ (masonym and StrategyWiki; the wiki says from 12★)
  shoesSpeed: [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2],
  // gloves' attack (and magic attack, if they have it): +1 at these stars (all three sources)
  glovesAttStars: [5, 7, 9, 11, 13, 14, 15],
  // a weapon's attack (and magic attack, if it has any): +1 + 2% of its attack so far, rounded
  // down, compounding (the wiki's formula; masonym's code)
  weaponAttPercent: 2,
} as const;

// Stars 16 and up, by item level. `stat` is the class stats each star from 16★ to 22★ adds (none
// after 22★); `armorAtt` and `weaponAtt` are the attack (and magic attack) of each star from 16★,
// as far as that level's limit goes.
export interface StarBracket {
  from: number; // lowest item level of the bracket
  stat: number;
  armorAtt: number[];
  weaponAtt: number[];
  // the weapon stars (from 16★) no source confirms: masonym's guesses, to be checked
  weaponUnconfirmedFrom?: number;
}

export const BRACKETS: StarBracket[] = [
  // 17★ weapons in the first three brackets: +7 / +8 / +9 (masonym and StrategyWiki; the wiki repeats 16★'s)
  { from: 128, stat: 7, armorAtt: [7, 8, 9, 10, 11], weaponAtt: [6, 7, 7, 8, 9] },
  { from: 138, stat: 9, armorAtt: [8, 9, 10, 11, 12, 13, 15, 17, 19, 21, 22, 23, 24, 25, 26], weaponAtt: [7, 8, 8, 9, 10, 11, 12, 30, 31, 32, 33, 34, 35, 36, 37], weaponUnconfirmedFrom: 26 },
  { from: 150, stat: 11, armorAtt: [9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 23, 24, 25, 26, 27], weaponAtt: [8, 9, 9, 10, 11, 12, 13, 31, 32, 33, 34, 35, 36, 37, 38], weaponUnconfirmedFrom: 26 },
  { from: 160, stat: 13, armorAtt: [10, 11, 12, 13, 14, 15, 17, 19, 21, 23, 24, 25, 26, 27, 28], weaponAtt: [9, 9, 10, 11, 12, 13, 14, 32, 33, 34, 35, 36, 37, 38, 39], weaponUnconfirmedFrom: 26 },
  { from: 200, stat: 15, armorAtt: [12, 13, 14, 15, 16, 17, 19, 21, 23, 25, 26, 27, 28, 29, 30], weaponAtt: [13, 13, 14, 14, 15, 16, 17, 34, 35, 36, 37, 38, 39, 40, 41], weaponUnconfirmedFrom: 26 },
  // Lv. 250 weapons (Destiny): masonym, from the misaomaki simulator, which calls it a guess
  { from: 250, stat: 17, armorAtt: [14, 15, 16, 17, 18, 19, 21, 23, 25, 27, 28, 29, 30, 31, 32], weaponAtt: [16, 16, 17, 17, 18, 19, 20, 36, 37, 38], weaponUnconfirmedFrom: 16 },
];

// The most stars an item of a level can have (the wiki; masonym puts the 8★ step at Lv. 96, the wiki
// at 95). Each listed item also has its own limit from its wiki page, which wins.
export const levelStarLimit = (level: number): number => (level <= 94 ? 5 : level <= 107 ? 8 : level <= 117 ? 10 : level <= 127 ? 15 : level <= 137 ? 20 : 30);

// Overalls count twice toward the character's total Star Force.
